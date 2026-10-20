import {downloadResponse} from '../../../lib/platform/download';
import {uploadedForm,type StagedUpload} from '../../../lib/platform/uploads';
import {env} from '../../../lib/platform/runtime';
import {backfillRetainedStatistics,statisticsSourceStatus,statisticsQuery} from '../../../lib/statistics-source-service';
import {STATISTIC_METRICS} from '../../../lib/retained-statistics';
import {database} from '../../../lib/import-service';
import {getCurrentUser} from '../../../lib/auth';
import {isAdminEmail} from '../../../lib/admin';
import {pagination} from '../../../lib/pagination';
import {parseExamStatistics,statisticsTemplate,statisticsWorkbook} from '../../../lib/exam-statistics';
import {normalizeProvince,normalizeRegion,normalizeCategory,normalizeLevel,normalizeSect} from '../../../lib/scope';
import {PROVINCES} from '../../../lib/constants';
import {activeRecord} from '../../../lib/record-state';
import {toArabic} from '../../../lib/thai-numerals';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const MAX_FILE=5*1024*1024;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const now=()=>new Date().toISOString();
function where(url:URL,owner:string,alias='s'){
 const clauses=[`${alias}.owner_id=?`],args:unknown[]=[owner];
 for(const [key,column] of [['year','year'],['region','region'],['province','province'],['category','category'],['level','level'],['sect','sect']] as const){const raw=url.searchParams.get(key)||'';if(!raw)continue;let value=raw;
  if(key==='sect'&&raw==='ไม่ระบุ'){clauses.push(`COALESCE(${alias}.sect,'')=''`);continue;}
  if(key==='year'){value=toArabic(raw);if(!/^\d{4}$/.test(value))throw new Error('ปี พ.ศ. ไม่ถูกต้อง');}
  if(key==='region'){value=normalizeRegion(raw);if(!value)throw new Error('ภาคไม่ถูกต้อง');}
  if(key==='province'){value=normalizeProvince(raw);if(!PROVINCES.includes(value))throw new Error('จังหวัดไม่ถูกต้อง');}
  if(key==='category'){value=normalizeCategory(raw);if(!value)throw new Error('ประเภทไม่ถูกต้อง');}
  if(key==='level'){value=normalizeLevel(raw);if(!value)throw new Error('ชั้นไม่ถูกต้อง');}
  if(key==='sect'){value=normalizeSect(raw);if(!value)throw new Error('นิกายไม่ถูกต้อง');}
  clauses.push(`${alias}.${column}=?`);args.push(key==='year'?Number(value):value);
 }
 const q=(url.searchParams.get('temple')||'').trim().slice(0,120);if(q){const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';clauses.push(`${alias}.temple LIKE ? ESCAPE '\\'`);args.push(like);}
 return {sql:clauses.join(' AND '),args,q};
}
function xlsx(body:Uint8Array,filename:string){return downloadResponse(Uint8Array.from(body).buffer,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
export async function GET(req:Request){try{
 const user=await getCurrentUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!isAdminEmail(user.email))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);
 const url=new URL(req.url),action=url.searchParams.get('action')||'list';if(action==='template'){const wb=statisticsTemplate();return xlsx(new Uint8Array(await wb.xlsx.writeBuffer()),'แม่แบบสถิติผลสอบ.xlsx');}
 const db=database(),owner=user.userId;
 if(action==='sources')return json(await statisticsSourceStatus(db,owner));
 const f=where(url,owner),query=statisticsQuery(owner,f);
 const years=async()=>((await db.prepare(query.sql+' SELECT DISTINCT year FROM candidates ORDER BY year DESC').bind(...query.args).all()).results.map(r=>Number(r.year)));
 if(action==='years')return json({years:await years()});
 const total=Number((await db.prepare(query.sql+' SELECT COUNT(*) total FROM effective').bind(...query.args).first())?.total||0);
 const aggregate=await db.prepare(query.sql+` SELECT ${STATISTIC_METRICS.map(m=>`SUM(${m}) ${m},COUNT(*)-COUNT(${m}) missing_${m}`).join(',')} FROM effective`).bind(...query.args).first();
 const totals=Object.fromEntries(STATISTIC_METRICS.map(m=>[m,aggregate?.[m]??null])),missing=Object.fromEntries(STATISTIC_METRICS.map(m=>[m,Number(aggregate?.['missing_'+m]||0)]));
 if(action==='export'){
  if(total>20000)throw new Error('สถิติเกิน ๒๐,๐๐๐ แถว กรุณาเพิ่มตัวกรองก่อนส่งออก');
  const stats=await db.prepare(query.sql+' SELECT * FROM effective ORDER BY year DESC,region,province,category,level,temple').bind(...query.args).all();
  const peopleFilter=["r.owner_id=?","b.status='committed'",activeRecord('r')],peopleArgs:unknown[]=[owner];
  for(const [key,column] of [['year','year'],['region','region'],['province','province'],['category','category'],['level','level'],['sect','sect']] as const){const value=url.searchParams.get(key);if(!value)continue;if(key==='sect'&&value==='ไม่ระบุ'){peopleFilter.push("COALESCE(r.sect,'')=''");continue;}const normalized=key==='year'?Number(toArabic(value)):key==='province'?normalizeProvince(value):key==='region'?normalizeRegion(value):key==='category'?normalizeCategory(value):key==='level'?normalizeLevel(value):normalizeSect(value);peopleFilter.push(`r.${column}=?`);peopleArgs.push(normalized);}
  if(f.q){const like='%'+f.q.replace(/[\\%_]/g,'\\$&')+'%';peopleFilter.push("(r.temple LIKE ? ESCAPE '\\' OR r.school LIKE ? ESCAPE '\\')");peopleArgs.push(like,like);}
  const peopleTotal=Number((await db.prepare(`SELECT COUNT(*) total FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${peopleFilter.join(' AND ')}`).bind(...peopleArgs).first() as {total?:number}|null)?.total||0);if(peopleTotal>20000)throw new Error('รายชื่อที่ตรงตัวกรองเกิน ๒๐,๐๐๐ รายการ กรุณาระบุชั้น จังหวัด หรือวัดเพิ่ม');
  const names=await db.prepare(`SELECT r.year,r.region,r.province,r.category,r.level,r.sect,r.jurisdiction,r.title,r.first_name,r.dharma_name,r.last_name,r.birth_year,r.age_at_exam,r.vassa,r.temple,r.subdistrict,r.school,r.district,r.sequence FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${peopleFilter.join(' AND ')} ORDER BY r.year DESC,r.province,r.category,r.level,r.temple,r.sequence,r.first_name`).bind(...peopleArgs).all();
  const wb=await statisticsWorkbook(stats.results as Record<string,unknown>[],names.results as Record<string,unknown>[]);return xlsx(new Uint8Array(await wb.xlsx.writeBuffer()),'สถิติผลสอบและรายชื่อ.xlsx');
 }
 if(action!=='list')return json({error:'ไม่รองรับคำขอนี้'},400);
 const {pageSize,page,pages,offset}=pagination(total,url.searchParams),rows=await db.prepare(query.sql+` SELECT s.*,
  (SELECT COUNT(*) FROM records r JOIN batches b ON b.id=r.batch_id
   WHERE r.owner_id=s.owner_id AND b.owner_id=r.owner_id AND b.status='committed' AND ${activeRecord('r')}
    AND r.year=s.year AND r.province=s.province AND r.category=s.category AND r.level=s.level
    AND (s.sect='' OR r.sect=s.sect)
    AND (TRIM(s.temple)='' OR TRIM(s.temple)='รวมทั้งจังหวัด' OR TRIM(r.temple)=TRIM(s.temple) OR TRIM(r.school)=TRIM(s.temple))
  ) passed_list_count
  FROM effective s ORDER BY s.year DESC,s.region,s.province,s.category,s.level,s.temple LIMIT ? OFFSET ?`).bind(...query.args,pageSize,offset).all();
 const conflicts=Number((await db.prepare(query.sql+' SELECT COUNT(*) count FROM conflicts').bind(...query.args).first())?.count||0);
 return json({items:rows.results,total,page,pages,pageSize,totals,missing,years:await years(),sync:await statisticsSourceStatus(db,owner),conflicts});
 }catch(e){return json({error:e instanceof Error?e.message:'โหลดทะเบียนสถิติไม่สำเร็จ'},400);}}
export async function POST(req:Request){try{
 const user=await getCurrentUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!isAdminEmail(user.email))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);
 const jsonBody=req.headers.get('content-type')?.includes('application/json')?await req.json() as {action?:string;id?:string;upload?:StagedUpload}:null;
 if(jsonBody&&jsonBody.action!=='import-upload'){
  const body=jsonBody,db=database(),owner=user.userId;
  if(!['scan-existing','rescan-source'].includes(body.action||''))return json({error:'ไม่รองรับคำขอนี้'},400);
  if(!env.BUCKET)throw new Error('ระบบจัดเก็บไฟล์ยังไม่พร้อม');
  if(body.action==='rescan-source'){
   const id=String(body.id||'');const batch=await db.prepare("SELECT id FROM batches WHERE id=? AND owner_id=? AND status IN ('committed','archived')").bind(id,owner).first();if(!batch)return json({error:'ไม่พบไฟล์ผลสอบของผู้ดูแล'},404);
   await db.prepare("UPDATE statistics_sources SET status='pending',error='' WHERE batch_id=? AND owner_id=? AND lease_until<?").bind(id,owner,Date.now()).run();
  }
  const result=await backfillRetainedStatistics(db,env.BUCKET,{owner,...(body.action==='rescan-source'?{id:String(body.id)}:{})});
  return json({ok:true,...result,sync:await statisticsSourceStatus(db,owner)});
 }
 if(!req.headers.get('content-type')?.includes('multipart/form-data')&&jsonBody?.action!=='import-upload')return json({error:'เลือกไฟล์ Excel เพื่ออัปโหลด'},400);if(Number(req.headers.get('content-length'))>MAX_FILE+65536)throw new Error('ไฟล์ใหญ่เกิน ๕ MB');
 const form=jsonBody?.action==='import-upload'?await uploadedForm(jsonBody.upload||{},user.userId,MAX_FILE):await req.formData(),file=form.get('file');if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.xlsx')||file.size<1||file.size>MAX_FILE)throw new Error('เลือกไฟล์ Excel .xlsx ขนาดไม่เกิน ๕ MB');
 const rawYear=toArabic(String(form.get('year')||'')).trim(),defaultYear=rawYear?Number(rawYear):0;if(rawYear&&(!/^\d{4}$/.test(rawYear)||defaultYear<2400||defaultYear>3000))throw new Error('ปี พ.ศ. เริ่มต้นไม่ถูกต้อง');
 const parsed=parseExamStatistics(new Uint8Array(await file.arrayBuffer()),defaultYear),owner=user.userId,db=database(),stamp=now(),auditId=crypto.randomUUID();
 for(let offset=0;offset<parsed.length;offset+=40){const part=parsed.slice(offset,offset+40),statements=part.map(r=>db.prepare(`INSERT INTO exam_statistics(id,owner_id,year,region,province,category,level,sect,temple,sent,absent,retained,passed,failed,other,note,source_file,source_sheet,source_row,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,year,region,province,category,level,sect,temple) DO UPDATE SET sent=excluded.sent,absent=excluded.absent,retained=excluded.retained,passed=excluded.passed,failed=excluded.failed,other=excluded.other,note=excluded.note,source_file=excluded.source_file,source_sheet=excluded.source_sheet,source_row=excluded.source_row,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),owner,r.year,r.region,r.province,r.category,r.level,r.sect,r.temple,r.sent,r.absent,r.retained,r.passed,r.failed,r.other,r.note,file.name.slice(0,250),r.sheet,r.sourceRow,stamp,stamp));await db.batch(statements);}
 await db.prepare('INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').bind(auditId,owner,'statistics-import',auditId,JSON.stringify({filename:file.name,rows:parsed.length}),stamp).run();return json({ok:true,imported:parsed.length,filename:file.name,years:[...new Set(parsed.map(r=>r.year))].sort((a,b)=>b-a)});
 }catch(e){return json({error:e instanceof Error?e.message:'นำเข้าสถิติไม่สำเร็จ'},400);}}
