import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {build}=require('../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild/lib/main.js');
test('API returns structured unavailability when identity lookup or audit storage fails',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'passlist-availability-'));
 try{
  globalThis.__availability={offline:false,accessWrites:0};
  const outfile=join(dir,'route.mjs');
  await build({entryPoints:['lib/audit-request.ts'],outfile,platform:'node',format:'esm',bundle:true,plugins:[{name:'fixtures',setup(b){
   b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
   b.onResolve({filter:/\/postgres$/},()=>({path:'db',namespace:'fixture'}));
   b.onResolve({filter:/\/runtime$/},()=>({path:'runtime',namespace:'fixture'}));
   b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'?`export async function getChatGPTUser(){if(globalThis.__availability.offline==='identity')throw new Error('TEST_secret');return null;}`:path==='db'?`export const database={prepare(){return {bind(){return this;},async run(){if(globalThis.__availability.offline)throw new Error('TEST_secret');globalThis.__availability.accessWrites++;}}}};`:path==='runtime'?`export const env={};`:`export async function headers(){return new Headers();}`}));
  }}]});
  const {withAuditRoute}=await import(pathToFileURL(outfile).href);
  const route=withAuditRoute(async()=>Response.json({items:[]}));
  const request=new Request('https://example.test/api/public?firstName=TEST_first&lastName=TEST_last');
  const ok=await route(request);
  assert.equal(ok.status,200);assert.equal(globalThis.__availability.accessWrites,1);
  for(const offline of [true,'identity']){
   globalThis.__availability.offline=offline;
   const response=await route(request);
   assert.equal(response.status,503);
   assert.match(response.headers.get('content-type'),/application\/json/);
   const body=await response.json();assert.equal(typeof body.error,'string');assert.equal(JSON.stringify(body).includes('TEST_secret'),false);
  }
 }finally{delete globalThis.__availability;await rm(dir,{recursive:true,force:true});}
});
