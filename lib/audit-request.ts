import {withAuditContext,type AuditContext} from './audit-context';
import {resolveAccess,allowedRequest} from './access';
export async function auditedRequest(request:Request,env:Cloudflare.Env,run:()=>Promise<Response>):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(!env.DB||(!path.startsWith('/api/')&&!path.startsWith('/admin')&&path!=='/'))return run();
 const userId=request.headers.get('oai-authenticated-user-id')||'',email=request.headers.get('oai-authenticated-user-email')||'';
 let action=(url.searchParams.get('action')||'').slice(0,80);
 if(request.method==='POST'){
  if(request.headers.get('content-type')?.includes('application/json')){
   try {const body=await request.clone().json() as {action?:unknown};action=typeof body.action==='string'?body.action.slice(0,80):'update';}catch{action='invalid-json';}
  }else action='upload';
 }
 if(path==='/api/session'&&request.method==='POST')action='logout';
 const access=await resolveAccess(env.DB,userId,email,env.ADMIN_EMAILS||'');
 const c:AuditContext={requestId:crypto.randomUUID(),actorId:userId,actorEmail:email,actorRole:access?.role||(userId?'user':'anonymous'),ownerId:access?.ownerId||'',path,method:request.method,action,ip:request.headers.get('cf-connecting-ip')||'',userAgent:(request.headers.get('user-agent')||'').slice(0,512),access};
 return withAuditContext(c,async()=>{
  let response:Response;
  const protectedPath=path.startsWith('/admin')||(path!=='/api/public'&&path!=='/api/session'&&path.startsWith('/api/'));
  const foreign=request.method!=='GET'&&request.method!=='HEAD'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin;
  if(foreign)response=Response.json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},{status:403});
  else if(protectedPath&&userId&&!allowedRequest(access,path,request.method,action))response=path.startsWith('/api/')?Response.json({error:'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ หรือสิทธิ์ถูกระงับแล้ว'},{status:403}):new Response('บัญชีนี้ไม่มีสิทธิ์เข้าถึงพื้นที่นี้',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  else if(protectedPath&&!userId&&path.startsWith('/api/'))response=Response.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});
  else try{response=await run();}catch(error){await logAccess(env.DB!,c,500);throw error;}
  await logAccess(env.DB!,c,response.status);
  const headers=new Headers(response.headers);headers.set('X-Request-Id',c.requestId);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 });
}
async function logAccess(db:D1Database,c:AuditContext,status:number){
 await db.prepare(`INSERT INTO audit_events(kind,table_name,target_id,operation,owner_id,request_id,actor_id,actor_email,actor_role,path,method,action,ip,user_agent,status,before_json,after_json,created_at) VALUES('access','','','REQUEST',?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`).bind(c.ownerId,c.requestId,c.actorId,c.actorEmail,c.actorRole,c.path,c.method,c.action,c.ip,c.userAgent,status,new Date().toISOString()).run();
}
