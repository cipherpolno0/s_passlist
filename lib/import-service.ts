import {auditDatabase} from './audit-context';
import {applyProvinceRegion} from './province-regions';
import { env } from 'cloudflare:workers';
import { publicationErrors,databaseRecord,deferSectRecord } from './classification';
import {fingerprint} from './scope';
import {SECTS,type ParsedFile} from './constants';
import {checkOrganizationRecords} from './organization-registry-check';
import {ORGANIZATION_VERSION} from './organization-registry';
export function database(){if(!env.DB)throw new Error('ฐานข้อมูลไม่พร้อม');return auditDatabase();}
export function event(owner:string,action:string,target:string,detail:unknown){return database().prepare('INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,action,target,JSON.stringify(detail),new Date().toISOString());}
export async function ownedBatch(id:string,owner:string){const b=await database().prepare('SELECT * FROM batches WHERE id=? AND owner_id=?').bind(id,owner).first();if(!b)throw new Error('ไม่พบชุดข้อมูล');return b;}
export async function commitImport(id:string,owner:string,options:{publish:boolean;automatic:boolean;excludeErrors:boolean;parsed?:ParsedFile;deferSect?:boolean}){
 const db=database(),b=await ownedBatch(id,owner);if(b.status==='committed')return {done:true,inserted:b.inserted,total:b.valid,visibility:b.visibility};
 if(!['draft','importing'].includes(String(b.status)))throw new Error('ชุดข้อมูลไม่พร้อมนำเข้า');
 const object=options.parsed?null:await env.BUCKET?.get(`preview/${id}`);const p=options.parsed||await object?.json<ParsedFile>();if(!p)throw new Error('ไม่พบข้อมูลตรวจทาน');
 const firstChunk=Number(b.inserted)===0&&b.status==='draft';
 if(!firstChunk&&String(b.visibility)!==(options.publish?'published':'internal'))throw new Error('การตั้งค่าการเผยแพร่เปลี่ยนระหว่างนำเข้า กรุณาดำเนินการต่อด้วยตัวเลือกเดิม');
 if(firstChunk){
 for(const r of p.records){r.province??=String(b.province);r.year??=Number(b.year);r.region??='';r.sect??='';r.jurisdiction??='';r.schoolKind??='';}
 for(const r of p.records){const mapping=applyProvinceRegion(r);if(mapping.filled)r.fingerprint=fingerprint(r);}
 if(!p.organizationSummary?.ready||p.organizationSummary.version!==ORGANIZATION_VERSION){p.organizationSummary=await checkOrganizationRecords(db,p.records);if(!p.organizationSummary.ready)throw new Error('ทะเบียนองค์กรและสถานศึกษายังนำเข้าไม่ครบ');await env.BUCKET?.put(`preview/${id}`,JSON.stringify(p));}
 }
 if(options.deferSect&&firstChunk){
 for(const r of p.records){if(!(r.registryMatch?.status==='matched'&&r.sectReviewed&&SECTS.includes(r.sect)))deferSectRecord(r);r.fingerprint=fingerprint(r);}
 const valid=p.records.filter(r=>!r.errors.length).length;
 await env.BUCKET?.put(`preview/${id}`,JSON.stringify(p));await db.prepare('UPDATE batches SET valid=?,issues=? WHERE id=? AND owner_id=?').bind(valid,p.records.filter(r=>r.errors.length||r.warnings.length).length,id,owner).run();
 }
 if(options.automatic&&firstChunk&&!options.deferSect&&p.autoReady!==true)throw new Error('ข้อมูลยังไม่ผ่านเกณฑ์อัตโนมัติ กรุณาตรวจรายงาน');
 const valid=p.records.filter(r=>!r.errors.length);if(!valid.length)throw new Error('ไม่มีรายชื่อที่ผ่านเกณฑ์');
 if(firstChunk&&valid.length!==p.records.length&&!options.excludeErrors)throw new Error('ต้องยืนยันการแยกแถวผิดพลาด');
 if(firstChunk&&options.publish){const errors=Array.from(new Set(valid.flatMap(publicationErrors)));if(errors.length)throw new Error('ยังเผยแพร่ไม่ได้: '+errors.join(' · '));}
 const chunkSize=p.records.length>10000?1000:400,chunk=valid.slice(Number(b.inserted),Number(b.inserted)+chunkSize),rows=chunk.map(r=>({id:`${id}_${r.id}`,batch_id:id,owner_id:owner,province:r.province,year:r.year,region:r.region,sect:r.sect,category:r.category,level:r.level,title:r.title,first_name:r.firstName,last_name:r.lastName,dharma_name:r.dharmaName,temple:r.temple,district:r.district,source_province:r.sourceProvince,school:r.school,jurisdiction:r.jurisdiction,school_kind:r.schoolKind,subdistrict:r.subdistrict||'',sect_reviewed:r.sectReviewed?1:0,note:r.note,sheet:r.sheet,source_row:r.row,sequence:r.sequence,fingerprint:r.fingerprint,vassa:r.vassa??null,birth_year:r.birthYear??null,age_at_exam:r.ageAtExam??null,birth_year_estimated:r.birthYearEstimated?1:0,age_estimated:r.ageEstimated?1:0}));
 const cols=['vassa','birth_year','age_at_exam','birth_year_estimated','age_estimated','id','batch_id','owner_id','province','year','region','sect','category','level','title','first_name','last_name','dharma_name','temple','district','source_province','school','jurisdiction','school_kind','subdistrict','sect_reviewed','note','sheet','source_row','sequence','fingerprint'];
 await db.batch([db.prepare("UPDATE batches SET status='importing',visibility=? WHERE id=? AND owner_id=? AND status='draft'").bind(options.publish?'published':'internal',id,owner),db.prepare(`INSERT OR IGNORE INTO records(${cols.join(',')}) SELECT ${cols.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE EXISTS(SELECT 1 FROM batches WHERE id=? AND owner_id=? AND status='importing')`).bind(JSON.stringify(rows),id,owner),db.prepare('UPDATE batches SET inserted=(SELECT COUNT(*) FROM records WHERE batch_id=?) WHERE id=? AND owner_id=?').bind(id,id,owner)]);
 const current=await ownedBatch(id,owner),done=Number(current.inserted)===Number(current.valid);
 if(done)await db.batch([db.prepare("UPDATE batches SET status='committed',visibility=?,committed_at=? WHERE id=? AND owner_id=? AND status='importing' AND inserted=valid").bind(options.publish?'published':'internal',new Date().toISOString(),id,owner),event(owner,'commit',id,{count:current.inserted,visibility:options.publish?'published':'internal',automatic:options.automatic})]);
 return {done,inserted:current.inserted,total:current.valid,visibility:done&&options.publish?'published':'internal'};
}
export async function publishBatch(id:string,owner:string,publish:boolean){
 const b=await ownedBatch(id,owner);if(b.status!=='committed')throw new Error('ต้องนำเข้าให้เสร็จก่อนเผยแพร่');
 if(publish){const data=await database().prepare('SELECT first_name,year,province,region,sect,category,level,jurisdiction,school_kind,school,sect_reviewed FROM records WHERE batch_id=? AND owner_id=?').bind(id,owner).all();if(!data.results.length)throw new Error('ไม่มีรายชื่อ');const errors=Array.from(new Set(data.results.flatMap(r=>publicationErrors(databaseRecord(r)))));if(errors.length)throw new Error('ยังเผยแพร่ไม่ได้: '+errors.join(' · '));}
 await database().batch([database().prepare('UPDATE batches SET visibility=? WHERE id=? AND owner_id=?').bind(publish?'published':'internal',id,owner),event(owner,publish?'publish':'unpublish',id,{})]);
}
