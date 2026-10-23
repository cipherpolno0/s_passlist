import {canManageData} from './audit-context';
import { env } from './runtime';
import { getChatGPTUser } from '../app/chatgpt-auth';
export function isAdminEmail(email:string){return (env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());}
export async function getAdmin(){const user=await getChatGPTUser();return user&&canManageData(user)?user:null;}
