import test from 'node:test';
import assert from 'node:assert/strict';
import {migrate,TABLES,validateManifest} from '../tools/migrate-site.mjs';
function fixture({occupied=false,changed=false,brokenFile=false}={}){
 const manifest={tables:TABLES.map(name=>({name,total:name==='batches'?1:0,columns:[{name:'id',primary:true}]}))};
 const calls=[],counts=new Map(),contents=new Map();let pages=0;
 const client={async query(sql,args){calls.push(sql);
  if(sql.startsWith('SELECT COUNT')){const name=sql.match(/passlist\."([a-z_]+)"/)[1];return {rows:[{total:counts.get(name)||(occupied?1:0)}]};}
  if(sql.startsWith('INSERT INTO passlist."batches"'))counts.set('batches',JSON.parse(args[0]).length);
  if(sql==='SELECT id FROM passlist.batches')return {rows:[{id:'00000000-0000-4000-8000-000000000000'}]};
  if(sql.startsWith('INSERT INTO passlist.source_files'))contents.set(args[0],args[1]);
  if(sql.startsWith('SELECT content'))return {rows:[{content:brokenFile?Buffer.from('wrong'):contents.get(args[0])}]};
  return {rows:[]};
 }};
 const source=async query=>{
  if(query.file)return new Response('original file');
  if(query.table)return Response.json({rows:[{id:changed&&pages++>0?'changed':'00000000-0000-4000-8000-000000000000'}]});
  return Response.json(manifest);
 };
 return {client,source,calls,manifest};
}
test('complete migration commits only after row and file verification',async()=>{const f=fixture();const result=await migrate(f);assert.equal(result.files,2);assert.equal(f.calls.at(-1),'COMMIT');});
test('nonempty target rolls back without inserting',async()=>{const f=fixture({occupied:true});await assert.rejects(migrate(f),/not empty/);assert.equal(f.calls.at(-1),'ROLLBACK');assert.ok(!f.calls.some(s=>s.startsWith('INSERT')));});
test('source row changes roll back the complete import',async()=>{const f=fixture({changed:true});await assert.rejects(migrate(f),/Source rows changed/);assert.equal(f.calls.at(-1),'ROLLBACK');});
test('saved file corruption rolls back the complete import',async()=>{const f=fixture({brokenFile:true});await assert.rejects(migrate(f),/hash mismatch/);assert.equal(f.calls.at(-1),'ROLLBACK');});
test('unrecognized source table cannot select a destination table',()=>{const f=fixture();f.manifest.tables[0].name='users';assert.throws(()=>validateManifest(f.manifest),/Unexpected source tables/);});
