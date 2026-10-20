'use client';
import {useState,type FormEvent} from 'react';
import {createClient} from '../../lib/supabase/client';
import {safeReturnPath} from '../../lib/auth-path';
type Mode='login'|'forgot'|'reset';
export default function AuthForm({mode,next='/admin',configured=true}:{mode:Mode;next?:string;configured?:boolean}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  const form=new FormData(event.currentTarget);
  try{
   const supabase=createClient();
   if(mode==='login'){
    const {error}=await supabase.auth.signInWithPassword({email:String(form.get('email')).trim(),password:String(form.get('password'))});
    if(error)throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่ได้ยืนยันอีเมล');
    window.location.assign(safeReturnPath(next));return;
   }
   if(mode==='forgot'){
    const redirectTo=new URL('/auth/callback?next=/reset-password',window.location.origin).href;
    const {error}=await supabase.auth.resetPasswordForEmail(String(form.get('email')).trim(),{redirectTo});
    if(error)throw new Error('ส่งคำขอไม่สำเร็จ กรุณารอสักครู่แล้วลองใหม่');
    setMessage('หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้ กรุณาตรวจกล่องจดหมาย');
   }else{
    const password=String(form.get('password'));
    if(password!==form.get('confirm'))throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่');
    const {error}=await supabase.auth.updateUser({password});if(error)throw new Error('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจเงื่อนไขรหัสผ่านหรือลองขอลิงก์ใหม่');
    await supabase.auth.signOut();window.location.assign('/login?updated=1');return;
   }
  }catch(error){setError(error instanceof Error?error.message:'ดำเนินการไม่สำเร็จ');}finally{setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><a href="/" className="brand">ธรรมทะเบียน</a>
  <h1>{mode==='login'?'เข้าสู่ระบบผู้ดูแล':mode==='forgot'?'ลืมรหัสผ่าน':'ตั้งรหัสผ่านใหม่'}</h1>
  <p>{mode==='login'?'ใช้บัญชีผู้ดูแลที่ได้รับสิทธิ์ในระบบ':mode==='forgot'?'กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่':'กำหนดรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร'}</p>
  {!configured?<p className="alert error" role="alert">ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase กรุณาติดต่อผู้ดูแลเว็บไซต์</p>:null}
  {error?<p className="alert error" role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  <form onSubmit={submit}>
   {mode!=='reset'?<label>อีเมล<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>:null}
   {mode!=='forgot'?<label>รหัสผ่าน<input name="password" type="password" autoComplete={mode==='reset'?'new-password':'current-password'} required minLength={mode==='reset'?12:1} maxLength={128}/></label>:null}
   {mode==='reset'?<label>ยืนยันรหัสผ่าน<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>:null}
   <button className="button primary" disabled={busy||!configured}>{busy?'กำลังดำเนินการ…':mode==='login'?'เข้าสู่ระบบ':mode==='forgot'?'ส่งลิงก์ตั้งรหัสผ่าน':'บันทึกรหัสผ่านใหม่'}</button>
  </form>
  {mode==='login'?<a href="/forgot-password">ลืมรหัสผ่าน</a>:<a href="/login">กลับหน้าเข้าสู่ระบบ</a>}
  <a href="/">หน้าสืบค้นทั่วไป</a>
 </section></main>;
}
