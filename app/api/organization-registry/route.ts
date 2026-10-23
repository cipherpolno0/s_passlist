import {withAuditRoute} from '../../../lib/audit-request';
import {auditDatabase,canManageData,dataOwnerId} from '../../../lib/audit-context';
import {env} from '../../../lib/runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {bootstrapOrganizationRegistry,organizationRegistryStatus} from '../../../lib/organization-registry-bootstrap';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function authorized(){const user=await getChatGPTUser();if(!user)throw Object.assign(new Error('กรุณาเข้าสู่ระบบ'),{status:401});if(!canManageData(user))throw Object.assign(new Error('เฉพาะผู้ดูแลระบบเท่านั้น'),{status:403});if(!env.DB)throw new Error('ฐานข้อมูลยังไม่พร้อม');return user;}
async function handleGET(){try{await authorized();return json(await organizationRegistryStatus(auditDatabase()));}catch(e){const error=e as Error&{status?:number};return json({error:error.message},error.status||400);}}
async function handlePOST(req:Request){try{await authorized();const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);const body=await req.json() as {action?:string};if(body.action!=='sync')return json({error:'ไม่รองรับคำขอนี้'},400);await bootstrapOrganizationRegistry(auditDatabase());return json(await organizationRegistryStatus(auditDatabase()));}catch(e){const error=e as Error&{status?:number};console.error(e);return json({error:error.message},error.status||400);}}

export const GET=withAuditRoute(handleGET);

export const POST=withAuditRoute(handlePOST);
