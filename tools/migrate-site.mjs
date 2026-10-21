import pg from 'pg';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const TABLES=['batches','records','audit','exam_statistics','temple_registry','temple_registry_meta','organization_registry','organization_registry_meta','province_region_meta','retained_exam_statistics','statistics_sources'];
const identifier=value=>{if(!/^[a-z_]+$/.test(value))throw new Error('Invalid identifier');return '"'+value+'"';};
const digest=value=>createHash('sha256').update(value).digest('hex');
export function validateManifest(manifest){
 assert.ok(manifest&&Array.isArray(manifest.tables),'Invalid source manifest');
 assert.deepEqual(manifest.tables.map(t=>t.name).sort(),[...TABLES].sort(),'Unexpected source tables');
 for(const table of manifest.tables){
  assert.ok(Number.isSafeInteger(Number(table.total))&&Number(table.total)>=0,'Invalid source count');
  assert.ok(Array.isArray(table.columns)&&table.columns.length>0,'Missing columns');
  table.columns.forEach(c=>identifier(c.name));
  assert.equal(new Set(table.columns.map(c=>c.name)).size,table.columns.length,'Duplicate columns');
  assert.ok(table.columns.some(c=>c.primary),'Missing primary key');
 }
 return manifest;
}
// source() must use a private, expiring export endpoint. Do not edit the source
// during this operation. No records, filenames or credentials are logged.
export async function migrate({client,source,log=()=>{}}){
 let inTransaction=false;
 try{
  await client.query('BEGIN');inTransaction=true;
  await client.query("SELECT pg_advisory_xact_lock(hashtext('passlist-import'))");
  await client.query('LOCK TABLE '+[...TABLES,'source_files'].map(t=>'passlist.'+identifier(t)).join(',')+' IN EXCLUSIVE MODE');
  for(const table of [...TABLES,'source_files']){
   const count=Number((await client.query(`SELECT COUNT(*) total FROM passlist.${identifier(table)}`)).rows[0].total);
   assert.equal(count,0,`Target ${table} is not empty; import stopped`);
  }
  const manifest=validateManifest(await(await source({})).json()),pages=[];
  for(const table of manifest.tables){
   const name=identifier(table.name),columns=table.columns.map(c=>identifier(c.name));
   for(let offset=0;offset<Number(table.total);offset+=500){
    const {rows}=await(await source({table:table.name,offset})).json();
    assert.equal(rows.length,Math.min(500,Number(table.total)-offset),'Source page count changed');
    pages.push({query:{table:table.name,offset},hash:digest(JSON.stringify(rows))});
    await client.query(`INSERT INTO passlist.${name} (${columns}) SELECT ${columns} FROM json_populate_recordset(NULL::passlist.${name},$1::json)`,[JSON.stringify(rows)]);
   }
   const actual=Number((await client.query(`SELECT COUNT(*) total FROM passlist.${name}`)).rows[0].total);
   assert.equal(actual,Number(table.total),`${table.name} count mismatch`);log(`${table.name}: ${actual} verified`);
  }
  const batches=(await client.query('SELECT id FROM passlist.batches')).rows,files=[];
  for(const batch of batches)for(const prefix of ['source','preview']){
   const key=`${prefix}/${batch.id}`,bytes=Buffer.from(await(await source({file:key})).arrayBuffer());
   assert.ok(bytes.length>0,'Empty source file');
   await client.query('INSERT INTO passlist.source_files(key,content,content_type) VALUES($1,$2,$3)',[key,bytes,prefix==='source'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/json']);
   const saved=(await client.query('SELECT content FROM passlist.source_files WHERE key=$1',[key])).rows[0].content;
   assert.equal(digest(saved),digest(bytes),'Saved file hash mismatch');files.push({key,hash:digest(bytes)});
  }
  for(const page of pages){const {rows}=await(await source(page.query)).json();assert.equal(digest(JSON.stringify(rows)),page.hash,'Source rows changed; import rolled back');}
  for(const file of files)assert.equal(digest(Buffer.from(await(await source({file:file.key})).arrayBuffer())),file.hash,'Source file changed; import rolled back');
  assert.deepEqual(await(await source({})).json(),manifest,'Source manifest changed; import rolled back');
  await client.query('COMMIT');inTransaction=false;log('All tables and file hashes verified; import committed');
  return {tables:manifest.tables.map(t=>({name:t.name,total:Number(t.total)})),files:files.length};
 }catch(error){if(inTransaction)await client.query('ROLLBACK');throw error;}
}
async function main(){
 if(!process.argv.includes('--apply'))throw new Error('Import requires --apply after target and source review');
 if(process.env.SOURCE_READ_ONLY_CONFIRMED!=='true')throw new Error('Pause source edits, then set SOURCE_READ_ONLY_CONFIRMED=true');
 if(!process.env.SOURCE_EXPORT_TOKEN||!process.env.SOURCE_SITE_URL||!process.env.DATABASE_URL)throw new Error('Set source and database settings in protected environment');
 const sourceOrigin=new URL(process.env.SOURCE_SITE_URL);assert.equal(sourceOrigin.protocol,'https:');
 const source=async query=>{
  const url=new URL('/api/migration-export',sourceOrigin);for(const[key,value]of Object.entries(query))url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.SOURCE_EXPORT_TOKEN},redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Source returned ${response.status}`);return response;
 };
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:1});
 try{const client=await pool.connect();try{await migrate({client,source,log:console.log});}finally{client.release();}}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Import failed; transaction rolled back. Check protected diagnostics and source availability.');process.exitCode=1;});
