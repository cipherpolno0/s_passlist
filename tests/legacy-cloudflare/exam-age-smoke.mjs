import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'test@example.test'},cf:false});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO organization_registry_meta(dataset_version,source_filename,source_hash,rows_total,started_at,updated_at,backfill_status) VALUES('dhammastudy-organizations-2569-2026-10-20-v1','test','test',0,'test','test','done')").run();
 const options={province:'พิษณุโลก',year:2542,category:'',level:''};
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,visibility,total,valid,issues,summary,created_at) VALUES('old-age','owner','พิษณุโลก',2542,'old.xlsx','hash','committed','published',7,7,0,?,'2026-10-01')").bind(JSON.stringify({options})).run();
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('รายชื่อ');sheet.addRow(['ชื่อ','นามสกุล','ประเภท','ระดับ','อายุ','ปี พ.ศ. เกิด']);
 const cases=[[40,''],['',2500],[40,2400],['',''],[23,''],[55,''],[42,'']];
 for(let i=0;i<cases.length;i++){
  sheet.addRow(['ทดสอบ'+i,'ระบบ','นักธรรม','ตรี',...cases[i]]);
  await db.prepare("INSERT INTO records(id,batch_id,owner_id,province,year,category,level,title,first_name,last_name,dharma_name,temple,district,source_province,school,note,sheet,source_row,sequence,fingerprint) VALUES(?,'old-age','owner','พิษณุโลก',2542,'นักธรรม','ตรี','',?,'ระบบ','','วัดทดสอบ','','','','หมายเหตุเดิม','รายชื่อ',?,'','fingerprint-original')").bind('old-age_1-'+(i+2),'ทดสอบ'+i,i+2).run();
 }
 await bucket.put('source/old-age',await workbook.xlsx.writeBuffer());
 await db.prepare("INSERT INTO audit VALUES('trash','owner','trash-record','old-age_1-6','{}','2026-10-02')").run();
 await db.prepare("UPDATE records SET birth_year=2490,age_at_exam=52 WHERE id='old-age_1-7'").run();
 await db.prepare("UPDATE records SET region='ภาค 5'").run();
 await mf.dispatchFetch('https://test.example/api/public?action=meta');
 let state;for(let i=0;i<100;i++){state=await db.prepare("SELECT * FROM batches WHERE id='old-age'").first();if(state.age_status==='done'||state.age_status==='error')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(state.age_status,'done',state.age_error);assert.equal(state.age_updated,3);assert.equal(state.age_cursor,7);
 const rows=(await db.prepare('SELECT * FROM records ORDER BY source_row').all()).results;
 assert.deepEqual(rows.map(r=>[r.birth_year,r.age_at_exam]),[[2502,40],[2500,42],[null,null],[null,null],[null,null],[2490,52],[2500,42]]);
 assert.equal(rows[0].birth_year_estimated,1);assert.equal(rows[1].age_estimated,1);
 for(const row of rows){assert.equal(row.fingerprint,'fingerprint-original');assert.equal(row.note,'หมายเหตุเดิม');assert.equal(row.year,2542);}
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='age-autofill'").first()).count,3);
 const response=await mf.dispatchFetch('https://test.example/api/public?firstName='+encodeURIComponent('ทดสอบ0')+'&lastName='+encodeURIComponent('ระบบ'));assert.equal(response.status,200);const result=await response.json();assert.equal(result.items[0].birth_year,2502);assert.equal(result.items[0].age_at_exam,40);
 await mf.dispatchFetch('https://test.example/api/public?action=meta');await new Promise(r=>setTimeout(r,100));assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='age-autofill'").first()).count,3);
 console.log('PASS: retained Excel age backfill, exam-year calculations, estimates, conflicting/missing ages, trash and existing-value preservation, audit, idempotence and public search.');
}finally{await mf.dispose();}
