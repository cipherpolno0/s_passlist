import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
const required=['DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','ADMIN_EMAILS'];
const missing=required.filter(key=>!process.env[key]);if(missing.length)throw new Error('Missing configuration: '+missing.join(', '));
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,onnotice:()=>{}});
try{
 const tables=await sql`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='passlist'`;
 if(tables.length!==11||tables.some(t=>!t.rowsecurity))throw new Error('Schema incomplete or RLS disabled');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 for(const name of [process.env.SUPABASE_STORAGE_BUCKET||'passlist-private',process.env.SUPABASE_UPLOAD_BUCKET||'passlist-uploads']){
  const {data,error}=await client.storage.getBucket(name);
  if(error||!data||data.public)throw new Error('Private bucket unavailable');
 }
 console.log('PostgreSQL schema, RLS and private Storage verified (no exam data changed).');
}finally{await sql.end();}
