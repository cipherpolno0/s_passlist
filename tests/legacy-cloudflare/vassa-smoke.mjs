import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'test@example.test'},cf:false});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO organization_registry_meta(dataset_version,source_filename,source_hash,rows_total,started_at,updated_at,backfill_status) VALUES('dhammastudy-organizations-2569-2026-10-20-v1','test','test',0,'test','test','done')").run();
 const options={province:'พิษณุโลก',year:2542,category:'',level:''};
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,visibility,total,valid,issues,summary,created_at,age_status) VALUES('old-vassa','owner','พิษณุโลก',2542,'old.xlsx','hash','committed','published',9,9,0,?,'2026-10-01','done')").bind(JSON.stringify({options})).run();
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('รายชื่อ');sheet.addRow(['ชื่อ','นามสกุล','คำนำหน้า','ประเภท','ระดับ','อายุ','พรรษา']);
 const cases=[['พระ','นักธรรม',40,'๑๒'],['พระมหา','นักธรรม',20,0],['สามเณร','นักธรรม',17,3],['นาย','ธรรมศึกษา',40,10],['พระ','นักธรรม',40,11],['พระ','นักธรรม',40,6],['พระ','นักธรรม',40,''],['พระ','นักธรรม',40,60],['พระ','นักธรรม',40,4]];
 for(let i=0;i<cases.length;i++){
  const [title,category,age,vassa]=cases[i];sheet.addRow(['ทดสอบ'+i,'ระบบ',title,category,'ตรี',age,vassa]);
  await db.prepare("INSERT INTO records(id,batch_id,owner_id,province,year,category,level,title,first_name,last_name,dharma_name,temple,district,source_province,school,note,sheet,source_row,sequence,fingerprint,birth_year,age_at_exam) VALUES(?,'old-vassa','owner','พิษณุโลก',2542,?,'ตรี',?,?,'ระบบ','','วัดทดสอบ','','','','หมายเหตุเดิม','รายชื่อ',?,'','fingerprint-original',2502,40)").bind('old-vassa_1-'+(i+2),category,title,'ทดสอบ'+i,i+2).run();
 }
 await bucket.put('source/old-vassa',await workbook.xlsx.writeBuffer());
 await db.prepare("INSERT INTO audit VALUES('trash','owner','trash-record','old-vassa_1-6','{}','2026-10-02')").run();
 await db.prepare("UPDATE records SET vassa=99 WHERE id='old-vassa_1-7'").run();
 await db.prepare("UPDATE records SET region='ภาค 5'").run();
 await mf.dispatchFetch('https://test.example/api/public?action=meta');
 let state;for(let i=0;i<100;i++){state=await db.prepare("SELECT * FROM batches WHERE id='old-vassa'").first();if(state.vassa_status==='done'||state.vassa_status==='error')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(state.vassa_status,'done',state.vassa_error);assert.equal(state.vassa_updated,3);assert.equal(state.vassa_cursor,9);
 const rows=(await db.prepare('SELECT * FROM records ORDER BY source_row').all()).results;
 assert.deepEqual(rows.map(r=>r.vassa),[12,0,null,null,null,99,null,null,4]);
 for(const row of rows){assert.equal(row.fingerprint,'fingerprint-original');assert.equal(row.note,'หมายเหตุเดิม');assert.equal(row.year,2542);assert.equal(row.age_at_exam,40);assert.equal(row.birth_year,2502);}
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='vassa-autofill'").first()).count,3);
 const response=await mf.dispatchFetch('https://test.example/api/public?firstName='+encodeURIComponent('ทดสอบ0')+'&lastName='+encodeURIComponent('ระบบ'));assert.equal(response.status,200);const result=await response.json();assert.equal(result.items[0].vassa,12);assert.equal(result.items[0].age_at_exam,40);
 await db.prepare("UPDATE records SET vassa=3 WHERE id='old-vassa_1-4'").run();const novice=await mf.dispatchFetch('https://test.example/api/public?firstName='+encodeURIComponent('ทดสอบ2')+'&lastName='+encodeURIComponent('ระบบ'));assert.equal((await novice.json()).items[0].vassa,null);
 await mf.dispatchFetch('https://test.example/api/public?action=meta');await new Promise(r=>setTimeout(r,100));assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='vassa-autofill'").first()).count,3);
 console.log('PASS: retained Excel vassa backfill, Thai digits and zero, monk/novice/lay separation, invalid/missing values, existing-value and age preservation, trash exclusion, audit, idempotence and public search.');
}finally{await mf.dispose();}
