import {pagination} from '../../../lib/pagination';
import {getChatGPTUser} from '../../chatgpt-auth';
import {isAdminEmail} from '../../../lib/admin';
import {database} from '../../../lib/import-service';
import {SECTS} from '../../../lib/constants';
import {fingerprint} from '../../../lib/scope';
import {activeRecord} from '../../../lib/record-state';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const groupFields=['province','source_province','district','subdistrict','temple','school','jurisdiction','sect'] as const;
function scope(url:URL,owner:string){const clauses=['r.owner_id=?',"b.status='committed'",activeRecord('r')],args:unknown[]=[owner];for(const [key,col]of [['province','province'],['year','year'],['batch','batch_id']] as const){const v=url.searchParams.get(key);if(v){clauses.push(`r.${col}=?`);args.push(v.slice(0,500));}}
 const q=(url.searchParams.get('q')||'').trim().slice(0,120);if(q){const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';clauses.push("(r.temple LIKE ? ESCAPE '\\' OR r.school LIKE ? ESCAPE '\\' OR r.district LIKE ? ESCAPE '\\' OR r.subdistrict LIKE ? ESCAPE '\\')");args.push(term,term,term,term);}
 if(url.searchParams.get('pending')!=='false')clauses.push("(r.sect='' OR r.sect_reviewed=0)");return {where:clauses.join(' AND '),args};}
export async function GET(req:Request){try{
 const user=await getChatGPTUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!isAdminEmail(user.email))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);
 const url=new URL(req.url),db=database(),{where,args}=scope(url,user.userId),columns=groupFields.map(k=>'r.'+k).join(','),from=`FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${where}`;
 const total=Number((await db.prepare(`SELECT COUNT(*) total FROM (SELECT 1 ${from} GROUP BY ${columns})`).bind(...args).first())?.total||0);
 const {pageSize,pages,page,offset}=pagination(total,url.searchParams);
 const rows=await db.prepare(`SELECT ${columns},COUNT(*) count,SUM(r.sect_reviewed) reviewed,COUNT(DISTINCT r.batch_id) files,MIN(r.year) first_year,MAX(r.year) last_year ${from} GROUP BY ${columns} ORDER BY r.province,r.district,r.subdistrict,r.temple,r.school,r.sect LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all();return json({items:rows.results,total,page,pages,pageSize});
 }catch(e){console.error(e);return json({error:'โหลดกลุ่มวัดไม่สำเร็จ'},400);}}
export async function POST(req:Request){try{
 const user=await getChatGPTUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!isAdminEmail(user.email))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);
 const body=await req.json() as {group:Record<string,unknown>;filters:Record<string,string>;sect:string;reason:string;expectedCount:number};if(!SECTS.includes(body.sect))throw new Error('กรุณาเลือกมหานิกายหรือธรรมยุต');const reason=String(body.reason||'').trim();if(reason.length<5||reason.length>500)throw new Error('ระบุเหตุผลหรือหลักฐานอย่างน้อย 5 ตัวอักษร');
 if(!body.group||(!body.group.temple&&!body.group.school))throw new Error('กลุ่มไม่มีชื่อวัดหรือสำนักเรียน โปรดแก้ไขเป็นรายชื่อ');
 const url=new URL(req.url);url.search='';for(const key of ['province','year','batch','q','pending'])if(typeof body.filters?.[key]==='string')url.searchParams.set(key,body.filters[key]);
 const {where,args}=scope(url,user.userId);const match=groupFields.map(k=>{const value=body.group[k];if(typeof value!=='string'||value.length>500)throw new Error('ขอบเขตกลุ่มไม่ถูกต้อง');args.push(value);return `r.${k}=?`;}).join(' AND ');
 const db=database(),rows=await db.prepare(`SELECT r.* FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${where} AND ${match}`).bind(...args).all();if(!rows.results.length||rows.results.length!==body.expectedCount)throw new Error('จำนวนรายชื่อเปลี่ยนแล้ว กรุณาโหลดกลุ่มใหม่ก่อนบันทึก');
 const patches=rows.results.map(r=>({id:r.id,old:String(r.fingerprint),oldSect:String(r.sect),fingerprint:fingerprint({year:Number(r.year),province:String(r.province),category:String(r.category),level:String(r.level),title:String(r.title),firstName:String(r.first_name),lastName:String(r.last_name),dharmaName:String(r.dharma_name),temple:String(r.temple),district:String(r.district),subdistrict:String(r.subdistrict||''),school:String(r.school),region:String(r.region),sect:body.sect})}));
 const payload=JSON.stringify(patches),time=new Date().toISOString();
 // Compare the complete snapshot inside one D1 transaction; concurrent edits cannot partially update a group.
 const guard=`(SELECT COUNT(*) FROM records r JOIN batches b ON b.id=r.batch_id JOIN json_each(?) j ON r.id=json_extract(j.value,'$.id') WHERE r.owner_id=? AND b.status='committed' AND ${activeRecord('r')} AND r.fingerprint=json_extract(j.value,'$.old') AND r.sect=json_extract(j.value,'$.oldSect'))=?`;
 const result=await db.batch([
 db.prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT lower(hex(randomblob(16))),?,'sect-review',json_extract(value,'$.id'),json_object('reason',?,'beforeSect',json_extract(value,'$.oldSect'),'afterSect',?,'groupCount',?),? FROM json_each(?) WHERE ${guard}`).bind(user.userId,reason,body.sect,patches.length,time,payload,payload,user.userId,patches.length),
 db.prepare(`UPDATE records SET sect=?,sect_reviewed=1,fingerprint=(SELECT json_extract(value,'$.fingerprint') FROM json_each(?) WHERE json_extract(value,'$.id')=records.id),updated_at=? WHERE owner_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${guard}`).bind(body.sect,payload,time,user.userId,payload,payload,user.userId,patches.length)
 ]);if(Number(result[1].meta.changes)!==patches.length)throw new Error('มีผู้แก้ไขข้อมูลระหว่างตรวจ กรุณาโหลดกลุ่มใหม่');return json({updated:patches.length,sect:body.sect});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'บันทึกนิกายไม่สำเร็จ'},400);}}
