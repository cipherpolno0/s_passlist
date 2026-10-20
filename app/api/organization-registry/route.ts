import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {isAdminEmail} from '../../../lib/admin';
import {bootstrapOrganizationRegistry,organizationRegistryStatus} from '../../../lib/organization-registry-bootstrap';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function authorized(){const user=await getChatGPTUser();if(!user)throw Object.assign(new Error('กรุณาเข้าสู่ระบบ'),{status:401});if(!isAdminEmail(user.email))throw Object.assign(new Error('เฉพาะผู้ดูแลระบบเท่านั้น'),{status:403});if(!env.DB)throw new Error('ฐานข้อมูลยังไม่พร้อม');return user;}
export async function GET(){try{await authorized();return json(await organizationRegistryStatus(env.DB!));}catch(e){const error=e as Error&{status?:number};return json({error:error.message},error.status||400);}}
export async function POST(req:Request){try{await authorized();const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);const body=await req.json() as {action?:string};if(body.action!=='sync')return json({error:'ไม่รองรับคำขอนี้'},400);await bootstrapOrganizationRegistry(env.DB!);return json(await organizationRegistryStatus(env.DB!));}catch(e){const error=e as Error&{status?:number};console.error(e);return json({error:error.message},error.status||400);}}
