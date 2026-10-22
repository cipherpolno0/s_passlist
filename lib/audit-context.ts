import { env } from './runtime';
export type Access = {userId:string;email:string;ownerId:string;role:'admin'|'editor'|'viewer'};
export type AuditContext = {requestId:string;actorId:string;actorEmail:string;actorRole:string;ownerId:string;path:string;method:string;action:string;ip:string;userAgent:string;access:Access|null};
import {context} from './audit-store.mjs';
export const auditContext=()=>context.getStore();
export function withAuditContext<T>(value:AuditContext,run:()=>T){return context.run(value,run);}
export const dataOwnerId=(user:{userId:string})=>context.getStore()?.access?.ownerId||user.userId;
export const canManageData=(user:{userId:string;email:string})=>{const access=context.getStore()?.access;return !!access&&access.userId===user.userId&&access.email.toLowerCase()===user.email.toLowerCase();};
export function systemContext(job:string):AuditContext{return {requestId:crypto.randomUUID(),actorId:'',actorEmail:'',actorRole:'system',ownerId:'',path:job,method:'SYSTEM',action:job,ip:'',userAgent:'',access:null};}
export function auditDatabase(){return env.DB;}
