import { env } from './platform/runtime';
import { getCurrentUser } from './auth';
export function isAdminEmail(email:string){return (env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());}
export async function getAdmin(){const user=await getCurrentUser();return user&&isAdminEmail(user.email)?user:null;}
