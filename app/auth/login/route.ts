import {supabaseServer} from '../../../lib/supabase-server';
import {isAdminEmail} from '../../../lib/admin';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
 const form=await request.formData(),email=String(form.get('email')||'').trim(),password=String(form.get('password')||'');
 if(!isAdminEmail(email))return Response.redirect(new URL('/login?error='+encodeURIComponent('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ'),request.url),303);
 const {error}=await(await supabaseServer()).auth.signInWithPassword({email,password});
 return Response.redirect(new URL(error?'/login?error='+encodeURIComponent('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ยืนยันอีเมล'):'/admin',request.url),303);
}
