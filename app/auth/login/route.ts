import {requestContext,logAccess} from '../../../lib/audit-request';
import {withAuditContext} from '../../../lib/audit-context';
import {database} from '../../../lib/postgres';
import {supabaseServer} from '../../../lib/supabase-server';
import {isAdminEmail} from '../../../lib/admin';
export function GET(request:Request){return Response.redirect(new URL('/login',request.url),303);}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
 const form=await request.formData(),email=String(form.get('email')||'').trim(),password=String(form.get('password')||'');
 if(!await allowedEmail(email))return Response.redirect(new URL('/login?error='+encodeURIComponent('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ'),request.url),303);
 const {error}=await(await supabaseServer()).auth.signInWithPassword({email,password});
 const c=await requestContext(request);c.action=error?'login-failed':'login';await withAuditContext(c,()=>logAccess(c,error?401:200));
 return Response.redirect(new URL(error?'/login?error='+encodeURIComponent('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ยืนยันอีเมล'):'/admin',request.url),303);
}

async function allowedEmail(email:string){return isAdminEmail(email)||!!await database.prepare('SELECT email FROM staff_access WHERE email=? AND active=1').bind(email.trim().toLowerCase()).first();}
