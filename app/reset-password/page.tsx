import {supabaseServer} from '../../lib/supabase-server';
import {recoveryMessages} from '../../lib/password-recovery';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function ResetPassword({searchParams}: {searchParams: Promise<{error?: string}>}) {
  const params = await searchParams;
  const message = params.error && Object.hasOwn(recoveryMessages, params.error) ? recoveryMessages[params.error] : undefined;
  let email: string | null = null;
  try {
    const {data, error} = await (await supabaseServer()).auth.getUser();
    if (!error && data.user?.email_confirmed_at) email = data.user.email || null;
  } catch { /* Show a useful recovery screen even when Auth is unavailable. */ }
  return <main className="card auth-card">
    <h1>ตั้งรหัสผ่านใหม่</h1>
    {email ? <>
      <p>บัญชี {email}</p>
      <p>ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และกรอกให้ตรงกันทั้งสองช่อง</p>
      {message ? <p role="alert" style={{color: '#a94538'}}>{message}</p> : null}
      <form method="post" action="/auth/reset-password">
        <label className="field"><span>รหัสผ่านใหม่</span><input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <label className="field"><span>ยืนยันรหัสผ่านใหม่</span><input type="password" name="password_confirm" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <button className="button primary" type="submit">บันทึกรหัสผ่านใหม่</button>
      </form>
    </> : <>
      <p role="alert">กรุณาเปิดลิงก์ตั้งรหัสผ่านจากอีเมล หากลิงก์หมดอายุหรือถูกใช้แล้ว ให้ขอลิงก์ใหม่</p>
      <Link className="button primary" href="/forgot-password" prefetch={false}>ขอลิงก์ตั้งรหัสผ่านใหม่</Link>
    </>}
    <p style={{marginTop: 20}}><Link href="/login" prefetch={false}>กลับหน้าเข้าสู่ระบบ</Link></p>
  </main>;
}
