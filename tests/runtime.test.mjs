import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {databaseConfig} from '../lib/database-config.mjs';
import {database,postgres} from '../lib/postgres.ts';
import {context} from '../lib/audit-store.mjs';

test('invalid database configuration never discloses the original value',()=>{
 for(const value of [undefined,'not-a-url-WITH_PASSWORD','postgres://postgres:private@localhost/db','postgres://passlist_app:private@localhost/db?sslmode=disable']){
  assert.throws(()=>databaseConfig(value),error=>error.message==='Database configuration is unavailable or invalid'&&!error.message.includes('private'));
 }
 assert.equal(databaseConfig('postgresql://passlist_app.TEST_ref:TEST_password@localhost:6543/postgres').ssl.rejectUnauthorized,true);
});

test('viewer reads retain access evidence while changes roll back',async t=>{
 process.env.DATABASE_URL='postgresql://passlist_app.TEST_ref:TEST_password@localhost:6543/postgres';
 const queries=[];
 t.mock.method(pg.Pool.prototype,'connect',async()=>({query:async(sql,args)=>{queries.push({sql,args});return {rows:[],rowCount:1};},release(){}}));
 const viewer={requestId:'TEST_request',actorId:'TEST_viewer',actorEmail:'TEST_viewer@example.test',actorRole:'viewer',ownerId:'TEST_owner',path:'/api/passlist',method:'GET',action:'search',access:{role:'viewer'}};
 await context.run(viewer,async()=>{
  await database.prepare('SELECT id FROM records WHERE owner_id=?').bind('TEST_owner').all();
  await database.prepare("INSERT INTO audit_events(kind) VALUES(?)").bind('access').run();
  const accessWrite=queries.some(q=>q.sql.startsWith('INSERT INTO audit_events'));
  assert.equal(accessWrite,true);
  await assert.rejects(database.prepare('UPDATE records SET first_name=? WHERE id=?').bind('TEST_name','TEST_record').run(),/ผู้ดูข้อมูล/);
  assert.equal(queries.some(q=>q.sql.startsWith('UPDATE records')),false);
  assert.equal(queries.at(-1).sql,'ROLLBACK');
 });
 await postgres().end();
});
