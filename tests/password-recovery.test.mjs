import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPasswordReset, completePasswordRecovery, updateRecoveredPassword} from '../lib/password-recovery.ts';

const origin = 'https://newspasslist.vercel.app';
const account = {id: 'TEST_user', email: 'TEST_admin@example.com', email_confirmed_at: '2026-10-23T00:00:00Z'};
function fixture(overrides = {}) {
  const calls = [];
  const defaults = {
    resetPasswordForEmail: async () => ({error: null}),
    exchangeCodeForSession: async () => ({error: null}),
    verifyOtp: async () => ({error: null}),
    getUser: async () => ({data: {user: account}, error: null}),
    updateUser: async () => ({error: null}),
    signOut: async () => ({error: null}),
  };
  const auth = Object.fromEntries(Object.keys(defaults).map(name => [name, async (...args) => {
    calls.push({name, args});
    return (overrides[name] || defaults[name])(...args);
  }]));
  return {calls, create: async () => ({auth})};
}
function post(path, values, from = origin) {
  return new Request(origin + path, {method: 'POST', headers: {origin: from}, body: new URLSearchParams(values)});
}
const destination = response => new URL(response.headers.get('location'));
const validPassword = {password: 'TEST_new_password_42!', password_confirm: 'TEST_new_password_42!'};

test('recovery email uses the fixed callback and normalized email without a DB dependency', async () => {
  const f = fixture();
  const r = await requestPasswordReset(post('/auth/forgot-password', {email: ' TEST_Admin@Example.com '}), f.create);
  assert.equal(destination(r).pathname + destination(r).search, '/forgot-password?sent=1');
  assert.deepEqual(f.calls, [{name: 'resetPasswordForEmail', args: ['test_admin@example.com', {redirectTo: origin + '/auth/callback'}]}]);
  assert.match(r.headers.get('cache-control'), /no-store/);
});

test('unknown accounts and provider errors have the same non-enumerating response', async () => {
  const f = fixture({resetPasswordForEmail: async () => ({error: {code: 'email_not_found'}})});
  const r = await requestPasswordReset(post('/auth/forgot-password', {email: 'TEST_unknown@example.com'}), f.create);
  assert.equal(destination(r).pathname + destination(r).search, '/forgot-password?sent=1');
  assert.equal(r.status, 303);
});

test('malformed email never calls Auth', async () => {
  const f = fixture();
  const r = await requestPasswordReset(post('/auth/forgot-password', {email: 'bad-email'}), f.create);
  assert.equal(destination(r).searchParams.get('error'), 'invalid-email');
  assert.equal(f.calls.length, 0);
});

test('missing Auth configuration produces a useful recovery error', async () => {
  const r = await requestPasswordReset(post('/auth/forgot-password', {email: account.email}), async () => {throw new Error('TEST unavailable');});
  assert.equal(destination(r).searchParams.get('error'), 'service-unavailable');
});

for (const from of ['https://attacker.example', 'null', '']) {
  test(`cross-origin mutations rejected (${from || 'missing'})`, async () => {
    const f = fixture();
    assert.equal((await requestPasswordReset(post('/auth/forgot-password', {email: account.email}, from), f.create)).status, 403);
    assert.equal((await updateRecoveredPassword(post('/auth/reset-password', validPassword, from), f.create)).status, 403);
    assert.equal(f.calls.length, 0);
  });
}

test('valid PKCE callback checks the user and strips code and untrusted next', async () => {
  const f = fixture();
  const r = await completePasswordRecovery(new Request(origin + '/auth/callback?code=TEST_code&next=https://attacker.example'), f.create);
  assert.equal(destination(r).href, origin + '/reset-password');
  assert.deepEqual(f.calls.map(c => c.name), ['exchangeCodeForSession', 'getUser']);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
});

test('recovery TokenHash template is supported without accepting another OTP type', async () => {
  const f = fixture();
  const ok = await completePasswordRecovery(new Request(origin + '/auth/callback?token_hash=TEST_hash&type=recovery'), f.create);
  assert.equal(destination(ok).pathname, '/reset-password');
  assert.deepEqual(f.calls[0], {name: 'verifyOtp', args: [{token_hash: 'TEST_hash', type: 'recovery'}]});
  const invalid = fixture();
  const bad = await completePasswordRecovery(new Request(origin + '/auth/callback?token_hash=TEST_hash&type=signup'), invalid.create);
  assert.equal(destination(bad).searchParams.get('error'), 'expired');
  assert.equal(invalid.calls.length, 0);
});

test('expired, reused, missing and provider-error links never reach the password form', async () => {
  for (const query of ['', '?code=TEST_expired', '?error=access_denied&error_description=TEST_secret']) {
    const f = fixture({exchangeCodeForSession: async () => ({error: {code: 'otp_expired'}})});
    const r = await completePasswordRecovery(new Request(origin + '/auth/callback' + query), f.create);
    assert.equal(destination(r).pathname + destination(r).search, '/forgot-password?error=expired');
    assert.ok(!r.headers.get('location').includes('TEST_'));
  }
});

test('a successful exchange still needs a confirmed Auth-server identity', async () => {
  const f = fixture({getUser: async () => ({data: {user: {...account, email_confirmed_at: null}}, error: null})});
  const r = await completePasswordRecovery(new Request(origin + '/auth/callback?code=TEST_code'), f.create);
  assert.equal(destination(r).searchParams.get('error'), 'expired');
});

test('short, long and mismatched passwords never reach the update endpoint', async () => {
  for (const [values, expected] of [
    [{password: 'short', password_confirm: 'short'}, 'password-too-short'],
    [{password: 'T'.repeat(129), password_confirm: 'T'.repeat(129)}, 'password-too-long'],
    [{...validPassword, password_confirm: 'TEST_different_password'}, 'password-mismatch'],
  ]) {
    const f = fixture();
    const r = await updateRecoveredPassword(post('/auth/reset-password', values), f.create);
    assert.equal(destination(r).searchParams.get('error'), expected);
    assert.equal(f.calls.length, 0);
  }
});

test('an unauthenticated or unconfirmed caller cannot update a password', async () => {
  for (const user of [null, {...account, email_confirmed_at: null}]) {
    const f = fixture({getUser: async () => ({data: {user}, error: null})});
    const r = await updateRecoveredPassword(post('/auth/reset-password', validPassword), f.create);
    assert.equal(destination(r).pathname, '/forgot-password');
    assert.deepEqual(f.calls.map(c => c.name), ['getUser']);
  }
});

test('update targets only the authenticated account and then signs out globally', async () => {
  const f = fixture();
  let audited = false;
  const r = await updateRecoveredPassword(post('/auth/reset-password', {...validPassword, user_id: 'TEST_other_user'}), f.create, async () => {audited = true;});
  assert.deepEqual(f.calls.find(c => c.name === 'updateUser').args, [{password: validPassword.password}]);
  assert.deepEqual(f.calls.find(c => c.name === 'signOut').args, [{scope: 'global'}]);
  assert.equal(audited, true);
  assert.equal(destination(r).pathname, '/login');
  assert.ok(destination(r).searchParams.has('message'));
  assert.ok(!r.headers.get('location').includes(validPassword.password));
});

test('a DB audit failure does not undo or misreport a completed password change', async () => {
  const f = fixture();
  const r = await updateRecoveredPassword(post('/auth/reset-password', validPassword), f.create, async () => {throw new Error('TEST database unavailable');});
  assert.equal(destination(r).pathname, '/login');
  assert.ok(f.calls.some(c => c.name === 'signOut'));
});

test('expired sessions, reused passwords and policy errors get actionable safe messages', async () => {
  for (const [code, expected] of [['session_not_found', 'expired'], ['same_password', 'password-reused'], ['weak_password', 'password-policy']]) {
    const f = fixture({updateUser: async () => ({error: {code, message: 'TEST_SECRET_provider_detail'}})});
    const r = await updateRecoveredPassword(post('/auth/reset-password', validPassword), f.create);
    assert.equal(destination(r).searchParams.get('error'), expected);
    assert.ok(!r.headers.get('location').includes('TEST_SECRET'));
    assert.ok(!f.calls.some(c => c.name === 'signOut'));
  }
});

test('sign-out or audit service errors do not report an already changed password as failed', async () => {
  const f = fixture({signOut: async () => {throw new Error('TEST signout unavailable');}});
  const r = await updateRecoveredPassword(post('/auth/reset-password', validPassword), f.create);
  assert.equal(destination(r).pathname, '/login');
});
