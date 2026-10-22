import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from 'cloudflare:workers';
export type Access = {userId:string;email:string;ownerId:string;role:'admin'|'editor'|'viewer'};
export type AuditContext = {requestId:string;actorId:string;actorEmail:string;actorRole:string;ownerId:string;path:string;method:string;action:string;ip:string;userAgent:string;access:Access|null};
const context = new AsyncLocalStorage<AuditContext>();
export const auditContext=()=>context.getStore();
export function withAuditContext<T>(value:AuditContext,run:()=>T){return context.run(value,run);}
export const dataOwnerId=(user:{userId:string})=>context.getStore()?.access?.ownerId||user.userId;
export const canManageData=(user:{userId:string;email:string})=>{const access=context.getStore()?.access;return !!access&&access.userId===user.userId&&access.email.toLowerCase()===user.email.toLowerCase();};
export function systemContext(job:string):AuditContext{return {requestId:crypto.randomUUID(),actorId:'',actorEmail:'',actorRole:'system',ownerId:'',path:job,method:'SYSTEM',action:job,ip:'',userAgent:'',access:null};}
// D1 batches are atomic. The context is set and cleared in the SAME transaction as
// the mutation, so overlapping users cannot be attributed to each other's writes.
const originals=new WeakMap<object,D1PreparedStatement>();
const statementSql=new WeakMap<object,string>();
export function createAuditDatabase(raw:D1Database,value?:AuditContext):D1Database {
 const unwrap=(statement:D1PreparedStatement)=>originals.get(statement)||statement;
 const batch=async <T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{
  const c=value||context.getStore()||systemContext('application');
  if(c.access?.role==='viewer'&&statements.some(s=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(statementSql.get(unwrap(s))||'')))throw new Error('บทบาทผู้ดูข้อมูลไม่สามารถเปลี่ยนข้อมูลได้');
  const results=await raw.batch<T>([
   raw.prepare(`INSERT OR REPLACE INTO audit_context(id,request_id,actor_id,actor_email,actor_role,owner_id,path,method,action,ip,user_agent) VALUES(1,?,?,?,?,?,?,?,?,?,?)`).bind(c.requestId,c.actorId,c.actorEmail,c.actorRole,c.ownerId,c.path,c.method,c.action,c.ip,c.userAgent),
   ...statements.flatMap(statement=>[unwrap(statement),raw.prepare('SELECT changes() AS direct_changes')]),raw.prepare('DELETE FROM audit_context WHERE id=1')
  ]);
  // D1 meta.changes includes trigger writes. Preserve the original contract for
  // leases, optimistic guards and import counters using SQLite changes().
  return statements.map((_,i)=>{const result=results[1+i*2];const direct=results[2+i*2].results[0] as {direct_changes:number};return {...result,meta:{...result.meta,changes:Number(direct.direct_changes)}};});
 };
 const prepare=(sql:string):D1PreparedStatement=>{
  const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>{
   const proxy=new Proxy(statement,{get(target,key){
    if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args));
    if(['run','all','first','raw'].includes(String(key))&&/^\s*(INSERT|UPDATE|DELETE|REPLACE|WITH)\b/i.test(sql))return async (...args:unknown[])=>{
     const result=(await batch([statement]))[0];
     if(key==='first'){const row=(result.results?.[0]||null) as Record<string,unknown>|null;return args[0]&&row?row[String(args[0])]:row;}
     if(key==='raw'){const rows=result.results as Record<string,unknown>[];const keys=Object.keys(rows[0]||{});return args[0]&&(args[0] as {columnNames?:boolean}).columnNames?[keys,...rows.map(r=>keys.map(k=>r[k]))]:rows.map(r=>keys.map(k=>r[k]));}
     return result;
    };
    const found=Reflect.get(target,key,target);return typeof found==='function'?found.bind(target):found;
   }});originals.set(proxy,statement);return proxy;
  };const statement=raw.prepare(sql);statementSql.set(statement,sql);return wrap(statement);
 };
 return new Proxy(raw,{get(target,key){if(key==='prepare')return prepare;if(key==='batch')return batch;if(key==='exec')return ()=>{throw new Error('ใช้ prepare/batch เพื่อบันทึกผู้ดำเนินการ');};const found=Reflect.get(target,key,target);return typeof found==='function'?found.bind(target):found;}});
}
export function auditDatabase(){if(!env.DB)throw new Error('ฐานข้อมูลยังไม่พร้อม');return createAuditDatabase(env.DB);}
