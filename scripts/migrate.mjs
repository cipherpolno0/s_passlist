import postgres from 'postgres';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL privately before running migration');
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,onnotice:()=>{}});
try{
 await sql.begin(async transaction=>{
  await transaction`SELECT pg_advisory_xact_lock(72391462)`;
  await transaction`CREATE SCHEMA IF NOT EXISTS passlist_meta`;
  await transaction`REVOKE ALL ON SCHEMA passlist_meta FROM PUBLIC,anon,authenticated`;
  await transaction`CREATE TABLE IF NOT EXISTS passlist_meta.schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`;
  await transaction`ALTER TABLE passlist_meta.schema_migrations ENABLE ROW LEVEL SECURITY`;
  await transaction`REVOKE ALL ON passlist_meta.schema_migrations FROM PUBLIC,anon,authenticated`;
  for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   const body=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'),hash=createHash('sha256').update(body).digest('hex');
   const existing=await transaction`SELECT sha256 FROM passlist_meta.schema_migrations WHERE name=${name}`;
   if(existing.length){if(existing[0].sha256!==hash)throw new Error('Applied migration changed: '+name);continue;}
   await transaction.unsafe(body);await transaction`INSERT INTO passlist_meta.schema_migrations(name,sha256) VALUES(${name},${hash})`;
   console.log('Applied '+name);
  }
  await transaction.unsafe(await readFile(new URL('../supabase/storage.sql',import.meta.url),'utf8'));
 });
 console.log('Schema and private Storage bucket are ready.');
}finally{await sql.end();}
