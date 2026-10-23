import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function Login({searchParams}: {searchParams: Promise<{error?: string; message?: string}>}) {
  const params = await searchParams;
  return <main className="card auth-card">
    <h1>เข้าสู่ระบบผู้ดูแล</h1>
    <p>ใช้บัญชีอีเมลผู้ดูแลระบบที่ได้รับอนุญาต</p>
    {params.error ? <p role="alert" style={{color: '#a94538'}}>{params.error}</p> : null}
    {params.message ? <p role="status">{params.message}</p> : null}
    <form method="post" action="/auth/login">
      <label className="field"><span>อีเมล</span><input type="email" name="email" autoComplete="username" required /></label>
      <label className="field"><span>รหัสผ่าน</span><input type="password" name="password" autoComplete="current-password" minLength={12} required /></label>
      <button className="button primary" type="submit">เข้าสู่ระบบ</button>
      <button className="button secondary" type="submit" formAction="/auth/register">สร้างบัญชีผู้ดูแล</button>
    </form>
    <p style={{marginTop: 20}}><Link href="/forgot-password" prefetch={false}>ลืมรหัสผ่าน?</Link></p>
    <p style={{marginTop: 20}}><Link href="/" prefetch={false}>กลับหน้าสืบค้นสำหรับผู้ใช้งานทั่วไป</Link></p>
  </main>;
}
