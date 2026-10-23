import type {SupabaseClient} from '@supabase/supabase-js';

type AuthFactory = () => Promise<Pick<SupabaseClient, 'auth'>>;
type RecoveryAudit = () => Promise<void>;

export const recoveryMessages: Record<string, string> = {
  'invalid-email': 'กรุณากรอกอีเมลให้ถูกต้อง',
  'service-unavailable': 'ระบบส่งลิงก์ยังไม่พร้อม กรุณาลองใหม่ภายหลัง',
  expired: 'ลิงก์ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่ และเปิดในเบราว์เซอร์เดียวกับที่ขอ',
  'password-too-short': 'รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร',
  'password-too-long': 'รหัสผ่านใหม่ยาวเกินไป กรุณาใช้ไม่เกิน 128 ตัวอักษร',
  'password-mismatch': 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน',
  'password-reused': 'กรุณาตั้งรหัสผ่านใหม่ให้แตกต่างจากรหัสผ่านเดิม',
  'password-policy': 'รหัสผ่านยังไม่ผ่านเงื่อนไขความปลอดภัย กรุณาใช้รหัสผ่านอื่น',
  retry: 'ยังบันทึกรหัสผ่านไม่ได้ กรุณาลองใหม่ หากลิงก์หมดอายุให้ขอลิงก์ใหม่',
};

function redirect(request: Request, path: string) {
  return new Response(null, {status: 303, headers: {
    Location: new URL(path, request.url).toString(),
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }});
}

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

function forbidden() {
  return new Response('Forbidden', {status: 403, headers: {'Cache-Control': 'no-store'}});
}

export async function requestPasswordReset(request: Request, createAuth: AuthFactory) {
  if (!sameOrigin(request)) return forbidden();
  let email: string;
  try {
    const form = await request.formData();
    email = String(form.get('email') || '').trim().toLowerCase();
  } catch {
    return redirect(request, '/forgot-password?error=invalid-email');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect(request, '/forgot-password?error=invalid-email');
  }
  try {
    const supabase = await createAuth();
    const {error} = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('/auth/callback', request.url).toString(),
    });
    // Return the same message for unknown accounts, rate limits and delivery errors.
    // Supabase enforces email rate limits; never expose account existence or tokens.
    if (error) console.warn('Password recovery email request failed', error.code || 'auth_error');
  } catch {
    console.warn('Password recovery service unavailable');
    return redirect(request, '/forgot-password?error=service-unavailable');
  }
  return redirect(request, '/forgot-password?sent=1');
}

export async function completePasswordRecovery(request: Request, createAuth: AuthFactory) {
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  if (params.has('error') || ((!code || code.length > 2048) &&
      (!tokenHash || tokenHash.length > 512 || params.get('type') !== 'recovery'))) {
    return redirect(request, '/forgot-password?error=expired');
  }
  try {
    const supabase = await createAuth();
    // PKCE works with the default Supabase email template and verifier cookie.
    // Also accept recovery-only TokenHash links from a custom recovery template.
    const result = code && code.length <= 2048
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({token_hash: tokenHash!, type: 'recovery'});
    if (result.error) return redirect(request, '/forgot-password?error=expired');
    const {data, error} = await supabase.auth.getUser();
    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      return redirect(request, '/forgot-password?error=expired');
    }
    // Fixed destination: never forward next, tokens or provider errors to the UI.
    return redirect(request, '/reset-password');
  } catch {
    return redirect(request, '/forgot-password?error=expired');
  }
}

export async function updateRecoveredPassword(request: Request, createAuth: AuthFactory, audit?: RecoveryAudit) {
  if (!sameOrigin(request)) return forbidden();
  let password: string, confirmation: string;
  try {
    const form = await request.formData();
    password = String(form.get('password') || '');
    confirmation = String(form.get('password_confirm') || '');
  } catch {
    return redirect(request, '/reset-password?error=retry');
  }
  if (password.length < 12) return redirect(request, '/reset-password?error=password-too-short');
  if (password.length > 128) return redirect(request, '/reset-password?error=password-too-long');
  if (password !== confirmation) return redirect(request, '/reset-password?error=password-mismatch');
  try {
    const supabase = await createAuth();
    // The Auth server, not an unverified cookie or a supplied user ID, identifies the account.
    const {data, error} = await supabase.auth.getUser();
    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      return redirect(request, '/forgot-password?error=expired');
    }
    const result = await supabase.auth.updateUser({password});
    if (result.error) {
      const code = result.error.code;
      if (code === 'session_not_found' || code === 'refresh_token_not_found' || result.error.status === 401) {
        return redirect(request, '/forgot-password?error=expired');
      }
      return redirect(request, '/reset-password?error=' +
        (code === 'same_password' ? 'password-reused' : code === 'weak_password' ? 'password-policy' : 'retry'));
    }
    // Supabase Auth keeps its own password-change audit. App audit is supplementary:
    // an unavailable application database must not make a successful reset look failed.
    try { await audit?.(); } catch { console.warn('Password updated; application audit unavailable'); }
    try {
      const {error: signOutError} = await supabase.auth.signOut({scope: 'global'});
      if (signOutError) await supabase.auth.signOut({scope: 'local'});
    } catch { console.warn('Password updated; sign-out service unavailable'); }
    return redirect(request, '/login?message=' + encodeURIComponent('ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่'));
  } catch {
    console.warn('Password update service unavailable');
    return redirect(request, '/reset-password?error=retry');
  }
}
