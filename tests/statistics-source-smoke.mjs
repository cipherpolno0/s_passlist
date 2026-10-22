// Retained workbook integration: isolated D1/R2, no production records.
import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'test@example.test'},cf:false});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const auth={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'test@example.test'};
 async function call(q='',body,headers=auth){const init={headers:{...headers,...(body?{'Content-Type':'application/json',Origin:'https://test.example'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})};return mf.dispatchFetch('https://test.example/api/statistics?'+q,init);}
 async function json(q='',body,headers){const r=await call(q,body,headers),t=await r.text();assert.equal(r.status,200,t);return JSON.parse(t);}
 async function retained(id,rows,owner='owner'){
  const b=new ExcelJS.Workbook(),s=b.addWorksheet('สถิติจากผลสอบ');s.addRow(['ปี พ.ศ.','ภาค','จังหวัด','ประเภท','ชั้น','นิกาย','วัด','ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้','สอบตก','อื่นๆ']);for(const r of rows)s.addRow(r);
  await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,total,valid,issues,summary,created_at,age_status,vassa_status) VALUES(?,?, 'อ่านจากไฟล์',0,?,?,'committed',0,0,0,'{}',?,'done','done')").bind(id,owner,id+'.xlsx',id,new Date().toISOString()).run();await bucket.put('source/'+id,await b.xlsx.writeBuffer());
 }
 const row=(temple='',sent=100,sect='')=>[2542,'ภาค 5','พิษณุโลก','นักธรรม','ตรี',sect,temple,sent,5,sent-5,sent-10,5,0];
 // Background processing starts from an ordinary visit, without reupload or admin submission.
 await retained('original',[row(),row(),row('วัดหนึ่ง',40),row('วัดสอง',60)]);
 await mf.dispatchFetch('https://test.example/');
 let meta;for(let i=0;i<100;i++){meta=await db.prepare("SELECT status,row_count FROM statistics_sources WHERE batch_id='original'").first();if(meta&&['done','error','empty'].includes(meta.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(meta?.status,'done',JSON.stringify(meta));assert.equal(meta.row_count,4);
 let stats=await json();assert.equal(stats.total,1);assert.equal(stats.totals.sent,100);assert.equal(stats.items[0].origin,'retained');assert.match(stats.items[0].source_file,/original.xlsx.*แถว/);assert.deepEqual(stats.years,[2542]);
 assert.equal((await json('temple='+encodeURIComponent('วัดหนึ่ง'))).totals.sent,40);
 for(let i=0;i<2;i++)await json('',{action:'rescan-source',id:'original'});
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM retained_exam_statistics WHERE batch_id='original'").first()).count,4);assert.equal((await json()).totals.sent,100);
 // Identical overlapping sources count once. Contradictory totals are held out, never added.
 await retained('identical',[row()]);await json('',{action:'scan-existing'});assert.equal((await json()).totals.sent,100);
 await retained('contradictory',[row('',101)]);await json('',{action:'scan-existing'});stats=await json();assert.equal(stats.conflicts,1);assert.notEqual(stats.totals.sent,201);
 // Exclude archived source data, preserve it for restoration, and cascade permanent deletion.
 await db.prepare("UPDATE batches SET status='archived' WHERE id='contradictory'").run();stats=await json();assert.equal(stats.conflicts,0);assert.equal(stats.totals.sent,100);
 await db.prepare("DELETE FROM batches WHERE id='contradictory'").run();assert.equal((await db.prepare("SELECT COUNT(*) count FROM retained_exam_statistics WHERE batch_id='contradictory'").first()).count,0);assert.equal((await db.prepare("SELECT COUNT(*) count FROM statistics_sources WHERE batch_id='contradictory'").first()).count,0);
 // Scope filtering, unknown metrics, retained vs. manual precedence, owner isolation.
 await retained('sects',[row('วัดสาม',200,''),row('วัดสาม',80,'มหานิกาย'),row('วัดสาม',120,'ธรรมยุต')]);await json('',{action:'scan-existing'});assert.equal((await json('temple=วัดสาม')).totals.sent,200);assert.equal((await json('temple=วัดสาม&sect=มหานิกาย')).totals.sent,80);
 await retained('missing',[[2541,'ภาค 5','ตาก','ธรรมศึกษา','โท','','',null,0,null,10,null,null]]);await json('',{action:'scan-existing'});stats=await json('year=2541');assert.equal(stats.totals.sent,null);assert.equal(stats.totals.absent,0);assert.equal(stats.missing.sent,1);
 const exported=await call('action=export&year=2541'),book=new ExcelJS.Workbook();assert.equal(exported.status,200);await book.xlsx.load(await exported.arrayBuffer());assert.equal(book.getWorksheet('สถิติผลสอบ').getCell('H2').value,'-');
 const other=await json('',undefined,{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'test@example.test'});assert.equal(other.total,0);assert.equal(other.sync.total,0);
 assert.equal((await call('',{action:'rescan-source',id:'original'},{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'test@example.test'})).status,404);
 assert.equal((await call('',{action:'scan-existing'},{'oai-authenticated-user-id':'ordinary','oai-authenticated-user-email':'reader@example.test'})).status,403);
 assert.equal((await mf.dispatchFetch('https://test.example/api/statistics',{method:'POST',headers:{...auth,Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({action:'scan-existing'})})).status,403);
 await db.prepare("INSERT INTO exam_statistics(id,owner_id,year,region,province,category,level,sect,temple,sent,passed,source_file,source_sheet,source_row,created_at,updated_at) VALUES('manual','owner',2542,'ภาค 5','พิษณุโลก','นักธรรม','ตรี','','',250,240,'confirmed.xlsx','stats',2,'test','test')").run();assert.equal((await json('year=2542')).totals.sent,250);
 // Missing source file is explicit and does not fabricate statistics.
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,total,valid,issues,summary,created_at,age_status,vassa_status) VALUES('lost','owner','ตาก',2542,'lost.xlsx','lost','committed',0,0,0,'{}','test','done','done')").run();await json('',{action:'scan-existing'});const status=await json('action=sources');assert.equal(status.sources.find(s=>s.id==='lost').status,'error');assert.match(status.sources.find(s=>s.id==='lost').error,/ไม่พบไฟล์/);
 console.log('PASS: automatic retained-source extraction, D1/R2 linkage, exact numbers/provenance, deduplication, conflict holds, scope rollups, filters/export, missing metrics, retries, archive/delete lifecycle, manual precedence and authorization.');
}finally{await mf.dispose();}
