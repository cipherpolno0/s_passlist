import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'test@example.test'},cf:false});
try{
 const db=await mf.getD1Database('DB');for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO organization_registry_meta(dataset_version,source_filename,source_hash,rows_total,started_at,updated_at,backfill_status) VALUES('dhammastudy-organizations-2569-2026-10-20-v1','test','test',0,'test','test','done')").run();
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,visibility,total,valid,issues,summary,created_at,age_status,vassa_status) VALUES('old-regions','owner','อ่านจากไฟล์',2542,'old.xlsx','hash','committed','published',13,13,0,'{}','2026-10-01','done','done')").run();
 const cases=[['พิษณุโลก','','ส่วนภูมิภาค'],['นนทบุรี','','ส่วนภูมิภาค'],['กระบี่','','ส่วนภูมิภาค'],['เชียงใหม่','','ส่วนภูมิภาค'],['พิษณุโลก','ภาค 7','ส่วนภูมิภาค'],['พิษณุโลก','ภาค 4-5-6-7','ส่วนภูมิภาค'],['กรุงเทพมหานคร','','ส่วนกลาง'],['กรุงเทพมหานคร','','ส่วนภูมิภาค'],['ชลบุรี','','ส่วนภูมิภาค'],['พิษณุโลก','','ส่วนภูมิภาค'],['พิษณุโลก','','ส่วนกลาง'],['','','ส่วนภูมิภาค'],['ตาก','  ','ส่วนภูมิภาค']];
 for(let i=0;i<cases.length;i++){
  const [province,region,jurisdiction]=cases[i];
  await db.prepare("INSERT INTO records(id,batch_id,owner_id,province,year,category,level,title,first_name,last_name,dharma_name,temple,district,source_province,school,note,sheet,source_row,sequence,fingerprint,birth_year,age_at_exam,vassa,region,jurisdiction) VALUES(?,'old-regions','owner',?,2542,'นักธรรม','ตรี','พระ',?,'ระบบ','','วัดทดสอบ','','ตาก','','หมายเหตุเดิม','รายชื่อ',?,'1','old-fingerprint',2502,40,12,?,?)").bind('region-'+i,province,'ทดสอบ'+i,i+2,region,jurisdiction).run();
 }
 await db.prepare("INSERT INTO audit VALUES('trash','owner','trash-record','region-9','{}','2026-10-02')").run();
 await mf.dispatchFetch('https://test.example/api/public?action=meta');
 let state;for(let i=0;i<100;i++){state=await db.prepare("SELECT * FROM province_region_meta").first();if(state?.status==='done')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(state.status,'done');assert.equal(state.filled,6);
 const rows=(await db.prepare('SELECT * FROM records ORDER BY source_row').all()).results;
 assert.deepEqual(rows.map(r=>r.region),['ภาค 5','ภาค 1','ภาค 17','ภาค 7','ภาค 7','ภาค 4-5-6-7','','','ภาค 13','','','','ภาค 5']);
 for(const row of rows){assert.equal(row.note,'หมายเหตุเดิม');assert.equal(row.year,2542);assert.equal(row.source_province,'ตาก');assert.equal(row.age_at_exam,40);assert.equal(row.vassa,12);assert.equal(row.sequence,'1');}
 for(const index of [0,1,2,3,8,12])assert.notEqual(rows[index].fingerprint,'old-fingerprint');for(const index of [4,5,6,7,9,10,11])assert.equal(rows[index].fingerprint,'old-fingerprint');
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='province-region-autofill'").first()).count,6);
 await mf.dispatchFetch('https://test.example/api/public?action=meta');await new Promise(r=>setTimeout(r,100));assert.equal((await db.prepare("SELECT COUNT(*) count FROM audit WHERE action='province-region-autofill'").first()).count,6);
 const response=await mf.dispatchFetch('https://test.example/api/public?firstName='+encodeURIComponent('ทดสอบ0')+'&lastName='+encodeURIComponent('ระบบ'));assert.equal(response.status,200);assert.equal((await response.json()).items[0].region,'ภาค 5');
 console.log('PASS: province-region backfill, exact supplied mapping, missing-only fill, explicit/compound/central preservation, exam versus affiliation province, trash exclusion, fingerprint audit and idempotence.');
}finally{await mf.dispose();}
