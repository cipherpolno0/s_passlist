// Real Next.js routes + real @supabase/ssr cookies against a local Auth double.
// No real emails, production credentials or user passwords are used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const authPort = 54389, webPort = 3100;
const authOrigin = `http://127.0.0.1:${authPort}`, origin = `http://localhost:${webPort}`;
const user = {id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'TEST_recovery@example.com', email_confirmed_at: '2026-10-23T00:00:00Z', app_metadata: {provider: 'email'}, user_metadata: {}, created_at: '2026-10-23T00:00:00Z'};
const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${jwtPart({alg: 'HS256', typ: 'JWT'})}.${jwtPart({sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: authOrigin + '/auth/v1'})}.VEVTVF9zaWduYXR1cmU`;
let challenge, updates = 0, globalSignOut = false;
const auth = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, authOrigin);
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/auth/v1/recover') {
    assert.equal(body.email, user.email.toLowerCase());
    assert.equal(url.searchParams.get('redirect_to'), origin + '/auth/callback');
    challenge = body.code_challenge;
    assert.equal(body.code_challenge_method, 's256');
    return res.end('{}');
  }
  if (url.pathname === '/auth/v1/token') {
    if (!body.code_verifier || body.auth_code !== 'TEST_valid_code' || createHash('sha256').update(body.code_verifier).digest('base64url') !== challenge) {
      res.statusCode = 400; return res.end(JSON.stringify({code: 'flow_state_expired', msg: 'TEST invalid recovery'}));
    }
    return res.end(JSON.stringify({access_token: accessToken, refresh_token: 'TEST_refresh', token_type: 'bearer', expires_in: 3600, user}));
  }
  if (url.pathname === '/auth/v1/user') {
    if (req.method === 'PUT') {
      assert.equal(body.password, 'TEST_new_password_42!'); updates++;
    }
    return res.end(JSON.stringify(user));
  }
  if (url.pathname === '/auth/v1/logout') {
    globalSignOut = url.searchParams.get('scope') === 'global';
    res.statusCode = 204; return res.end();
  }
  res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => auth.listen(authPort, '127.0.0.1', resolve));
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', 'localhost', '--port', String(webPort)], {
  env: {...process.env, NEXT_PUBLIC_SUPABASE_URL: authOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_only', DATABASE_URL: '', ADMIN_EMAILS: user.email, DATA_OWNER_ID: 'TEST_owner', NEXT_TELEMETRY_DISABLED: '1'},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = ''; next.stdout.on('data', c => {output += c;}); next.stderr.on('data', c => {output += c;});
const jar = new Map();
async function request(path, options = {}, cookies = jar) {
  const response = await fetch(origin + path, {redirect: 'manual', ...options, headers: {...options.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')}});
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0], at = first.indexOf('='), name = first.slice(0, at), value = first.slice(at + 1);
    if (/max-age=0(?:;|$)/i.test(line) || !value) cookies.delete(name); else cookies.set(name, value);
  }
  return response;
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (next.exitCode !== null) throw new Error('Next server stopped');
    try {await fetch(origin + '/login'); ready = true; break;} catch {await new Promise(resolve => setTimeout(resolve, 500));}
  }
  assert.equal(ready, true, 'Next starts');
  assert.equal((await request('/forgot-password?error=toString')).status, 200, 'Unknown error codes are ignored safely');
  const send = await request('/auth/forgot-password', {method: 'POST', headers: {origin}, body: new URLSearchParams({email: user.email})});
  assert.equal(send.status, 303);
  assert.ok(send.headers.get('location').endsWith('/forgot-password?sent=1'));
  assert.ok([...jar.keys()].some(name => name.includes('code-verifier')), 'PKCE verifier is set on the HTTP response');
  const wrongBrowser = await request('/auth/callback?code=TEST_valid_code', {}, new Map());
  assert.ok(wrongBrowser.headers.get('location').includes('error=expired'));
  const callback = await request('/auth/callback?code=TEST_valid_code');
  assert.equal(callback.headers.get('location'), origin + '/reset-password');
  assert.ok([...jar.keys()].some(name => name.includes('auth-token') && !name.includes('code-verifier')), 'Session cookie survives the redirect');
  const form = await request('/reset-password');
  const html = await form.text();
  assert.equal(form.status, 200);
  assert.ok(html.includes('name="password_confirm"'));
  assert.ok(html.includes(user.email));
  assert.equal((await request('/reset-password?error=__proto__')).status, 200);
  const mismatch = await request('/auth/reset-password', {method: 'POST', headers: {origin}, body: new URLSearchParams({password: 'TEST_new_password_42!', password_confirm: 'TEST_mismatch_password'})});
  assert.ok(mismatch.headers.get('location').includes('password-mismatch'));
  assert.equal(updates, 0);
  const changed = await request('/auth/reset-password', {method: 'POST', headers: {origin}, body: new URLSearchParams({password: 'TEST_new_password_42!', password_confirm: 'TEST_new_password_42!'})});
  assert.equal(changed.status, 303);
  assert.ok(changed.headers.get('location').startsWith(origin + '/login?message='));
  assert.equal(updates, 1);
  assert.equal(globalSignOut, true);
  assert.ok(![...jar.keys()].some(name => name.includes('auth-token')), 'Session cookies are cleared');
  const unauthenticated = await request('/reset-password');
  assert.ok(!(await unauthenticated.text()).includes('name="password_confirm"'));
  console.log('PASS: real HTTP PKCE cookie → callback → reset form → password update → sign-out; DB unavailable and mismatch paths verified.');
} catch (error) {
  // All output belongs to this local test double; no real credentials are present.
  console.error(output.slice(-5000));
  throw error;
} finally {
  next.kill('SIGTERM');
  await new Promise(resolve => next.exitCode !== null ? resolve() : next.once('exit', resolve));
  await new Promise(resolve => auth.close(resolve));
}
