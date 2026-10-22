import {auditContext,auditDatabase} from '../../../lib/audit-context';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:Request){
 const c=auditContext();if(c?.access?.role!=='admin')return json({error:'เฉพาะผู้ดูแลหลัก'},403);
 try{
  const url=new URL(req.url),where=["(owner_id=? OR (owner_id='' AND (actor_role IN ('system','database','anonymous','user') OR status IN (401,403))))"],args:unknown[]=[c.ownerId];
  for(const field of ['kind','table_name','target_id','request_id']){const value=url.searchParams.get(field);if(value){where.push(field+'=?');args.push(value.slice(0,200));}}
  const actor=url.searchParams.get('actor');if(actor){where.push('(actor_email LIKE ? ESCAPE \'\\\' OR actor_id LIKE ? ESCAPE \'\\\')');const value='%'+actor.slice(0,254).replace(/[\\%_]/g,'\\$&')+'%';args.push(value,value);}
  const action=url.searchParams.get('action');if(action&&action!=='export'){where.push('(operation=? OR action=?)');args.push(action.slice(0,80),action.slice(0,80));}
  for(const [field,operator] of [['from','>='],['to','<=']] as const){const value=url.searchParams.get(field);if(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('วันที่ไม่ถูกต้อง');where.push('created_at'+operator+'?');args.push(date.toISOString());}}
  const cursor=url.searchParams.get('cursor');if(cursor){if(!/^\d+$/.test(cursor))throw new Error('เลขหน้าไม่ถูกต้อง');where.push('id<?');args.push(Number(cursor));}
  const limit=url.searchParams.get('export')==='1'?1000:50;
  const rows=await auditDatabase().prepare('SELECT * FROM audit_events WHERE '+where.join(' AND ')+' ORDER BY id DESC LIMIT ?').bind(...args,limit+1).all();
  const items=rows.results.slice(0,limit),hasMore=rows.results.length>limit,nextCursor=hasMore?items.at(-1)?.id:null;
  if(url.searchParams.get('export')==='1'){
   const content=JSON.stringify(items),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)),sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   return new Response(JSON.stringify({exportedAt:new Date().toISOString(),requestId:c.requestId,count:items.length,nextCursor,sha256,hashInput:'JSON.stringify(events) encoded as UTF-8',events:items},null,2),{headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="audit-evidence.json"'}});
  }
  return json({items,nextCursor,hasMore});
 }catch(error){return json({error:error instanceof Error?error.message:'โหลดประวัติไม่สำเร็จ'},400);}
}
