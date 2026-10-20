// Run locally with a private D1 SQLite backup, exported R2 object directory,
// and an explicit mapping from old Sites owner IDs to new Supabase Auth IDs.
import {DatabaseSync} from 'node:sqlite';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--sqlite')||!args.includes('--objects')||!args.includes('--owner-map'))throw new Error('Usage: node --env-file=.env.local scripts/import-sites-data.mjs --sqlite /private/backup.sqlite --objects /private/r2-export --owner-map /private/owners.json [--apply]');
const source=new DatabaseSync(path.resolve(option('--sqlite')),{readOnly:true});
const map=JSON.parse(await readFile(path.resolve(option('--owner-map')),'utf8'));
const tables=['batches','records','audit','temple_registry','temple_registry_meta','organization_registry','organization_registry_meta','province_region_meta','exam_statistics','retained_exam_statistics','statistics_sources'];
const available=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
const rows=Object.fromEntries(tables.map(table=>[table,available.has(table)?source.prepare(`SELECT * FROM "${table}"`).all():[]]));
for(const table of tables)for(const row of rows[table])if('owner_id' in row){
 const owner=map[row.owner_id];if(typeof owner!=='string'||!/^[0-9a-f-]{36}$/i.test(owner))throw new Error('Every source owner needs an explicit Supabase Auth UUID mapping');row.owner_id=owner;
}
const root=path.resolve(option('--objects')),objects=[];
for(const batch of rows.batches)for(const prefix of ['source','preview']){
 const key=prefix+'/'+batch.id,filename=path.resolve(root,key);
 if(!filename.startsWith(root+path.sep))throw new Error('Invalid source object key');
 let exists=true;try{await stat(filename);}catch{exists=false;}
 if(!exists){if(prefix==='source'||['draft','importing'].includes(batch.status))throw new Error('Missing required object for a batch');continue;}
 const bytes=await readFile(filename);objects.push({key,bytes,hash:createHash('sha256').update(bytes).digest('hex')});
}
console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',tables:Object.fromEntries(tables.map(t=>[t,rows[t].length])),objects:objects.length}));
if(args.includes('--apply')){
 if(!process.env.DATABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Missing private backend configuration');
 const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,onnotice:()=>{}}),client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}}),bucket=client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'passlist-private');
 try{
  for(const id of new Set(Object.values(map))){const {data,error}=await client.auth.admin.getUserById(id);if(error||!data.user)throw new Error('A mapped Supabase Auth user does not exist');}
  await sql.begin(async transaction=>{
   await transaction`SELECT pg_advisory_xact_lock(72391462)`;
   for(const table of tables){const count=await transaction.unsafe(`SELECT count(*) total FROM passlist."${table}"`);if(Number(count[0].total)!==0)throw new Error('Destination must be empty before importing; no data was overwritten');}
   // Upload first. Retries accept an existing byte-for-byte identical object only.
   for(const object of objects){
    const uploaded=await bucket.upload(object.key,object.bytes,{upsert:false,contentType:object.key.startsWith('preview/')?'application/json':'application/octet-stream'});
    if(uploaded.error){const existing=await bucket.download(object.key);if(existing.error||createHash('sha256').update(new Uint8Array(await existing.data.arrayBuffer())).digest('hex')!==object.hash)throw new Error('Storage conflict or upload failure; database import rolled back');}
   }
   for(const table of tables){
    const info=await transaction`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='passlist' AND table_name=${table}`;
    const columns=new Set(info.map(c=>c.column_name)),types=Object.fromEntries(info.map(c=>[c.column_name,c.data_type]));
    for(let offset=0;offset<rows[table].length;offset+=500){
     const part=rows[table].slice(offset,offset+500);if(!part.length)continue;
     const keys=Object.keys(part[0]).filter(k=>columns.has(k));
     const expressions=keys.map(key=>`(value->>'${key}')::${types[key]==='bigint'?'bigint':'text'}`);
     await transaction.unsafe(`INSERT INTO passlist."${table}"(${keys.map(k=>'"'+k+'"').join(',')}) SELECT ${expressions.join(',')} FROM jsonb_array_elements($1::jsonb)`,[JSON.stringify(part)]);
    }
    const count=await transaction.unsafe(`SELECT count(*) total FROM passlist."${table}"`);if(Number(count[0].total)!==rows[table].length)throw new Error('Post-import count mismatch');
   }
  });
  console.log('Imported successfully; all table counts and object bytes verified.');
 }finally{await sql.end();}
}
source.close();
