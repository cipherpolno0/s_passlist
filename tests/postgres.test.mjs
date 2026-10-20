import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import ExcelJS from 'exceljs';
import {toPostgres} from '../lib/platform/sql.mjs';
let pg,handlers;const state={user:null,bucket:null,db:null};
globalThis.__passlistTest=state;
function statement(source,values=[]){return {
 source,values,bind(...args){return statement(source,args);},
 async all(){const q=toPostgres(source);assert.equal(q.parameters,values.length,source);try{const result=await pg.query(q.sql,values);return {results:result.rows,success:true,meta:{changes:result.affectedRows||0}};}catch(e){throw new Error(e.message+'\n'+q.sql,{cause:e});}},
 async first(column){const result=await this.all();return column?result.results[0]?.[column]??null:result.results[0]??null;},
 run(){return this.all();},
};}
const objects=new Map();
before(async()=>{
 pg=new PGlite();await pg.waitReady;
 const migration=(await fs.readdir('supabase/migrations')).find(x=>x.endsWith('.sql'));
 await pg.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));
 await pg.exec('SET search_path TO passlist,pg_catalog');
 state.db={prepare:statement,batch:async statements=>{return pg.transaction(async tx=>{const original=pg;pg=tx;try{const results=[];for(const s of statements)results.push(await s.run());return results;}finally{pg=original;}});}};
 state.bucket={async get(key){if(!objects.has(key))return null;const body=new Blob([objects.get(key)]);return {body:body.stream(),arrayBuffer:()=>body.arrayBuffer(),text:()=>body.text(),json:async()=>JSON.parse(await body.text())};},async put(key,value){objects.set(key,value);},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
 await fs.mkdir('.sites-runtime/pg-test',{recursive:true});
 await build({stdin:{contents:`export * as passlist from './app/api/passlist/route';export * as publicApi from './app/api/public/route';export * as statistics from './app/api/statistics/route';export * as temples from './app/api/temple-registry/route';export * as organizations from './app/api/organization-registry/route';export * as sect from './app/api/sect-review/route';export {backfillProvinceRegions} from './lib/province-region-backfill';export {backfillExamAges} from './lib/exam-age-backfill';export {backfillVassa} from './lib/vassa-backfill';export {backfillRetainedStatistics} from './lib/statistics-source-service';export {parseExcel} from './lib/excel';export {commitImport} from './lib/import-service';export {statisticsQuery} from './lib/statistics-source-service';export {getTempleRegistrySeed,TEMPLE_REGISTRY_VERSION} from './lib/temple-registry';export {getOrganizationSeed} from './lib/organization-registry';export {safeReturnPath} from './lib/auth-path';export {ownedUploadPath} from './lib/platform/uploads';`,resolveDir:process.cwd()},outfile:'.sites-runtime/pg-test/routes.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'test-runtime',setup(b){
 b.onResolve({filter:/platform\/storage$|^\.\/storage$/},()=>({path:'storage',namespace:'fixture'}));
 b.onResolve({filter:/platform\/runtime$/},()=>({path:'runtime',namespace:'fixture'}));
 b.onResolve({filter:/(?:\.\.\/)*lib\/auth$|^\.\/auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/server-only/},()=>({path:'empty',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='storage'?`const s=globalThis.__passlistTest;export const uploadBucket=()=> 'test-uploads';export const storageBucket=()=> 'test-private';export const bucket=s.bucket;export function storageClient(){return {storage:{from:()=>({download:async key=>{const body=await s.bucket.get(key);return body?{data:new Blob([await body.arrayBuffer()]),error:null}:{data:null,error:{message:'not found'}};},remove:async keys=>{await s.bucket.delete(keys);return {error:null};},createSignedUrl:async()=>({data:{signedUrl:'https://test-storage.example/signed'},error:null})})}};}`:args.path==='runtime'?`const s=globalThis.__passlistTest;export const env={DB:s.db,BUCKET:s.bucket,ADMIN_EMAILS:'admin@example.test'};`:args.path==='auth'?`export async function getCurrentUser(){return globalThis.__passlistTest.user;}`:'',loader:'js'}));
 } }]});
 handlers=await import(path.resolve('.sites-runtime/pg-test/routes.mjs'));
});
after(async()=>{await pg?.close();delete globalThis.__passlistTest;});
const admin={userId:'11111111-1111-4111-8111-111111111111',email:'admin@example.test',displayName:'Test admin'};
async function api(module,query='',body,expected=200){
 const request=new Request('https://test.example/api/'+module+'?'+query,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{Origin:'https://test.example','Content-Type':'application/json'}});
 const log=console.error;if(expected>=400)console.error=()=>{};let response;try{response=await handlers[module][body?'POST':'GET'](request);}finally{console.error=log;}const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
}
async function batch(id,owner=admin.userId){await statement("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,total,valid,issues,summary,created_at,visibility) VALUES(?,?,'พิษณุโลก',2542,'test.xlsx',?,'committed',1,1,0,'{}','test','published')").bind(id,owner,id).run();}
async function record(id,batchId,overrides={}){
 const row={id,batch_id:batchId,owner_id:admin.userId,province:'พิษณุโลก',year:2542,category:'นักธรรม',level:'ตรี',title:'พระ',first_name:'ทดสอบ',last_name:'ระบบ',dharma_name:'',temple:'วัดหนึ่ง',district:'',source_province:'',school:'',note:'private note',sheet:'test',source_row:1,sequence:'1',fingerprint:id,sect:'มหานิกาย',...overrides};
 await statement(`INSERT INTO records(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
}
test('schema is complete, RLS enabled, millisecond leases fit',async()=>{
 const tables=await pg.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='passlist'");assert.equal(tables.rows.length,11);assert.ok(tables.rows.every(r=>r.rowsecurity));
 await statement('INSERT OR IGNORE INTO province_region_meta(version,lease_until,updated_at) VALUES(?,?,?)').bind('test',Date.now(),'test').run();
 assert.ok(Number((await statement('SELECT lease_until FROM province_region_meta WHERE version=?').bind('test').first()).lease_until)>2147483647);
});
test('qualified queries work without session search_path on a transaction pooler',async()=>{
 await pg.exec('SET search_path TO public,pg_catalog');
 const rows=await statement('SELECT COUNT(*) total FROM records').all();assert.equal(Number(rows.results[0].total),0);
 await pg.exec('SET search_path TO passlist,pg_catalog');
});
test('parameter translation preserves quoted question marks and escapes',()=>{
 assert.deepEqual(toPostgres("SELECT '?' x,? y,'it''s ?' z,? a"),{sql:"SELECT '?' x,$1 y,'it''s ?' z,$2 a",parameters:2});
});
test('API requires a verified user and admin allowlist',async()=>{
 state.user=null;await api('passlist','',undefined,401);await api('statistics','',undefined,401);
 state.user={...admin,email:'reader@example.test'};await api('passlist','',undefined,403);state.user=admin;
});
test('JSON arrays, objects, numeric casts, conflict ignore and lookup keys',async()=>{
 const q=await statement("SELECT CAST(key AS INTEGER) idx,json_extract(value,'$[0]') name FROM json_each(?)").bind('[["first"],["second"]]').all();assert.equal(q.results[1].name,'second');
 const obj=await statement('SELECT key FROM json_each(?)').bind('{"พิษณุโลก":5}').all();assert.equal(obj.results[0].key,'พิษณุโลก');
 await batch('main');await record('r1','main');
 const dup=await statement("SELECT r.id FROM records r JOIN json_each(?) j ON r.fingerprint=j.value WHERE r.id='r1'").bind('["r1"]').all();assert.equal(dup.results.length,1);
});
test('public search requires both names, hides private data and unpublished/trashed rows',async()=>{
 await api('publicApi','firstName=ทดสอบ',undefined,400);
 let result=await api('publicApi','firstName=ทด&lastName=ระ');assert.equal(result.total,1);assert.equal(result.items[0].note,undefined);
 await statement("INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) VALUES('trash',?,'trash-record','r1','{}','2026-10-20')").bind(admin.userId).run();
 assert.equal((await api('publicApi','firstName=ทด&lastName=ระ')).total,0);
 await statement("DELETE FROM audit WHERE id='trash'").run();
});
test('Postgres transaction rolls back import and audit together',async()=>{
 await assert.rejects(()=>state.db.batch([statement("UPDATE records SET note='changed' WHERE id='r1'"),statement("INSERT INTO records(id) VALUES('invalid')")]));
 assert.equal((await statement("SELECT note FROM records WHERE id='r1'").first()).note,'private note');
});
test('statistics totals, six category/level counts, trash/sect/owner scope and manual precedence',async()=>{
 for(const category of ['นักธรรม','ธรรมศึกษา'])for(const level of ['ตรี','โท','เอก']){
  const id=category+level;await record(id,'main',{category,level,year:2550});
  await statement("INSERT INTO exam_statistics(id,owner_id,year,province,category,level,sent,passed,source_file,source_sheet,source_row,created_at,updated_at) VALUES(?,?,2550,'พิษณุโลก',?,?,10,2,'test','test',1,'test','test')").bind(id,admin.userId,category,level).run();
 }
 const result=await api('statistics','year=2550');assert.equal(Number(result.total),6);assert.ok(result.items.every(x=>Number(x.passed_list_count)===1));
 await record('extra','main',{year:2550});await record('other-owner','main',{year:2550,owner_id:'other'});
 assert.equal(Number((await api('statistics','year=2550&category=นักธรรม&level=ตรี')).items[0].passed_list_count),2);
 await api('passlist','',{action:'trash-record',id:'extra',acknowledge:true});assert.equal(Number((await api('statistics','year=2550&category=นักธรรม&level=ตรี')).items[0].passed_list_count),1);
 await api('passlist','',{action:'restore-record',id:'extra',acknowledge:true});
});
test('JSON bulk import and retry preserve exact row count',async()=>{
 await batch('json');const columns=['id','batch_id','owner_id','province','year','category','level','title','first_name','last_name','dharma_name','temple','district','source_province','school','note','sheet','source_row','sequence','fingerprint','sect_reviewed'];
 const row=Object.fromEntries(columns.map(key=>[key,['year','source_row','sect_reviewed'].includes(key)?1:'x']));Object.assign(row,{id:'bulk',batch_id:'json',owner_id:admin.userId});
 const sql=`INSERT OR IGNORE INTO records(${columns}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`)} FROM json_each(?)`;
 await statement(sql).bind(JSON.stringify([row])).run();await statement(sql).bind(JSON.stringify([row])).run();
 assert.equal(Number((await statement("SELECT COUNT(*) total FROM records WHERE batch_id='json'").first()).total),1);
});
test('admin dashboard, reference registry status, grouped review and audit queries compile on PostgreSQL',async()=>{
 for(const query of ['action=stats','action=batches','action=search','action=trash','action=groups']){
  const response=await handlers.passlist.GET(new Request('https://test.example/api/passlist?'+query));
  const value=await response.json();assert.equal(response.status,200,query+JSON.stringify(value));
 }
 await api('temples');await api('organizations');await api('sect');
});
test('redirect and upload ownership validation reject hostile inputs',()=>{
 for(const value of ['//evil.test','/\\evil.test','https://evil.test','/auth/logout','/login'])assert.equal(handlers.safeReturnPath(value),'/admin');
 assert.equal(handlers.safeReturnPath('/admin?tab=files'),'/admin?tab=files');
 assert.equal(handlers.ownedUploadPath(`uploads/${admin.userId}/22222222-2222-4222-8222-222222222222.xlsx`,admin.userId),true);
 assert.equal(handlers.ownedUploadPath('uploads/other/test.xlsx',admin.userId),false);
});

test('province backfill updates values and numeric audit JSON atomically',async()=>{
 await handlers.backfillProvinceRegions(state.db);
 assert.equal((await statement("SELECT region FROM records WHERE id='r1'").first()).region,'ภาค 5');
 const audit=await statement("SELECT detail FROM audit WHERE target_id='r1' AND action='province-region-autofill'").first();assert.equal(JSON.parse(audit.detail).afterRegion,'ภาค 5');
});
test('reference seeds load from JSON and registry bootstrap resumes correctly',async()=>{
 assert.equal(handlers.getTempleRegistrySeed().length,44704);assert.equal(handlers.getOrganizationSeed().length,49519);
 const first=await api('temples','',{action:'seed'});assert.ok(first.loaded>=500);
 const org=await api('organizations','',{action:'sync'});assert.ok(org.loaded>0);
});
test('retained Excel statistics are read, deduplicated and overridden by manual corrections',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('statistics');
 sheet.addRow(['ปี พ.ศ.','ภาค','จังหวัด','ประเภท','ชั้น','นิกาย','วัด','ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้','สอบตก','อื่นๆ']);
 sheet.addRow([2555,'ภาค 5','พิษณุโลก','นักธรรม','ตรี','','',10,0,10,8,2,0]);
 await batch('retained');await statement("UPDATE batches SET year=2555 WHERE id='retained'").run();await state.bucket.put('source/retained',new Uint8Array(await book.xlsx.writeBuffer()));
 const result=await handlers.backfillRetainedStatistics(state.db,state.bucket,{owner:admin.userId,id:'retained'});assert.equal(result.status,'done',JSON.stringify(result));
 const statistics=await api('statistics','year=2555');assert.equal(Number(statistics.totals.passed),8);
});

test('signed-upload intake, Excel preview, atomic commit, retry, search and private source isolation',async()=>{
 while(!(await api('temples')).ready)await api('temples','',{action:'seed'});
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('รายชื่อ');
 sheet.addRow(['ลำดับ','คำนำหน้า','ชื่อ','นามสกุล','ประเภท','ระดับ','วัด','อายุ','พรรษา']);sheet.addRow([1,'พระ','TEST_ย้ายระบบ','ทดสอบ','นักธรรม','ตรี','วัดทดสอบ',49,20]);
 const path=`uploads/${admin.userId}/22222222-2222-4222-8222-222222222222.xlsx`;
 await state.bucket.put(path,new Uint8Array(await book.xlsx.writeBuffer()));
 const uploaded=await api('passlist','',{action:'import-upload',upload:{path,filename:'migration.xlsx',fields:{province:'พิษณุโลก',year:'2569',region:'ภาค 5',deferSect:'true',automatic:'false'}}});
 assert.ok(uploaded.id);assert.equal(objects.has(path),false);assert.ok(objects.has('source/'+uploaded.id));
 const preview=await api('passlist','action=preview&id='+uploaded.id);assert.ok(preview.batch);assert.equal(preview.batch.status,'draft');
 const committed=await api('passlist','',{action:'commit',id:uploaded.id,acknowledge:true,excludeErrors:true,publish:false,deferSect:true});assert.equal(committed.done,true);assert.equal(Number(committed.inserted),1);
 const again=await api('passlist','',{action:'commit',id:uploaded.id,acknowledge:true,excludeErrors:true,publish:false,deferSect:true});assert.equal(Number(again.inserted),1);
 assert.equal((await api('publicApi','firstName=TEST_ย้ายระบบ&lastName=ทดสอบ')).total,0);
 await api('passlist','',{action:'publish',id:uploaded.id,acknowledge:true});assert.equal(Number((await api('publicApi','firstName=TEST_ย้ายระบบ&lastName=ทดสอบ')).total),1);
 state.user={...admin,userId:'33333333-3333-4333-8333-333333333333'};
 await api('passlist','action=preview&id='+uploaded.id,undefined,400);state.user=admin;
 const sourceResponse=await handlers.passlist.GET(new Request('https://test.example/api/passlist?action=source&id='+uploaded.id));assert.equal(sourceResponse.status,303);
 await statement("UPDATE records SET birth_year=NULL,age_at_exam=NULL,vassa=NULL WHERE batch_id=?").bind(uploaded.id).run();
 // Isolate this legacy upgrade from unrelated synthetic batches that have no source objects.
 await statement("UPDATE batches SET age_status='done',vassa_status='done' WHERE id<>?").bind(uploaded.id).run();
 await handlers.backfillExamAges(state.db,state.bucket);await handlers.backfillVassa(state.db,state.bucket);
 const upgraded=await statement("SELECT age_status,age_error,vassa_status,vassa_error FROM batches WHERE id=?").bind(uploaded.id).first();assert.equal(upgraded.age_status,'done',upgraded.age_error);assert.equal(upgraded.vassa_status,'done',upgraded.vassa_error);
 const person=await statement('SELECT age_at_exam,vassa FROM records WHERE batch_id=?').bind(uploaded.id).first();assert.equal(Number(person.age_at_exam),49);assert.equal(Number(person.vassa),20);
});
test('bulk sect review writes typed JSON audit values and guards stale patches',async()=>{
 const groups=await api('sect','pending=false'),group=groups.items.find(row=>row.temple==='วัดหนึ่ง');assert.ok(group);
 const updated=await api('sect','',{group,filters:{pending:'false'},sect:'ธรรมยุต',reason:'ตรวจหลักฐานแล้ว',expectedCount:Number(group.count)});assert.ok(updated.updated>0);
 const event=await statement("SELECT detail FROM audit WHERE action='sect-review' LIMIT 1").first();assert.equal(typeof JSON.parse(event.detail).groupCount,'number');
});

test('private PostgreSQL schema and helper functions have no anonymous grants',async()=>{
 await pg.exec('CREATE ROLE anon');
 const access=await pg.query("SELECT has_schema_privilege('anon','passlist','usage') allowed,has_table_privilege('anon','passlist.records','select') can_read");
 assert.equal(access.rows[0].allowed,false);assert.equal(access.rows[0].can_read,false);
 await pg.exec('SET ROLE anon');try{await assert.rejects(()=>statement('SELECT * FROM records').all());}finally{await pg.exec('RESET ROLE');}
});
