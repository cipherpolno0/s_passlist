// Read-only migration route for the original Sites checkout only.
// Copy to app/api/migration-export/route.ts after credential approval.
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const tables=['batches','records','audit','exam_statistics','temple_registry','temple_registry_meta','organization_registry','organization_registry_meta','province_region_meta','retained_exam_statistics','statistics_sources'];
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const config=env as typeof env&{MIGRATION_EXPORT_TOKEN_SHA256?:string;MIGRATION_EXPORT_EXPIRES?:string};
 const expires=Number(config.MIGRATION_EXPORT_EXPIRES||0);
 if(!/^[a-f0-9]{64}$/.test(config.MIGRATION_EXPORT_TOKEN_SHA256||'')||!Number.isFinite(expires)||Date.now()>=expires)return new Response('Not found',{status:404,headers});
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==config.MIGRATION_EXPORT_TOKEN_SHA256)return new Response('Forbidden',{status:403,headers});
 const url=new URL(request.url),table=url.searchParams.get('table'),file=url.searchParams.get('file');
 if(file){
  const match=file.match(/^(source|preview)\/([0-9a-f-]{36})$/);if(!match)return new Response('Invalid file',{status:400,headers});
  if(!await env.DB!.prepare('SELECT id FROM batches WHERE id=?').bind(match[2]).first())return new Response('Not found',{status:404,headers});
  const object=await env.BUCKET!.get(file);return object?new Response(object.body,{headers}):new Response('Not found',{status:404,headers});
 }
 if(!table){const manifest=[];for(const name of tables){const count=await env.DB!.prepare(`SELECT COUNT(*) total FROM "${name}"`).first();const columns=await env.DB!.prepare(`PRAGMA table_info("${name}")`).all();manifest.push({name,total:count?.total,columns:columns.results.map(c=>({name:c.name,primary:Number(c.pk)>0}))});}return Response.json({tables:manifest},{headers});}
 if(!tables.includes(table))return new Response('Invalid table',{status:400,headers});
 const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)return new Response('Invalid offset',{status:400,headers});
 const rows=await env.DB!.prepare(`SELECT * FROM "${table}" ORDER BY rowid LIMIT 500 OFFSET ?`).bind(offset).all();return Response.json({rows:rows.results},{headers});
}
