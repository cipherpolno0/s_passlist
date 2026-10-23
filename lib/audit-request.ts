import {headers} from 'next/headers';
import {withAuditContext,type AuditContext,type Access} from './audit-context';
import {resolveAccess,allowedRequest} from './access';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {database} from './postgres';
export async function requestContext(req:Request):Promise<AuditContext>{
 const user=await getChatGPTUser(),access=user?await resolveAccess(database as unknown as D1Database,user.userId,user.email,process.env.ADMIN_EMAILS||''):null;
 const url=new URL(req.url);let action=(url.searchParams.get('action')||'').slice(0,80);
 if(req.method==='POST'){if(req.headers.get('content-type')?.includes('application/json'))try{const body=await req.clone().json() as {action?:unknown};action=typeof body.action==='string'?body.action.slice(0,80):'update';}catch{action='invalid-json';}else action='upload';}
 return {requestId:crypto.randomUUID(),actorId:user?.userId||'',actorEmail:user?.email||'',actorRole:access?.role||(user?'user':'anonymous'),ownerId:access?.ownerId||'',path:url.pathname,method:req.method,action,ip:(req.headers.get('x-vercel-forwarded-for')||'').split(',')[0].trim(),userAgent:(req.headers.get('user-agent')||'').slice(0,512),access};
}
export async function logAccess(c:AuditContext,status:number){await database.prepare(`INSERT INTO audit_events(kind,table_name,target_id,operation,owner_id,request_id,actor_id,actor_email,actor_role,path,method,action,ip,user_agent,status,before_json,after_json,created_at) VALUES('access','','','REQUEST',?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`).bind(c.ownerId,c.requestId,c.actorId,c.actorEmail,c.actorRole,c.path,c.method,c.action,c.ip,c.userAgent,status,new Date().toISOString()).run();}
export function withAuditRoute(handler:(req:Request)=>Promise<Response>){return async(req:Request)=>{
 try {
 const c=await requestContext(req);
 return await withAuditContext(c,async()=>{
  let response:Response;const publicPath=c.path==='/api/public';const origin=req.headers.get('origin');
  if(req.method!=='GET'&&origin!==new URL(req.url).origin)response=Response.json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},{status:403});
  else if(!publicPath&&!c.actorId)response=Response.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});
  else if(!publicPath&&!allowedRequest(c.access,c.path,c.method,c.action))response=Response.json({error:'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ หรือสิทธิ์ถูกระงับแล้ว'},{status:403});
  else try{response=await handler(req);}catch(error){await logAccess(c,500);throw error;}
  await logAccess(c,response.status);const h=new Headers(response.headers);h.set('X-Request-Id',c.requestId);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
 });
 } catch {
  // Never expose connection strings, driver inputs or an empty HTML error to clients.
  console.error('Application request failed; database or audit service unavailable');
  return Response.json({error:'ระบบไม่พร้อมให้บริการในขณะนี้ กรุณาลองใหม่ภายหลัง'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
};}
export async function pageAccess(path:string):Promise<Access|null>{
 const h=await headers(),req=new Request('https://application.local'+path,{headers:h});const c=await requestContext(req);
 await withAuditContext(c,()=>logAccess(c,c.access?200:c.actorId?403:401));return c.access;
}
