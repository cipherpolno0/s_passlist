import {recoveryMessages} from '../../lib/password-recovery';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function ForgotPassword({searchParams}: {searchParams: Promise<{error?: string; sent?: string}>}) {
  const params = await searchParams;
  const error = params.error && Object.hasOwn(recoveryMessages, params.error) ? recoveryMessages[params.error] : undefined;
  return <main className="card auth-card">
    <h1>ลืมรหัสผ่าน</h1>
    <p>กรอกอีเมลที่ใช้กับบัญชีเว็บธรรมทะเบียน เพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p>
    {error ? <p role="alert" style={{color: '#a94538'}}>{error}</p> : null}
    {params.sent === '1' ? <div role="status">
      <p>หากอีเมลนี้มีบัญชีอยู่ในระบบ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ โปรดตรวจกล่องจดหมายและโฟลเดอร์สแปม</p>
      <p>เปิดลิงก์ในเบราว์เซอร์และอุปกรณ์เดียวกับที่ขอ หากยังไม่ได้รับอีเมล ให้รอสักครู่แล้วลองอีกครั้ง</p>
    </div> : null}
    <form method="post" action="/auth/forgot-password">
      <label className="field"><span>อีเมล</span><input type="email" name="email" autoComplete="email" maxLength={254} required /></label>
      <button className="button primary" type="submit">ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
    </form>
    <p style={{marginTop: 20}}><Link href="/login" prefetch={false}>กลับหน้าเข้าสู่ระบบ</Link></p>
  </main>;
}
