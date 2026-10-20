// Exercises the production bootstrap/backfill through the built Worker, isolated from live data.
import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
const seed=JSON.parse(gunzipSync(Buffer.from(JSON.parse(fs.readFileSync('data/organization-registry-v1.json','utf8')),'base64')));
const names=new Map();for(const row of seed){const list=names.get(row[1])||[];list.push(row);names.set(row[1],list);}
const unique=names.get('โรงเรียนพระตำหนักสวนกุหลาบ');assert.equal(unique.length,1);const reference=unique[0];
const namesake=[...names.values()].find(list=>list.length>1&&new Set(list.map(r=>JSON.stringify(r.slice(2)))).size>1&&list.filter(r=>r[4]===list[0][4]).length===1);assert.ok(namesake);
const duplicate=[...names.values()].find(list=>list.length>1&&new Set(list.map(r=>JSON.stringify(r.slice(2)))).size===1);assert.ok(duplicate);
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'test@example.test'},cf:false});
try{
 const db=await mf.getD1Database('DB');for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,total,valid,issues,summary,created_at) VALUES('old-batch','owner','นนทบุรี',2569,'old.xlsx','old-hash','committed',8,8,0,'{}','2026-10-01')").run();
 async function add(id,name,subdistrict='',district='',province=''){await db.prepare("INSERT INTO records(id,batch_id,owner_id,province,year,category,level,title,first_name,last_name,dharma_name,temple,district,source_province,school,note,sheet,source_row,sequence,fingerprint,subdistrict,sect) VALUES(?,'old-batch','owner','นนทบุรี',2569,'ธรรมศึกษา','ตรี','','ทดสอบ','ระบบ','',?,?,?,'คณะจังหวัดนนทบุรี','','เก่า',2,'1',?,?, 'ธรรมยุต')").bind(id,name,district,province,'old-'+id,subdistrict).run();}
 await add('1-unique',reference[1]);await add('2-ambiguous',namesake[0][1]);await add('3-disambiguated',namesake[0][1],'','',namesake[0][4]);await add('4-conflict',reference[1],'','','เชียงใหม่');await add('5-complete',reference[1],reference[2],reference[3],reference[4]);await add('6-duplicate',duplicate[0][1]);await add('7-missing','โรงเรียนไม่มีอยู่ในทะเบียนทดสอบ');await add('8-trash',reference[1]);
 await db.prepare("INSERT INTO audit VALUES('trash','owner','trash-record','8-trash','{}','2026-10-02')").run();
 await db.prepare("UPDATE records SET region='ภาค 1'").run();
 const headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'test@example.test','Content-Type':'application/json'};
 async function sync(){const r=await mf.dispatchFetch('https://test.example/api/organization-registry',{method:'POST',headers,body:JSON.stringify({action:'sync'})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 let status=await sync();for(let i=0;i<80&&status.backfillStatus!=='done';i++){await new Promise(r=>setTimeout(r,100));status=await sync();}
 assert.equal(status.ready,true);assert.equal(status.loaded,49519);assert.equal(status.provinces,77);assert.equal(status.duplicateExtraRows,585);assert.equal(status.backfillStatus,'done');assert.equal(status.scanned,7);assert.equal(status.updated,3);assert.equal(status.ambiguous,1);assert.equal(status.conflicts,1);
 async function row(id){return db.prepare('SELECT * FROM records WHERE id=?').bind(id).first();}
 const filled=await row('1-unique');assert.equal(filled.subdistrict,reference[2]);assert.equal(filled.district,reference[3]);assert.equal(filled.source_province,reference[4]);assert.equal(filled.province,'นนทบุรี');assert.equal(filled.sect,'ธรรมยุต');assert.notEqual(filled.fingerprint,'old-1-unique');
 const selected=await row('3-disambiguated');assert.equal(selected.subdistrict,namesake[0][2]);assert.equal(selected.district,namesake[0][3]);
 assert.equal((await row('2-ambiguous')).subdistrict,'');assert.equal((await row('4-conflict')).source_province,'เชียงใหม่');assert.equal((await row('4-conflict')).subdistrict,'');assert.equal((await row('5-complete')).updated_at,null);assert.equal((await row('8-trash')).subdistrict,'');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='organization-registry-autofill'").first()).n,3);
 const again=await sync();assert.equal(again.updated,3);assert.equal(again.scanned,7);assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='organization-registry-autofill'").first()).n,3);
 await db.prepare("UPDATE organization_registry_meta SET status='loading',backfill_status='pending'").run();const recovered=await sync();assert.equal(recovered.ready,true);assert.equal(recovered.backfillStatus,'done');assert.equal(recovered.updated,3);
 const anon=await mf.dispatchFetch('https://test.example/api/organization-registry');assert.equal(anon.status,401);const denied=await mf.dispatchFetch('https://test.example/api/organization-registry',{headers:{'oai-authenticated-user-id':'reader','oai-authenticated-user-email':'reader@example.test'}});assert.equal(denied.status,403);const csrf=await mf.dispatchFetch('https://test.example/api/organization-registry',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{"action":"sync"}'});assert.equal(csrf.status,403);
 console.log('PASS: all 49,519 organization rows seeded; safe existing-record backfill, disambiguation, conflicting/manual addresses, identical duplicates, trash exclusion, audit, idempotence and access controls.');
}finally{await mf.dispose();}
