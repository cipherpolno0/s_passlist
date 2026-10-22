import {auditDatabase,canManageData,dataOwnerId} from '../../../lib/audit-context';
import {pagination,ADMIN_RECORD_PAGE_SIZES} from '../../../lib/pagination';
import {applyProvinceRegion} from '../../../lib/province-regions';
import {certificateNumber} from '../../../lib/certificate-number';
import {thaiWorkbookCopy} from '../../../lib/thai-workbook';
import {toThai,toArabic} from '../../../lib/thai-numerals';
import {findCentralSchool,centralKey} from '../../../lib/central-schools';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {commitImport,publishBatch} from '../../../lib/import-service';
import {publicationErrors,databaseRecord,deferSectRecord} from '../../../lib/classification';
import { MAX_FILE, PROVINCES, CATEGORIES, LEVELS, SECTS, type ParsedFile, type PassRecord, type ImportOptions } from '../../../lib/constants';
import { parseExcel, createTemplate, clean } from '../../../lib/excel';
import {normalizeProvince,normalizeRegion,normalizeSect,fingerprint} from '../../../lib/scope';
import {checkTempleRecords} from '../../../lib/temple-registry-check';
import {checkOrganizationRecords} from '../../../lib/organization-registry-check';
import {ORGANIZATION_VERSION} from '../../../lib/organization-registry';
import {activeRecord,trashedRecord} from '../../../lib/record-state';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const db=()=>{if(!env.DB)throw new Error('ยังไม่พร้อมใช้งานฐานข้อมูล');return auditDatabase();};
const bucket=()=>{if(!env.BUCKET)throw new Error('ยังไม่พร้อมจัดเก็บไฟล์');return env.BUCKET;};
const now=()=>new Date().toISOString();
const audit=(owner:string,action:string,target:string,detail:unknown)=>db().prepare('INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,action,target,JSON.stringify(detail),now());
async function owned(id:string,owner:string){const b=await db().prepare('SELECT * FROM batches WHERE id=? AND owner_id=?').bind(id,owner).first();if(!b)throw new Error('ไม่พบชุดข้อมูล');return b;}
function groupRecords(records:PassRecord[]){const groups:ParsedFile['groups']=[],map=new Map<string,ParsedFile['groups'][number]>();for(const r of records){const k=[r.sect,r.region,r.province,r.category,r.level,r.jurisdiction,r.school].join('|');let g=map.get(k);if(!g){g={province:r.province,region:r.region,sect:r.sect,category:r.category,level:r.level,school:r.school,schoolKind:r.schoolKind,jurisdiction:r.jurisdiction,count:0};groups.push(g);map.set(k,g);}g.count++;}groups.sort((a,b)=>(a.sect==='มหานิกาย'?0:1)-(b.sect==='มหานิกาย'?0:1)||Number(a.region.replace('ภาค ','').split('-')[0]||0)-Number(b.region.replace('ภาค ','').split('-')[0]||0)||a.province.localeCompare(b.province,'th')||CATEGORIES.indexOf(a.category)-CATEGORIES.indexOf(b.category)||LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level)||a.school.localeCompare(b.school,'th'));return groups;}
function filters(url:URL,owner:string){const w=['r.owner_id=?',"b.status='committed'",activeRecord('r')],args:unknown[]=[owner];for(const [key,col] of [['province','province'],['year','year'],['category','category'],['level','level'],['region','region'],['sect','sect'],['jurisdiction','jurisdiction'],['schoolKind','school_kind'],['school','school']] as const){const raw=url.searchParams.get(key);const v=key==='year'&&raw?toArabic(raw):key==='province'&&raw?normalizeProvince(raw)||raw:raw;if(v){if(key==='province'&&v==='กรุงเทพมหานคร'){w.push("(r.province=? OR (r.province='' AND r.jurisdiction='ส่วนกลาง'))");args.push(v);}else if(key==='school'&&findCentralSchool(v)){w.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(r.school,'สำนักเรียนส่วนกลาง',''),'สำนักเรียน',''),'สำนักศาสนศึกษา',''),' ',''),'–','-'),'—','-')=?");args.push(centralKey(v));}else if((key==='region'||key==='sect')&&v==='ไม่ระบุ')w.push(`COALESCE(r.${col},'')=''`);else if(key==='region'&&/^ภาค (?:[1-9]|1[0-8])$/.test(v)){w.push("(r.region=? OR ('-'||REPLACE(r.region,'ภาค ','')||'-') LIKE ?)");args.push(v,'%-'+v.replace('ภาค ','')+'-%');}else{w.push(`r.${col}=?`);args.push(v);}}}
 const q=(url.searchParams.get('q')||'').trim().slice(0,150);if(q){for(const term of q.split(/\s+/).slice(0,5)){const p='%'+term.replace(/[\\%_]/g,'\\$&')+'%';w.push("(r.first_name LIKE ? ESCAPE '\\' OR r.last_name LIKE ? ESCAPE '\\' OR r.dharma_name LIKE ? ESCAPE '\\' OR r.temple LIKE ? ESCAPE '\\' OR r.school LIKE ? ESCAPE '\\')");args.push(p,p,p,p,p);}}
 return {where:w.join(' AND '),args};}
const csv=(rows:unknown[][])=>'\ufeff'+rows.map(row=>row.map(v=>{let s=toThai(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');
const download=(body:BodyInit,name:string,type:string)=>new Response(body,{headers:{'Content-Type':type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:Request){try{
 const user=await getChatGPTUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!canManageData(user))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);const owner=dataOwnerId(user),url=new URL(req.url),action=url.searchParams.get('action')||'search';
 if(action==='template')return download((thaiWorkbookCopy(new Uint8Array(await createTemplate()))).buffer as ArrayBuffer,'passlist-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 if(action==='stats'){
 const stat=await db().prepare(`SELECT COUNT(*) total,COUNT(DISTINCT r.province) provinces,COUNT(DISTINCT r.year) years,SUM(CASE WHEN category='นักธรรม' THEN 1 ELSE 0 END) monastic,SUM(CASE WHEN category='ธรรมศึกษา' THEN 1 ELSE 0 END) lay,COUNT(DISTINCT NULLIF(r.region,'')) regions,SUM(CASE WHEN sect='มหานิกาย' THEN 1 ELSE 0 END) maha,SUM(CASE WHEN sect='ธรรมยุต' THEN 1 ELSE 0 END) dhammayut,SUM(CASE WHEN sect='' THEN 1 ELSE 0 END) unknown_sect FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.owner_id=? AND b.status='committed' AND ${activeRecord('r')}`).bind(owner).first();
 const years=await db().prepare(`SELECT DISTINCT r.year FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.owner_id=? AND b.status='committed' AND ${activeRecord('r')} ORDER BY r.year DESC`).bind(owner).all();
 const regions=await db().prepare(`SELECT DISTINCT r.region FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.owner_id=? AND b.status='committed' AND r.region<>'' AND ${activeRecord('r')} ORDER BY r.region`).bind(owner).all();
 const batch=await db().prepare("SELECT COUNT(*) count,MAX(committed_at) latest FROM batches WHERE owner_id=? AND status='committed'").bind(owner).first();return json({stats:stat,years:years.results.map(x=>x.year),regions:regions.results.map(x=>x.region),batch,user:{name:user.displayName,email:user.email}});
 }
 if(action==='batches'){
 const total=Number((await db().prepare('SELECT COUNT(*) count FROM batches WHERE owner_id=?').bind(owner).first())?.count||0),{pageSize,pages,page,offset}=pagination(total,url.searchParams);
 const items=await db().prepare('SELECT * FROM batches WHERE owner_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?').bind(owner,pageSize,offset).all();return json({items:items.results,total,page,pages,pageSize});
 }
 if(action==='trash'){
 const where=`r.owner_id=? AND ${trashedRecord('r')}`,from=`FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${where}`;
 const total=Number((await db().prepare(`SELECT COUNT(*) count ${from}`).bind(owner).first())?.count||0);
 const {pageSize,pages,page,offset}=pagination(total,url.searchParams);
 const items=await db().prepare(`SELECT r.*,b.filename,b.status batch_status FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${where} ORDER BY r.updated_at DESC,r.year DESC,r.first_name,r.id LIMIT ? OFFSET ?`).bind(owner,pageSize,offset).all();
 return json({items:items.results,total,page,pages,pageSize});
 }
 if(action==='preview'||action==='issues'||action==='source'||action==='thai-source'||action==='registry-report'){
 const b=await owned(url.searchParams.get('id')||'',owner);
 if(action==='thai-source'){const f=await bucket().get(`source/${b.id}`);if(!f)throw new Error('ไม่พบต้นฉบับ');const bytes=thaiWorkbookCopy(new Uint8Array(await f.arrayBuffer()));return download(bytes,'เลขไทย-'+toThai(b.filename),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
 if(action==='source'){const f=await bucket().get(`source/${b.id}`);if(!f)throw new Error('ไม่พบต้นฉบับ');return download(f.body,String(b.filename),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
 const object=await bucket().get(`preview/${b.id}`);if(!object)throw new Error('ไม่พบข้อมูลตรวจทาน กรุณาอัปโหลดใหม่');const p=await object.json<ParsedFile>();
 for(const r of p.records){r.province??=String(b.province);r.year??=Number(b.year);r.region??='';r.sect??='';r.jurisdiction??='';r.schoolKind??='';}
 const regionRefreshed=p.records.map(r=>{const mapping=applyProvinceRegion(r);if(mapping.filled)r.fingerprint=fingerprint(r);return mapping.changed;}).some(Boolean);
 const deferredPreview=action==='preview'&&url.searchParams.get('deferSect')==='true'&&b.status==='draft'&&Number(b.inserted)===0;
 if(deferredPreview)for(const r of p.records)if(!(r.registryMatch?.status==='matched'&&r.sectReviewed&&SECTS.includes(r.sect)))deferSectRecord(r);
 const needsOrganizationRefresh=!p.organizationSummary?.ready||p.organizationSummary.version!==ORGANIZATION_VERSION;
 if(needsOrganizationRefresh)p.organizationSummary=await checkOrganizationRecords(db(),p.records);
 const needsRegistryRefresh=regionRefreshed||!p.registrySummary?.ready||typeof p.registrySummary.autoFilledRecords!=='number'||deferredPreview||needsOrganizationRefresh;
 if(needsRegistryRefresh){const registrySummary=await checkTempleRecords(db(),owner,p.records);p.registrySummary=registrySummary;if(registrySummary.ready){p.groups=groupRecords(p.records);p.holds=Array.from(new Set([...p.warnings,...p.records.flatMap(r=>[...r.errors,...r.warnings,...publicationErrors(r)])]));p.autoReady=p.holds.length===0;await bucket().put(`preview/${b.id}`,JSON.stringify(p));if(b.status==='draft'&&Number(b.inserted)===0){const stored=JSON.parse(String(b.summary||'{}'));stored.registrySummary=registrySummary;stored.organizationSummary=p.organizationSummary;stored.groups=p.groups;const issues=p.records.filter(r=>r.errors.length||r.warnings.length).length;await db().prepare('UPDATE batches SET issues=?,summary=? WHERE id=? AND owner_id=?').bind(issues,JSON.stringify(stored),b.id,owner).run();b.issues=issues;b.summary=JSON.stringify(stored);b.valid=p.records.filter(r=>!r.errors.length).length;}}}
 if(action==='issues')return download(csv([['ชีต','แถว','ลำดับ','ภาค','จังหวัดสนามสอบ','นิกาย','วัด','ตำบล','อำเภอ','จังหวัดสังกัด','ผลเทียบทะเบียนวัด','นิกายทะเบียน','เขตข้อมูล','ชนิดสำนักเรียน','สำนักเรียน','ประเภท','ระดับ','ชื่อ','นามสกุล','ข้อผิดพลาด','ข้อสังเกต'],...p.records.filter(r=>r.errors.length||r.warnings.length).map(r=>[r.sheet,r.row,r.sequence,r.region,r.province,r.sect,r.temple,r.subdistrict,r.district,r.sourceProvince,r.registryMatch?.status||'',r.registryMatch?.sects.join(' / ')||'',r.jurisdiction,r.schoolKind,r.school,r.category,r.level,r.firstName,r.lastName,r.errors.join('; '),r.warnings.join('; ')])]),'passlist-review.csv','text/csv; charset=utf-8');
 if(action==='registry-report'){if(!p.registrySummary?.ready)throw new Error('ทะเบียนวัดยังติดตั้งไม่ครบ จึงยังสร้างรายงานเทียบไม่ได้');return download(csv([['ชีต','แถว','ชื่อ','นามสกุล','วัด','ตำบล','อำเภอ','จังหวัดสังกัด','นิกายในไฟล์','สถานะเทียบทะเบียนวัด','จำนวนนิกายที่พบ','นิกายในทะเบียน','เติมตำบลอัตโนมัติ','เติมจังหวัดอัตโนมัติ','เติมนิกายอัตโนมัติ','ผลเทียบองค์กร/สถานศึกษา','แถวทะเบียนองค์กร','เติมอำเภออัตโนมัติ'],...p.records.map(r=>[r.sheet,r.row,r.firstName,r.lastName,r.temple,r.subdistrict,r.district,r.sourceProvince,r.sourceSect||r.sect,r.registryMatch?.status||'ไม่มีผลตรวจ',r.registryMatch?.sects.length||0,r.registryMatch?.sects.join(' / ')||'',(r.registryMatch?.autoFilled?.includes('subdistrict')||r.organizationMatch?.autoFilled?.includes('subdistrict'))?'ใช่':'',(r.registryMatch?.autoFilled?.includes('province')||r.organizationMatch?.autoFilled?.includes('province'))?'ใช่':'',r.registryMatch?.autoFilled?.includes('sect')?'ใช่':'',r.organizationMatch?.status||'ไม่มีผลตรวจ',r.organizationMatch?.sourceRows.join(' / ')||'',r.organizationMatch?.autoFilled?.includes('district')?'ใช่':''])]),'temple-registry-check.csv','text/csv; charset=utf-8');}
 const issues=p.records.filter(r=>r.errors.length||r.warnings.length),recordPaging=pagination(p.records.length,url.searchParams),issuePaging=pagination(issues.length,url.searchParams);
 return json({batch:b,...p,records:p.records.slice(recordPaging.offset,recordPaging.offset+recordPaging.pageSize),issues:issues.slice(issuePaging.offset,issuePaging.offset+issuePaging.pageSize),recordsTotal:p.records.length,issueTotal:issues.length,recordPage:recordPaging.page,recordPages:recordPaging.pages,issuePage:issuePaging.page,issuePages:issuePaging.pages,pageSize:recordPaging.pageSize});
 }
 if(action==='detail'){
 const record=await db().prepare(`SELECT r.*,b.filename FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.id=? AND r.owner_id=? AND b.status='committed' AND ${activeRecord('r')}`).bind(url.searchParams.get('id'),owner).first();if(!record)return json({error:'ไม่พบรายชื่อ'},404);
 const changes=await db().prepare('SELECT action,detail,created_at FROM audit WHERE owner_id=? AND target_id=? ORDER BY created_at DESC LIMIT 20').bind(owner,record.id).all();return json({record,changes:changes.results});
 }
 const {where,args}=filters(url,owner);
 const from=`FROM records r JOIN batches b ON b.id=r.batch_id WHERE ${where}`;
 const total=Number((await db().prepare(`SELECT COUNT(*) count ${from}`).bind(...args).first())?.count||0);
 if(action==='export'){
 if(total>10000)return json({error:'ผลลัพธ์เกิน 10,000 รายชื่อ กรุณาระบุจังหวัด ปี หรือประเภทให้แคบลง'},400);
 const result=await db().prepare(`SELECT r.* ${from} ORDER BY year DESC,province,category,level,first_name LIMIT 10000`).bind(...args).all();
 return download(csv([['ปี พ.ศ.','ภาค','จังหวัดสนามสอบ','นิกาย','ประเภท','ระดับ','คำนำหน้า','ชื่อ','นามสกุล','ฉายา','วัด','แขวง/ตำบล','เขต/อำเภอ','สำนักเรียน','เขตข้อมูล','ชนิดสำนักเรียน','ปี พ.ศ. เกิด','อายุ ณ ปีที่สอบผ่าน','พรรษา','เลข ปกศ.','ปีเกิดประมาณ','อายุประมาณ'],...result.results.map(r=>[r.year,r.region,r.province,r.sect,r.category,r.level,r.title,r.first_name,r.last_name,r.dharma_name,r.temple,r.subdistrict||'',r.district,r.school,r.jurisdiction,r.school_kind,r.birth_year??'',r.age_at_exam??'',r.vassa??'',certificateNumber({province:String(r.province||''),jurisdiction:r.jurisdiction,year:Number(r.year),sequence:r.sequence}),r.birth_year_estimated?'ใช่':'',r.age_estimated?'ใช่':''])]),'passlist-results.csv','text/csv; charset=utf-8');
 }
 const {pageSize,pages,page,offset}=pagination(total,url.searchParams,ADMIN_RECORD_PAGE_SIZES);
 const sort=url.searchParams.get('sort'),sequenceSql=[...'๐๑๒๓๔๕๖๗๘๙'].reduce((sql,d,i)=>`REPLACE(${sql},'${d}','${i}')`,'r.sequence');
 const provinceOrder='CASE r.province '+PROVINCES.map((province,index)=>`WHEN '${province}' THEN ${index}`).join(' ')+' ELSE 77 END';
 const sortOrder=`${provinceOrder},CASE r.category WHEN 'นักธรรม' THEN 0 ELSE 1 END,CASE r.level WHEN 'ตรี' THEN 1 WHEN 'โท' THEN 2 ELSE 3 END,r.year DESC,CASE WHEN TRIM(COALESCE(r.sequence,''))='' THEN 1 ELSE 0 END,CAST(${sequenceSql} AS REAL) ${sort==='certificate_desc'?'DESC':'ASC'},CASE r.sect WHEN 'มหานิกาย' THEN 0 WHEN 'ธรรมยุต' THEN 1 ELSE 2 END,r.id`;
 const result=await db().prepare(`SELECT r.* ${from} ORDER BY ${sortOrder} LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all();return json({items:result.results,total,page,pages,pageSize});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'เกิดข้อผิดพลาด กรุณาลองใหม่'},400);}}
export async function POST(req:Request){try{
 // The hosting layer authenticates these headers. Every query also enforces ownership.
 const user=await getChatGPTUser();if(!user)return json({error:'กรุณาเข้าสู่ระบบ'},401);if(!canManageData(user))return json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},403);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);
 const owner=dataOwnerId(user);
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
 if(Number(req.headers.get('content-length'))>MAX_FILE+65536)throw new Error('ไฟล์ใหญ่เกิน 10 MB');
 const form=await req.formData(),f=form.get('file');if(!(f instanceof File)||!f.name.toLowerCase().endsWith('.xlsx'))throw new Error('รองรับ .xlsx เท่านั้น กรุณาบันทึก .xls เป็น .xlsx ก่อน');
 if(f.size>MAX_FILE||f.size===0)throw new Error('ขนาดไฟล์ต้องอยู่ระหว่าง 1 ไบต์–10 MB');
 const options:ImportOptions={province:String(form.get('province')||''),year:Number(toArabic(form.get('year'))),category:String(form.get('category')||''),level:String(form.get('level')||''),region:String(form.get('region')||''),sect:String(form.get('sect')||''),useSourceProvince:form.get('useSourceProvince')==='true',jurisdiction:String(form.get('jurisdiction')||''),school:String(form.get('school')||''),filename:f.name,deferSect:form.get('deferSect')==='true'};
 if(options.province)options.province=normalizeProvince(options.province)||options.province;
 if(options.province&&!PROVINCES.includes(options.province)||!Number.isInteger(options.year)||options.year!==0&&(options.year<2400||options.year>new Date().getUTCFullYear()+544))throw new Error('กรุณาเลือกจังหวัดและปี พ.ศ. ให้ถูกต้อง');
 if(options.jurisdiction&&!['ส่วนกลาง','ส่วนภูมิภาค'].includes(options.jurisdiction)||String(options.school).length>500)throw new Error('ข้อมูลสำนักเรียนไม่ถูกต้อง');
 if(options.region&&!normalizeRegion(options.region)||options.sect&&!normalizeSect(options.sect))throw new Error('ภาคหรือนิกายไม่ถูกต้อง');
 options.region=normalizeRegion(options.region||'');options.sect=normalizeSect(options.sect||'');
 if(options.category&&!CATEGORIES.includes(options.category)||options.level&&!LEVELS.includes(options.level))throw new Error('ประเภทหรือระดับไม่ถูกต้อง');
 const bytes=new Uint8Array(await f.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const batchProvince=options.province||'อ่านจากไฟล์';
 const scopeKey=options.region||options.sect||options.category||options.level||options.useSourceProvince||options.jurisdiction||options.school||options.deferSect?JSON.stringify([options.region||'',options.sect||'',options.category,options.level,options.useSourceProvince||false,options.jurisdiction||'',options.school||'',...(options.deferSect?[true]:[])]):'';
 const existing=await db().prepare('SELECT id,status FROM batches WHERE owner_id=? AND hash=? AND province=? AND year=? AND scope_key=?').bind(owner,hash,batchProvince,options.year,scopeKey).first();
 if(existing)return json({id:existing.id,existing:true,status:existing.status});
 const parsed=await parseExcel(bytes,options);if(options.year>0&&parsed.warnings.includes('ปีในไฟล์ไม่ตรงกับปีที่เลือก'))throw new Error('ปี พ.ศ. ในไฟล์ไม่ตรงกับปีที่เลือก กรุณาตรวจสอบปีแล้วอัปโหลดใหม่');
 parsed.organizationSummary=await checkOrganizationRecords(db(),parsed.records);if(!parsed.organizationSummary.ready)throw new Error('ทะเบียนองค์กรและสถานศึกษากำลังนำเข้า กรุณารอให้ข้อมูลอ้างอิงครบก่อน');
 parsed.registrySummary=await checkTempleRecords(db(),owner,parsed.records);if(!parsed.registrySummary.ready)throw new Error('ทะเบียนวัดอ้างอิงยังติดตั้งไม่ครบ กรุณารอให้ระบบนำเข้าทะเบียนเสร็จก่อนอัปโหลดรายชื่อ');parsed.groups=groupRecords(parsed.records);
 for(let offset=0;offset<parsed.records.length;offset+=5000){const part=parsed.records.slice(offset,offset+5000);const dup=await db().prepare(`SELECT DISTINCT r.fingerprint FROM records r JOIN batches b ON b.id=r.batch_id JOIN json_each(?) j ON r.fingerprint=j.value WHERE r.owner_id=? AND b.status='committed' AND ${activeRecord('r')}`).bind(JSON.stringify(part.map(r=>r.fingerprint)),owner).all();const known=new Set(dup.results.map(r=>r.fingerprint));for(const row of part)if(known.has(row.fingerprint))row.warnings.push('ข้อมูลหลักตรงกับรายชื่อที่มีอยู่แล้ว (ไม่ลบอัตโนมัติ)');}
 parsed.holds=Array.from(new Set([...(parsed.holds||[]),...parsed.records.flatMap(r=>[...r.errors,...r.warnings,...publicationErrors(r)])]));parsed.autoReady=parsed.holds.length===0;
 const autoImport=form.get('automatic')==='true';
 const id=crypto.randomUUID(),valid=parsed.records.filter(r=>!r.errors.length).length,issues=parsed.records.filter(r=>r.errors.length||r.warnings.length).length;
 await bucket().put(`source/${id}`,bytes,{httpMetadata:{contentType:f.type}});await bucket().put(`preview/${id}`,JSON.stringify(parsed));
 try{await db().batch([db().prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,scope_key,status,total,valid,issues,inserted,summary,created_at) VALUES(?,?,?,?,?,?,?,'draft',?,?,?,0,?,?)").bind(id,owner,batchProvince,options.year,f.name.slice(0,250),hash,scopeKey,parsed.records.length,valid,issues,JSON.stringify({parserVersion:7,autoImport,autoReady:parsed.autoReady,years:[...new Set(parsed.records.map(r=>r.year))],reconciliation:parsed.reconciliation,organizationSummary:parsed.organizationSummary,registrySummary:parsed.registrySummary,options,groups:parsed.groups,ignored:parsed.ignored,warnings:parsed.warnings}),now()),audit(owner,'preview',id,{filename:f.name,total:parsed.records.length,valid,issues,organizationSummary:parsed.organizationSummary,registrySummary:parsed.registrySummary})]);}catch(e){await bucket().delete([`source/${id}`,`preview/${id}`]);throw e;}
 if(autoImport&&(options.deferSect?parsed.records.every(r=>!r.errors.length)&&parsed.reconciliation?.matches!==false:parsed.autoReady)){let result;const maxChunks=parsed.records.length>10000?1:Math.ceil(parsed.records.length/400);for(let chunk=0;chunk<maxChunks&&!result?.done;chunk++)result=await commitImport(id,owner,{publish:!options.deferSect,automatic:true,excludeErrors:false,parsed,deferSect:options.deferSect});return json({id,autoCommitted:result?.done??false,autoPending:!result?.done,...result,organizationSummary:parsed.organizationSummary,registrySummary:parsed.registrySummary});}
 return json({id,autoCommitted:false,holds:parsed.holds,autoReady:parsed.autoReady,organizationSummary:parsed.organizationSummary,registrySummary:parsed.registrySummary});
 }
 const body=await req.json() as Record<string,unknown>,action=body.action,id=String(body.id||'');
 if(action==='trash-record'||action==='restore-record'){
 if(body.acknowledge!==true)throw new Error(action==='trash-record'?'กรุณายืนยันการย้ายรายชื่อไปถังขยะ':'กรุณายืนยันการกู้คืนรายชื่อ');
 const expected=action==='trash-record'?activeRecord('r'):trashedRecord('r'),detail={reason:clean(body.reason|| (action==='trash-record'?'ผู้ดูแลย้ายรายชื่อไปถังขยะ':'ผู้ดูแลกู้คืนรายชื่อ'))};
 const previous=await db().prepare("SELECT created_at FROM audit WHERE owner_id=? AND target_id=? AND action IN ('trash-record','restore-record') ORDER BY created_at DESC,id DESC LIMIT 1").bind(owner,id).first<{created_at:string}>(),previousTime=previous?Date.parse(previous.created_at):0,eventTime=new Date(Math.max(Date.now(),Number.isFinite(previousTime)?previousTime+1:0)).toISOString();
 const result=await db().prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT ?,?,?,?, ?,? WHERE EXISTS (SELECT 1 FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.id=? AND r.owner_id=? AND b.status IN ('committed','archived') AND ${expected})`).bind(crypto.randomUUID(),owner,action,id,JSON.stringify(detail),eventTime,id,owner).run();
 if(Number(result.meta.changes)!==1)throw new Error(action==='trash-record'?'ไม่พบรายชื่อที่ยังใช้งานอยู่':'ไม่พบรายชื่อในถังขยะ');
 return json({ok:true});
 }
 if(action==='purge-record'){
 if(body.acknowledge!==true)throw new Error('กรุณายืนยันการลบทิ้งถาวร');
 const trashRow=await db().prepare(`SELECT r.batch_id FROM records r WHERE r.id=? AND r.owner_id=? AND ${trashedRecord('r')}`).bind(id,owner).first<{batch_id:string}>();if(!trashRow)throw new Error('ลบทิ้งถาวรได้เฉพาะรายชื่อที่อยู่ในถังขยะ');
 const previewKey=`preview/${trashRow.batch_id}`,previewObject=await bucket().get(previewKey);let originalPreview:string|undefined,updatedPreview:string|undefined;
 if(previewObject){originalPreview=await previewObject.text();const parsed=JSON.parse(originalPreview) as ParsedFile,remaining=parsed.records.filter(record=>`${trashRow.batch_id}_${record.id}`!==id);if(remaining.length!==parsed.records.length){parsed.records=remaining;parsed.groups=groupRecords(remaining);parsed.holds=Array.from(new Set([...parsed.warnings,...remaining.flatMap(record=>[...record.errors,...record.warnings,...publicationErrors(record)])]));parsed.autoReady=parsed.holds.length===0;updatedPreview=JSON.stringify(parsed);await bucket().put(previewKey,updatedPreview,{httpMetadata:{contentType:'application/json; charset=utf-8'}});}}
 let result;try{result=await db().batch([
 db().prepare(`DELETE FROM records WHERE id=? AND owner_id=? AND ${trashedRecord('records')}`).bind(id,owner),
 db().prepare('DELETE FROM audit WHERE owner_id=? AND target_id=? AND NOT EXISTS (SELECT 1 FROM records r WHERE r.id=? AND r.owner_id=?)').bind(owner,id,id,owner)
 ]);}catch(error){if(updatedPreview&&originalPreview!==undefined)try{await bucket().put(previewKey,originalPreview,{httpMetadata:{contentType:'application/json; charset=utf-8'}});}catch(restoreError){console.error('Unable to restore preview after failed record purge',restoreError);}throw error;}
 if(Number(result[0].meta.changes)!==1){if(updatedPreview&&originalPreview!==undefined)try{await bucket().put(previewKey,originalPreview,{httpMetadata:{contentType:'application/json; charset=utf-8'}});}catch(restoreError){console.error('Unable to restore preview after declined record purge',restoreError);}throw new Error('ลบทิ้งถาวรได้เฉพาะรายชื่อที่อยู่ในถังขยะ');}
 return json({ok:true});
 }
 if(action==='enrich-registry'||action==='enrich-organization-registry'){
 const organization=action==='enrich-organization-registry',category=organization?'ธรรมศึกษา':'นักธรรม';
 if(body.acknowledge!==true)throw new Error('กรุณายืนยันการเติมข้อมูลจาก'+(organization?'ทะเบียนองค์กร/สถานศึกษา':'ทะเบียนวัด'));
 const batch=await owned(id,owner);if(batch.status!=='committed')throw new Error('เติมข้อมูลได้เมื่อชุดข้อมูลนำเข้าเสร็จแล้ว');
 const object=await bucket().get(`preview/${id}`);if(!object)throw new Error('ไม่พบข้อมูลตรวจทานสำหรับชุดนี้ กรุณาอัปโหลดไฟล์ต้นฉบับใหม่');
 const parsed=await object.json<ParsedFile>(),storedRows=await db().prepare(`SELECT r.* FROM records r WHERE r.batch_id=? AND r.owner_id=? AND ${activeRecord('r')}`).bind(id,owner).all(),byId=new Map(storedRows.results.map(row=>[String(row.id),row]));
 for(const record of parsed.records){
  const row=byId.get(`${id}_${record.id}`);if(!row)continue;
  record.province=String(row.province||'');record.year=Number(row.year||0);record.region=String(row.region||'');record.sect=String(row.sect||'');record.category=String(row.category||'');record.level=String(row.level||'');record.title=String(row.title||'');record.firstName=String(row.first_name||'');record.lastName=String(row.last_name||'');record.dharmaName=String(row.dharma_name||'');record.temple=String(row.temple||'');record.district=String(row.district||'');record.subdistrict=String(row.subdistrict||'');record.sourceProvince=String(row.source_province||'');record.school=String(row.school||'');record.jurisdiction=String(row.jurisdiction||'');record.schoolKind=String(row.school_kind||'');record.sectReviewed=Number(row.sect_reviewed)===1;record.fingerprint=String(row.fingerprint||'');
 }
 const targets=parsed.records.filter(record=>record.category===category&&byId.has(`${id}_${record.id}`));
 if(organization){for(const record of targets)record.organizationMatch=undefined;parsed.organizationSummary=await checkOrganizationRecords(db(),targets);if(!parsed.organizationSummary.ready)throw new Error('ทะเบียนองค์กรและสถานศึกษายังนำเข้าไม่ครบ');}
 else{for(const record of targets)record.registryMatch=undefined;parsed.registrySummary=await checkTempleRecords(db(),owner,targets);if(!parsed.registrySummary.ready)throw new Error('ทะเบียนวัดอ้างอิงยังติดตั้งไม่ครบ');}
 parsed.groups=groupRecords(parsed.records);parsed.holds=Array.from(new Set([...parsed.warnings,...parsed.records.flatMap(r=>[...r.errors,...r.warnings,...publicationErrors(r)])]));parsed.autoReady=parsed.holds.length===0;
 const patches=targets.flatMap(record=>{const row=byId.get(`${id}_${record.id}`);if(!row)return[];const next={district:record.district||'',subdistrict:record.subdistrict||'',source_province:record.sourceProvince||'',sect:record.sect||'',sect_reviewed:record.sectReviewed?1:0,fingerprint:fingerprint(record)};if(next.district===String(row.district||'')&&next.subdistrict===String(row.subdistrict||'')&&next.source_province===String(row.source_province||'')&&next.sect===String(row.sect||'')&&next.sect_reviewed===Number(row.sect_reviewed||0))return[];return[{id:String(row.id),oldFingerprint:String(row.fingerprint||''),oldSubdistrict:String(row.subdistrict||''),oldDistrict:String(row.district||''),oldProvince:String(row.source_province||''),...next}];});
 for(let offset=0;offset<patches.length;offset+=250){const part=patches.slice(offset,offset+250),updated=await db().prepare(`UPDATE records AS r SET district=json_extract(j.value,'$.district'),subdistrict=json_extract(j.value,'$.subdistrict'),source_province=json_extract(j.value,'$.source_province'),sect=json_extract(j.value,'$.sect'),sect_reviewed=json_extract(j.value,'$.sect_reviewed'),fingerprint=json_extract(j.value,'$.fingerprint'),updated_at=? FROM json_each(?) AS j WHERE r.id=json_extract(j.value,'$.id') AND r.owner_id=? AND r.batch_id=? AND r.fingerprint=json_extract(j.value,'$.oldFingerprint') AND r.subdistrict=json_extract(j.value,'$.oldSubdistrict') AND r.district=json_extract(j.value,'$.oldDistrict') AND r.source_province=json_extract(j.value,'$.oldProvince') AND ${activeRecord('r')}`).bind(now(),JSON.stringify(part),owner,id).run();if(Number(updated.meta.changes)!==part.length)throw new Error('ข้อมูลบางรายการเปลี่ยนระหว่างตรวจ กรุณาโหลดชุดข้อมูลแล้วลองใหม่');}
 await bucket().put(`preview/${id}`,JSON.stringify(parsed));const issues=parsed.records.filter(r=>r.errors.length||r.warnings.length).length,summary=JSON.parse(String(batch.summary||'{}'));
 const checkedSummary=organization?parsed.organizationSummary:parsed.registrySummary;
 if(organization){summary.organizationSummary=parsed.organizationSummary;summary.organizationEnrichment={at:now(),category,checkedRecords:targets.length,updatedRecords:patches.length,...checkedSummary};}
 else{summary.registrySummary=parsed.registrySummary;summary.registryEnrichment={at:now(),category,checkedRecords:targets.length,updatedRecords:patches.length,...checkedSummary};}
 summary.groups=parsed.groups;
 await db().batch([db().prepare("UPDATE batches SET issues=?,summary=? WHERE id=? AND owner_id=? AND status='committed'").bind(issues,JSON.stringify(summary),id,owner),audit(owner,organization?'organization-registry-autofill':'temple-registry-autofill',id,{reason:'เทียบ/เติม'+(organization?'ทะเบียนองค์กร/สถานศึกษา สำหรับธรรมศึกษา':'ทะเบียนวัด สำหรับนักธรรม'),category,checkedRecords:targets.length,updatedRecords:patches.length,...checkedSummary})]);
 return json({ok:true,category,checkedRecords:targets.length,updatedRecords:patches.length,...(organization?{organizationSummary:parsed.organizationSummary}:{registrySummary:parsed.registrySummary})});
 }
 if(action==='delete-batch'){
 if(body.acknowledge!==true)throw new Error('กรุณายืนยันการลบชุดข้อมูล');
 const batch=await owned(id,owner),deletedRecords=Number((await db().prepare('SELECT COUNT(*) count FROM records WHERE batch_id=? AND owner_id=?').bind(id,owner).first<{count:number}>())?.count||0);
 await db().batch([
 db().prepare('DELETE FROM audit WHERE owner_id=? AND (target_id=? OR target_id IN (SELECT id FROM records WHERE batch_id=? AND owner_id=?))').bind(owner,id,id,owner),
 db().prepare('DELETE FROM records WHERE batch_id=? AND owner_id=?').bind(id,owner),
 db().prepare('DELETE FROM batches WHERE id=? AND owner_id=?').bind(id,owner),
 audit(owner,'delete-batch',id,{deletedRecords})
 ]);
 let storageCleaned=true;try{await bucket().delete([`source/${id}`,`preview/${id}`]);}catch(error){storageCleaned=false;console.error('Unable to remove deleted batch files from R2',error);}
 return json({ok:true,deletedRecords,storageCleaned,filename:batch.filename});
 }
 if(action==='commit'){
 if(body.acknowledge!==true)throw new Error('กรุณารับรองการตรวจข้อมูลก่อนนำเข้า');
 const object=await bucket().get(`preview/${id}`),parsed=await object?.json<ParsedFile>();if(!parsed)throw new Error('ไม่พบข้อมูลตรวจทาน');let result;
 const maxChunks=parsed.records.length>10000?10:1;for(let chunk=0;chunk<maxChunks;chunk++){result=await commitImport(id,owner,{publish:body.publish===true,automatic:body.automatic===true,excludeErrors:body.excludeErrors===true,deferSect:body.deferSect===true,parsed});if(result.done)break;}
 return json(result);
 }
 if(action==='publish'||action==='unpublish'){if(body.acknowledge!==true)throw new Error('กรุณายืนยันการเผยแพร่');await publishBatch(id,owner,action==='publish');return json({ok:true});}
 if(action==='archive'||action==='restore'){
 const b=await owned(id,owner);if(action==='restore'&&b.status!=='archived'||action==='archive'&&b.status!=='committed')throw new Error('สถานะชุดข้อมูลไม่รองรับการดำเนินการนี้');
 await db().batch([db().prepare('UPDATE batches SET status=? WHERE id=? AND owner_id=?').bind(action==='archive'?'archived':'committed',id,owner),audit(owner,String(action),id,{filename:b.filename})]);return json({ok:true});
 }
 if(action==='edit'){
 const old=await db().prepare(`SELECT r.* FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.id=? AND r.owner_id=? AND b.status='committed' AND ${activeRecord('r')}`).bind(id,owner).first();if(!old)throw new Error('ไม่พบรายชื่อ');
 const fields=['title','first_name','last_name','dharma_name','temple','district','source_province','school','note','region','sect','jurisdiction','school_kind','subdistrict'];
 const valueByField=Object.fromEntries(fields.map(field=>[field,clean(body[field]??old[field])])) as Record<string,string>;
 if(valueByField.source_province)valueByField.source_province=normalizeProvince(valueByField.source_province)||valueByField.source_province;
 if(valueByField.source_province&&!PROVINCES.includes(valueByField.source_province))throw new Error('จังหวัดไม่ถูกต้อง');
 if(body.auto_school==='true')valueByField.school=valueByField.source_province?`คณะจังหวัด${valueByField.source_province}`:'';
 if(valueByField.region){const normalized=normalizeRegion(valueByField.region);if(!normalized)throw new Error('ภาคไม่ถูกต้อง');valueByField.region=normalized;}
 if(valueByField.sect){const normalized=normalizeSect(valueByField.sect);if(!normalized)throw new Error('นิกายไม่ถูกต้อง');valueByField.sect=normalized;}
 if(valueByField.jurisdiction&&!['ส่วนกลาง','ส่วนภูมิภาค'].includes(valueByField.jurisdiction))throw new Error('เขตข้อมูลไม่ถูกต้อง');
 if(valueByField.school_kind&&!['วัด','คณะเขต','คณะสงฆ์'].includes(valueByField.school_kind))throw new Error('ชนิดสำนักเรียนไม่ถูกต้อง');
 const values=fields.map(field=>valueByField[field]);
 const reviewed=Object.hasOwn(body,'sect')?(SECTS.includes(valueByField.sect)?1:0):Number(old.sect_reviewed||0);
 const batch=await owned(String(old.batch_id),owner);if(batch.visibility==='published'){const candidate={...old,sect_reviewed:reviewed,...valueByField};const errors=publicationErrors(databaseRecord(candidate));if(errors.length)throw new Error('แก้ไขข้อมูลเผยแพร่ไม่ได้: '+errors.join(' · '));}
 const updatedFingerprint=fingerprint({year:Number(old.year),province:String(old.province),category:String(old.category),level:String(old.level),title:valueByField.title,firstName:valueByField.first_name,lastName:valueByField.last_name,dharmaName:valueByField.dharma_name,temple:valueByField.temple,district:valueByField.district,school:valueByField.school,region:valueByField.region,sect:valueByField.sect,subdistrict:valueByField.subdistrict});if(!valueByField.first_name||values.some(v=>v.length>500))throw new Error('ต้องมีชื่อ และข้อความแต่ละช่องไม่เกิน 500 ตัวอักษร');
 const reason=clean(body.reason);if(reason.length<5||reason.length>500)throw new Error('ระบุเหตุผลในการแก้ไขอย่างน้อย 5 ตัวอักษร');
 await db().batch([db().prepare(`UPDATE records SET ${fields.map(k=>k+'=?').join(',')},sect_reviewed=?,fingerprint=?,updated_at=? WHERE id=? AND owner_id=?`).bind(...values,reviewed,updatedFingerprint,now(),id,owner),audit(owner,'edit',id,{reason,before:Object.fromEntries(fields.map(k=>[k,old[k]])),after:Object.fromEntries(fields.map((k,i)=>[k,values[i]]))})]);return json({ok:true});
 }
 return json({error:'ไม่รองรับคำขอนี้'},400);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'เกิดข้อผิดพลาด กรุณาลองใหม่'},400);}}
