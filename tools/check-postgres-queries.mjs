import {createRequire} from 'node:module';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {postgresSql} from '../lib/postgres.ts';
const require=createRequire(import.meta.url);
const esbuild=require('../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild/lib/main.js');
const captured=[];let fixtureBatch;
globalThis.__passlist_test_db__={prepare(sql){const statement={sql,args:[],bind(...args){return {...this,args};},async first(){captured.push({sql:this.sql,args:this.args});return fixtureBatch&&this.sql.startsWith('SELECT * FROM batches')?fixtureBatch:{total:0,count:0};},async all(){captured.push({sql:this.sql,args:this.args});return {results:[]};}};return statement;},async batch(statements){for(const s of statements)captured.push({sql:s.sql,args:s.args});if(fixtureBatch)fixtureBatch={...fixtureBatch,status:'importing',inserted:1};return statements.map(()=>({results:[],meta:{changes:1}}));}};
fs.mkdirSync('.sites-runtime/pg-check',{recursive:true});
for(const route of ['public','passlist','statistics','sect-review','temple-registry','organization-registry']){
 const outfile=`.sites-runtime/pg-check/${route}.mjs`;
 await esbuild.build({entryPoints:[`app/api/${route}/route.ts`],outfile,platform:'node',format:'esm',bundle:true,packages:'external',plugins:[{name:'test-runtime',setup(build){
  build.onResolve({filter:/\/runtime$/},()=>({path:'runtime',namespace:'stub'}));
  build.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'stub'}));
  build.onResolve({filter:/\/audit-request$/},()=>({path:'audit-request',namespace:'stub'}));
  build.onResolve({filter:/\/audit-context$/},()=>({path:'audit-context',namespace:'stub'}));
  build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='runtime'?"export const env={DB:globalThis.__passlist_test_db__,ADMIN_EMAILS:'compat@example.test'};":args.path==='audit-request'?"export const withAuditRoute=handler=>handler;":args.path==='audit-context'?"export const auditDatabase=()=>globalThis.__passlist_test_db__;export const canManageData=()=>true;export const dataOwnerId=()=> 'compat-owner';":"export async function getChatGPTUser(){return {userId:'compat-owner',email:'compat@example.test',displayName:'Compatibility test'};}"}));
 }}]});
 const module=await import(pathToFileURL(process.cwd()+'/'+outfile).href);
 for(const action of route==='passlist'?['search','stats','batches','trash']:['search']){
  const response=await module.GET(new Request(`https://example.test/api/${route}?action=${route==='statistics'?'list':action}&firstName=ท&lastName=ด`));
  if(response.status!==200)throw new Error(`${route}/${action} returned ${response.status}: ${await response.text()}`);
 }
}
fixtureBatch={id:'compat-batch',owner_id:'compat-owner',status:'draft',inserted:0,valid:1,visibility:'internal'};
await esbuild.build({entryPoints:['lib/import-service.ts'],outfile:'.sites-runtime/pg-check/import-service.mjs',platform:'node',format:'esm',bundle:true,packages:'external',plugins:[{name:'test-import-runtime',setup(build){build.onResolve({filter:/\/runtime$/},()=>({path:'runtime',namespace:'stub'}));build.onResolve({filter:/\/audit-context$/},()=>({path:'audit-context',namespace:'stub'}));build.onLoad({filter:/.*/,namespace:'stub'},({path})=>({contents:path==='audit-context'?"export const auditDatabase=()=>globalThis.__passlist_test_db__;":"export const env={DB:globalThis.__passlist_test_db__,BUCKET:{async put(){}}};"}));}}]});
const service=await import(pathToFileURL(process.cwd()+'/.sites-runtime/pg-check/import-service.mjs').href);
const version=JSON.parse(fs.readFileSync('data/organization-registry-v1.manifest.json','utf8')).version;
await service.commitImport('compat-batch','compat-owner',{publish:false,automatic:false,excludeErrors:false,parsed:{organizationSummary:{ready:true,version},records:[{id:'fixture',sheet:'ทดสอบ',row:1,sequence:'1',title:'',firstName:'ทดสอบ',lastName:'ระบบ',dharmaName:'',category:'ธรรมศึกษา',level:'ตรี',province:'ตาก',year:2542,region:'ภาค 5',sect:'',jurisdiction:'ส่วนภูมิภาค',schoolKind:'',temple:'โรงเรียนทดสอบ',district:'',subdistrict:'',sourceProvince:'ตาก',school:'คณะจังหวัดตาก',note:'',fingerprint:'fixture',errors:[],warnings:[]}]} });
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const queries=[...new Map(captured.map(row=>[row.sql+JSON.stringify(row.args),row])).values()];
const output=['BEGIN; SET LOCAL search_path=passlist,pg_catalog;'];
queries.forEach((q,i)=>{output.push(`PREPARE compat_${i} AS ${postgresSql(q.sql)};`);if(/^\s*(SELECT|WITH)\b/i.test(q.sql))output.push(`EXECUTE compat_${i}${q.args.length?'('+q.args.map(literal).join(',')+')':''};`);output.push(`DEALLOCATE compat_${i};`);});
output.push('ROLLBACK;');fs.writeFileSync('.sites-runtime/pg-check/queries.sql',output.join('\n'));
console.log(`Captured ${queries.length} unique application queries; reads execute and writes prepare without changing data`);
