// Evidence/permission integration in isolated D1. Never uses production data.
import {Miniflare} from '../node_modules/.pnpm/miniflare@4.20260515.0_@types+node@22.19.19/node_modules/miniflare/dist/src/index.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve('dist/server'),paths=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=['index.js',...paths.filter(p=>p!=='index.js')].map(p=>({type:'ESModule',path:path.join(root,p)}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{ADMIN_EMAILS:'admin@example.test'},cf:false});
const admin={'oai-authenticated-user-id':'TEST_OWNER','oai-authenticated-user-email':'admin@example.test'},editor={'oai-authenticated-user-id':'TEST_EDITOR','oai-authenticated-user-email':'editor@example.test'},viewer={'oai-authenticated-user-id':'TEST_VIEWER','oai-authenticated-user-email':'viewer@example.test'};
try{
 const db=await mf.getD1Database('DB');
 for(const filename of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 // Mark automatic reference jobs done for this bounded permission test.
 await db.prepare("INSERT INTO organization_registry_meta(dataset_version,source_filename,source_hash,rows_total,backfill_status,started_at,updated_at) VALUES(?,'TEST','TEST',0,'done','TEST','TEST')").bind(JSON.parse(fs.readFileSync('data/organization-registry-v1.manifest.json','utf8')).version).run();
 const auth=(who)=>who||{};
 async function call(endpoint,who=admin,body){return mf.dispatchFetch('https://test.example'+endpoint,{redirect:'manual',headers:{...auth(who),'User-Agent':'TEST Browser',...(body?{'Content-Type':'application/json',Origin:'https://test.example'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});}
 async function json(endpoint,who=admin,body){const r=await call(endpoint,who,body),t=await r.text();assert.equal(r.status,200,t.slice(0,500));return JSON.parse(t);}
 for(const page of ['/admin','/admin/audit','/admin/staff']){const r=await call(page);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes(page==='/admin'?'ประวัติการใช้งานและแก้ไข':page==='/admin/audit'?'ประวัติการใช้งานและแก้ไขข้อมูล':'มอบหมายสิทธิ์ผู้ใช้งาน'));}
 assert.equal((await call('/api/audit',{})).status,401);
 assert.equal((await call('/api/staff',editor)).status,403);
 for(const [email,role] of [['editor@example.test','editor'],['viewer@example.test','viewer']])await json('/api/staff',admin,{email,role,active:true,reason:'TEST มอบหมายหน้าที่'});
 const grant=await db.prepare("SELECT * FROM audit_events WHERE table_name='staff_access' AND target_id='editor@example.test' AND operation='INSERT'").first();assert.equal(grant.actor_id,'TEST_OWNER');assert.equal(JSON.parse(grant.after_json).role,'editor');assert.equal(grant.before_json,null);
 await db.prepare("INSERT INTO batches(id,owner_id,province,year,filename,hash,status,total,valid,issues,summary,created_at,age_status,vassa_status) VALUES('TEST_BATCH','TEST_OWNER','นนทบุรี',2569,'TEST.xlsx','TEST','committed',2,2,0,'{}','TEST','done','done')").run();
 for(const [id,name] of [['TEST_RECORD','TEST_NAME'],['TEST_SECOND','TEST_SECOND']])await db.prepare("INSERT INTO records(id,batch_id,owner_id,province,year,region,sect,sect_reviewed,category,level,title,first_name,last_name,dharma_name,temple,district,source_province,school,note,sheet,source_row,sequence,fingerprint) VALUES(?,'TEST_BATCH','TEST_OWNER','นนทบุรี',2569,'ภาค 1','มหานิกาย',1,'นักธรรม','ตรี','พระ',?,'TEST_LAST','','TEST_TEMPLE','เมือง','นนทบุรี','','','TEST',2,'1',?)").bind(id,name,id).run();
 assert.equal((await json('/api/passlist?action=search',editor)).total,2);assert.equal((await json('/api/passlist?action=stats',viewer)).stats.total,2);
 assert.equal((await call('/api/audit',editor)).status,403);assert.equal((await call('/api/staff',viewer)).status,403);
 assert.equal((await call('/api/passlist',viewer,{action:'edit',id:'TEST_RECORD',first_name:'TEST_DENIED',reason:'TEST เหตุผล'})).status,403);
 assert.equal((await call('/api/passlist?action=preview&id=TEST_BATCH',viewer)).status,403);
 await json('/api/passlist',editor,{action:'edit',id:'TEST_RECORD',first_name:'TEST_EDITED',reason:'TEST ตรวจแก้ชื่อ'});
 let change=await db.prepare("SELECT * FROM audit_events WHERE table_name='records' AND target_id='TEST_RECORD' AND operation='UPDATE' ORDER BY id DESC LIMIT 1").first();assert.equal(change.actor_id,'TEST_EDITOR');assert.equal(change.actor_email,'editor@example.test');assert.equal(change.owner_id,'TEST_OWNER');assert.equal(change.actor_role,'editor');assert.equal(JSON.parse(change.before_json).first_name,'TEST_NAME');assert.equal(JSON.parse(change.after_json).first_name,'TEST_EDITED');assert.equal(change.action,'edit');
 const requestLog=await db.prepare("SELECT status FROM audit_events WHERE kind='access' AND request_id=?").bind(change.request_id).first();assert.equal(requestLog.status,200);
 // Concurrent actors must never overwrite one another's context.
 await Promise.all([json('/api/passlist',admin,{action:'edit',id:'TEST_RECORD',first_name:'TEST_ADMIN_EDIT',reason:'TEST เจ้าของแก้ไข'}),json('/api/passlist',editor,{action:'edit',id:'TEST_SECOND',first_name:'TEST_EDITOR_EDIT',reason:'TEST เจ้าหน้าที่แก้ไข'})]);
 for(const [target,expected] of [['TEST_RECORD','TEST_OWNER'],['TEST_SECOND','TEST_EDITOR']]){const row=await db.prepare("SELECT actor_id FROM audit_events WHERE table_name='records' AND target_id=? AND operation='UPDATE' ORDER BY id DESC LIMIT 1").bind(target).first();assert.equal(row.actor_id,expected);}
 assert.equal((await db.prepare('SELECT COUNT(*) count FROM audit_context').first()).count,0);
 for(const action of ['purge-record','delete-batch'])assert.equal((await call('/api/passlist',editor,{action,id:'TEST_RECORD',acknowledge:true})).status,403);
 await json('/api/staff',admin,{email:'editor@example.test',role:'viewer',active:false,reason:'TEST ระงับสิทธิ์'});
 assert.equal((await call('/api/passlist?action=stats',editor)).status,403);
 const revoked=await db.prepare("SELECT before_json,after_json FROM audit_events WHERE table_name='staff_access' AND target_id='editor@example.test' ORDER BY id DESC LIMIT 1").first();assert.equal(JSON.parse(revoked.before_json).role,'editor');assert.equal(JSON.parse(revoked.after_json).active,0);
 // Trash/restore must log state changes, permanent deletion preserves the snapshots.
 await json('/api/passlist',admin,{action:'trash-record',id:'TEST_RECORD',acknowledge:true});
 const trashEvidence=await db.prepare("SELECT actor_id,after_json FROM audit_events WHERE table_name='audit' AND target_id='TEST_RECORD' AND action='trash-record' AND operation='INSERT'").first();assert.equal(trashEvidence.actor_id,'TEST_OWNER');assert.equal(JSON.parse(trashEvidence.after_json).action,'trash-record');
 const beforeDelete=await db.prepare("SELECT COUNT(*) count FROM audit_events WHERE target_id='TEST_RECORD'").first();
 await json('/api/passlist',admin,{action:'purge-record',id:'TEST_RECORD',acknowledge:true});
 assert.equal((await db.prepare("SELECT COUNT(*) count FROM records WHERE id='TEST_RECORD'").first()).count,0);
 const deleted=await db.prepare("SELECT before_json,after_json,actor_id FROM audit_events WHERE table_name='records' AND target_id='TEST_RECORD' AND operation='DELETE'").first();assert.ok(deleted);assert.equal(JSON.parse(deleted.before_json).first_name,'TEST_ADMIN_EDIT');assert.equal(deleted.after_json,null);assert.equal(deleted.actor_id,'TEST_OWNER');assert.ok((await db.prepare("SELECT COUNT(*) count FROM audit_events WHERE target_id='TEST_RECORD'").first()).count>beforeDelete.count);
 await assert.rejects(db.prepare('UPDATE audit_events SET actor_id=? WHERE id=?').bind('TEST_FORGED',grant.id).run(),/append-only/);await assert.rejects(db.prepare('DELETE FROM audit_events WHERE id=?').bind(grant.id).run(),/append-only/);
 const filtered=await json('/api/audit?actor=editor%40example.test&table_name=records&kind=change');assert.ok(filtered.items.length>=2);assert.ok(filtered.items.every(r=>r.actor_email==='editor@example.test'&&r.table_name==='records'));
 assert.equal((await call('/api/audit?from=not-a-date')).status,400);
 const exported=await json('/api/audit?table_name=records&export=1');assert.equal(exported.sha256,createHash('sha256').update(JSON.stringify(exported.events)).digest('hex'));assert.ok(exported.events.some(r=>r.operation==='DELETE'));
 assert.equal((await call('/api/audit',viewer)).status,403);
 assert.equal((await call('/api/session',admin,{action:'logout'})).status,303);
 const log=await db.prepare("SELECT * FROM audit_events WHERE path='/api/session' AND method='POST' ORDER BY id DESC LIMIT 1").first();assert.equal(log.actor_id,'TEST_OWNER');assert.equal(log.action,'logout');assert.equal(log.status,303);
 const csrf=await mf.dispatchFetch('https://test.example/api/staff',{method:'POST',headers:{...admin,Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({email:'evil@example.test',role:'editor',active:true,reason:'TEST FORGED'})});assert.equal(csrf.status,403);
 assert.ok((await db.prepare("SELECT COUNT(*) count FROM audit_events WHERE kind='access' AND status=403").first()).count>0);
 const triggerCount=await db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'evidence_%'").first();assert.equal(triggerCount.count,39);
 console.log('PASS: assignment/revocation, owner-scoped delegated edits, viewer/outsider denials, per-row before/after, concurrent actor isolation, atomic context cleanup, purge evidence retention, append-only guards, filters, export SHA-256, logout requests and CSRF.');
}finally{await mf.dispose();}
