import {supabaseServer} from '../../../lib/supabase-server';
import {isAdminEmail} from '../../../lib/admin';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
 const form=await request.formData(),email=String(form.get('email')||'').trim(),password=String(form.get('password')||'');
 if(!isAdminEmail(email)||password.length<12)return new Response('บัญชีนี้ไม่มีสิทธิ์ หรือรหัสผ่านสั้นกว่า ๑๒ ตัวอักษร',{status:400});
 const {error}=await(await supabaseServer()).auth.signUp({email,password});
 return Response.redirect(new URL('/login?'+(error?'error='+encodeURIComponent('ยังสร้างบัญชีไม่ได้ กรุณาติดต่อผู้ดูแล'):'message='+encodeURIComponent('โปรดตรวจอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ')),request.url),303);
}
