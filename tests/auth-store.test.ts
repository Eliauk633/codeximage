import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const password = () => randomBytes(24).toString('base64url');

function fixture(t: TestContext, encrypted = true) {
  const directory = mkdtempSync(path.join(tmpdir(), 'studio-auth-test-'));
  const key = randomBytes(32);
  const clock = { value: Date.UTC(2026, 9, 17) };
  const stores: any[] = [];
  const options = {
    directory,
    now: () => clock.value,
    isEncryptionAvailable: () => encrypted,
    encryptString(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    decryptString(value: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(-16));
      return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
  };
  const open = (overrides = {}) => {
    const { createAuthStore } = require('../electron/auth-store.cjs');
    const store = createAuthStore({ ...options, ...overrides });
    stores.push(store);
    return store;
  };
  t.after(() => {
    for (const store of stores) store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, clock, open, options };
}

test('registration normalizes email and returns only public fields without logging in', async t => {
  const f = fixture(t);
  const store = f.open();
  const result = await store.register({ email: '  Local.User+test@Gmail.com ', password: password(), name: ' 本地用户 ' });
  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'local.user+test@gmail.com');
  assert.equal(result.user.name, '本地用户');
  assert.deepEqual(Object.keys(result.user).sort(), ['createdAt', 'email', 'id', 'lastLoginAt', 'name']);
  assert.equal(result.user.lastLoginAt, null);
  assert.equal((await store.getSession()).user, null);
});

test('duplicate email registration is rejected even across concurrent store instances', async t => {
  const f = fixture(t);
  const a = f.open();
  const b = f.open();
  const results = await Promise.all([
    a.register({ email: 'same@example.test', password: password(), name: 'A' }),
    b.register({ email: ' SAME@EXAMPLE.TEST ', password: password(), name: 'B' }),
    a.register({ email: 'same@example.test', password: password(), name: 'C' }),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => result.code === 'EMAIL_EXISTS').length, 2);
  const db = new DatabaseSync(path.join(f.directory, 'accounts.sqlite'), { readOnly: true });
  try { assert.equal(db.prepare('SELECT count(*) AS count FROM users').get()?.count, 1); } finally { db.close(); }
});

test('wrong and unknown credentials cannot create a session and return the same safe error', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'one@example.test', password: secret, name: 'One' });
  const wrong = await store.login({ email: 'one@example.test', password: password() });
  const unknown = await store.login({ email: 'missing@example.test', password: password() });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'INVALID_CREDENTIALS');
  assert.deepEqual(wrong, unknown);
  assert.equal((await store.getSession()).user, null);
  const correct = await store.login({ email: 'ONE@EXAMPLE.TEST', password: secret });
  assert.equal(correct.ok, true);
  assert.equal(correct.user.lastLoginAt, f.clock.value);
});

test('encrypted sessions survive reopening and logout revokes a copied token', async t => {
  const f = fixture(t);
  let store = f.open();
  const secret = password();
  const registered = await store.register({ email: 'persist@example.test', password: secret, name: 'Persist' });
  await store.login({ email: 'persist@example.test', password: secret });
  const tokenFile = path.join(f.directory, 'session.enc');
  const saved = readFileSync(tokenFile);
  store.close();
  store = f.open();
  assert.equal((await store.getSession()).user.id, registered.user.id);
  assert.deepEqual(await store.logout(), { ok: true });
  assert.equal(existsSync(tokenFile), false);
  assert.equal((await store.getSession()).user, null);
  store.close();
  writeFileSync(tokenFile, saved, { mode: 0o600 });
  store = f.open();
  assert.equal((await store.getSession()).user, null);
});

test('sessions expire at thirty days and cannot read or overwrite a workspace', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'expiry@example.test', password: secret, name: 'Expiry' });
  await store.login({ email: 'expiry@example.test', password: secret });
  f.clock.value += 30 * 24 * 60 * 60 * 1000 - 1;
  assert.ok((await store.getSession()).user);
  f.clock.value += 1;
  assert.equal((await store.getSession()).user, null);
  assert.equal((await store.loadWorkspace()).code, 'UNAUTHENTICATED');
  assert.equal((await store.saveWorkspace('{}')).code, 'UNAUTHENTICATED');
});

test('unavailable encryption permits only a process-local session and provides a warning', async t => {
  const f = fixture(t, false);
  let store = f.open();
  const secret = password();
  await store.register({ email: 'memory@example.test', password: secret, name: 'Memory' });
  const login = await store.login({ email: 'memory@example.test', password: secret });
  assert.equal(login.ok, true);
  assert.equal(typeof login.warning, 'string');
  assert.ok((await store.getSession()).user);
  assert.equal(typeof (await store.getSession()).warning, 'string');
  assert.equal(existsSync(path.join(f.directory, 'session.enc')), false);
  store.close();
  store = f.open();
  assert.equal((await store.getSession()).user, null);
});

test('encryption failures and tampered persisted bytes never restore an authenticated user', async t => {
  const f = fixture(t);
  let store = f.open({ encryptString() { throw new Error('sensitive codec detail'); } });
  const secret = password();
  await store.register({ email: 'codec@example.test', password: secret, name: 'Codec' });
  const login = await store.login({ email: 'codec@example.test', password: secret });
  assert.equal(login.ok, true);
  assert.equal(typeof login.warning, 'string');
  assert.equal(JSON.stringify(login).includes('sensitive codec detail'), false);
  assert.equal(existsSync(path.join(f.directory, 'session.enc')), false);
  store.close();
  writeFileSync(path.join(f.directory, 'session.enc'), randomBytes(50), { mode: 0o600 });
  store = f.open();
  assert.equal((await store.getSession()).user, null);
});

test('passwords and bearer tokens are absent from database and persistence files', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'a@example.test', password: secret, name: 'A' });
  await store.register({ email: 'b@example.test', password: secret, name: 'B' });
  await store.login({ email: 'a@example.test', password: secret });
  const token = f.options.decryptString(readFileSync(path.join(f.directory, 'session.enc')));
  for (const file of readdirSync(f.directory)) {
    const bytes = readFileSync(path.join(f.directory, file));
    assert.equal(bytes.includes(Buffer.from(secret)), false, 'plaintext password must never be persisted');
    assert.equal(bytes.includes(Buffer.from(token)), false, 'bearer token must never be persisted in plaintext');
    if (process.platform !== 'win32') assert.equal(statSync(path.join(f.directory, file)).mode & 0o777, 0o600);
  }
  if (process.platform !== 'win32') assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  const db = new DatabaseSync(path.join(f.directory, 'accounts.sqlite'), { readOnly: true });
  try {
    const rows = db.prepare('SELECT password_hash, password_salt, password_version, password_params FROM users').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].password_salt === rows[1].password_salt, false);
    assert.equal(rows[0].password_hash === rows[1].password_hash, false);
    assert.equal(typeof rows[0].password_version, 'number');
    assert.equal(typeof rows[0].password_params, 'string');
    assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get()?.count, 1);
  } finally { db.close(); }
});

test('workspaces follow the authenticated account and ignore forged account ids', async t => {
  const f = fixture(t);
  const store = f.open();
  const aPassword = password();
  const bPassword = password();
  const a = await store.register({ email: 'a@example.test', password: aPassword, name: 'A' });
  const b = await store.register({ email: 'b@example.test', password: bPassword, name: 'B' });
  assert.equal((await store.saveWorkspace('{}')).code, 'UNAUTHENTICATED');
  await store.login({ email: 'a@example.test', password: aPassword, userId: b.user.id });
  assert.deepEqual(await store.loadWorkspace(b.user.id), { ok: true, data: null });
  assert.deepEqual(await store.saveWorkspace('{"threads":["A"]}', b.user.id), { ok: true });
  await store.logout();
  await store.login({ email: 'b@example.test', password: bPassword, userId: a.user.id });
  assert.deepEqual(await store.loadWorkspace(a.user.id), { ok: true, data: null });
  await store.saveWorkspace('{"threads":["B"]}');
  await store.logout();
  await store.login({ email: 'a@example.test', password: aPassword });
  assert.deepEqual(await store.loadWorkspace(), { ok: true, data: '{"threads":["A"]}' });
});

test('invalid credentials and workspace payloads are rejected before persistence', async t => {
  const f = fixture(t);
  const store = f.open();
  const valid = { email: 'valid@example.test', password: password(), name: 'Valid' };
  for (const change of [
    { email: '' }, { email: 'missing-at.test' }, { email: 'two@@example.test' },
    { email: 'dot..dot@example.test' }, { email: 'a@-bad.test' },
    { name: '' }, { name: ' '.repeat(3) }, { name: 'x'.repeat(65) }, { name: 'bad\nname' },
    { password: password().slice(0, 7) }, { password: password().repeat(5) }, { password: 12345678 },
  ]) assert.equal((await store.register({ ...valid, ...change })).ok, false);
  assert.equal((await store.register(null)).ok, false);
  assert.equal((await store.login(null)).ok, false);
  assert.equal((await store.register(valid)).ok, true);
  await store.login(valid);
  await store.saveWorkspace('{"safe":true}');
  for (const payload of ['not-json', JSON.stringify({ value: '中'.repeat(4_000_000) }),
    JSON.stringify({ nested: { password: password() } }), JSON.stringify({ accessToken: password() })]) {
    assert.equal((await store.saveWorkspace(payload)).ok, false);
  }
  assert.deepEqual(await store.loadWorkspace(), { ok: true, data: '{"safe":true}' });
});

test('repeated failed login attempts are temporarily limited without permanent lockout', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'limit@example.test', password: secret, name: 'Limit' });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await store.login({ email: 'limit@example.test', password: password() })).code, 'INVALID_CREDENTIALS');
  }
  assert.equal((await store.login({ email: 'limit@example.test', password: secret })).code, 'RATE_LIMITED');
  f.clock.value += 60_001;
  assert.equal((await store.login({ email: 'limit@example.test', password: secret })).ok, true);
});

test('logout queued during password verification leaves the store unauthenticated', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'race@example.test', password: secret, name: 'Race' });
  const [login, logout] = await Promise.all([
    store.login({ email: 'race@example.test', password: secret }), store.logout(),
  ]);
  assert.equal(login.ok, true);
  assert.deepEqual(logout, { ok: true });
  assert.equal((await store.getSession()).user, null);
  assert.equal(existsSync(path.join(f.directory, 'session.enc')), false);
});

test('logout remains available when the ordinary operation queue is full', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'busy@example.test', password: secret, name: 'Busy' });
  await store.login({ email: 'busy@example.test', password: secret });
  const reads = Array.from({ length: 32 }, () => store.getSession());
  const logout = store.logout();
  await Promise.all(reads);
  assert.deepEqual(await logout, { ok: true });
  assert.equal((await store.getSession()).user, null);
});

test('password boundary lengths are usable and Unicode is counted as characters', async t => {
  const f = fixture(t);
  const store = f.open();
  const suffix = password().slice(0, 8);
  const secrets = [suffix, password().repeat(4), '密'.repeat(120) + suffix];
  for (const [index, secret] of secrets.entries()) {
    const email = `boundary${index}@example.test`;
    assert.equal((await store.register({ email, password: secret, name: 'Boundary' })).ok, true);
    assert.equal((await store.login({ email, password: secret })).ok, true);
  }
  assert.equal((await store.register({ email: 'long@example.test', password: '密'.repeat(121) + suffix, name: 'Long' })).ok, false);
});

test('registration accepts forty nickname characters and rejects forty-one', async t => {
  const f = fixture(t);
  const store = f.open();
  assert.equal((await store.register({ email: 'name40@example.test', password: password(), name: '名'.repeat(40) })).ok, true);
  assert.equal((await store.register({ email: 'name41@example.test', password: password(), name: '名'.repeat(41) })).code, 'INVALID_NAME');
  assert.equal((await store.register({ email: 'emoji40@example.test', password: password(), name: '😀'.repeat(40) })).ok, true);
  assert.equal((await store.register({ email: 'emoji41@example.test', password: password(), name: '😀'.repeat(41) })).code, 'INVALID_NAME');
});

test('database exceptions expose neither SQL diagnostics nor input credentials', async t => {
  const f = fixture(t);
  const store = f.open();
  const db = new DatabaseSync(path.join(f.directory, 'accounts.sqlite'));
  db.exec("CREATE TRIGGER reject_test_user BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'private database diagnostic'); END");
  db.close();
  const secret = password();
  const result = await store.register({ email: 'error@example.test', password: secret, name: 'Error' });
  assert.equal(result.ok, false);
  const output = JSON.stringify(result);
  assert.equal(output.includes('private database diagnostic'), false);
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes('INSERT'), false);
});

test('closing during a password calculation cannot create a late authenticated session', async t => {
  const f = fixture(t);
  const store = f.open();
  const secret = password();
  await store.register({ email: 'closing@example.test', password: secret, name: 'Closing' });
  const pendingLogin = store.login({ email: 'closing@example.test', password: secret });
  await new Promise(resolve => setImmediate(resolve));
  store.close();
  assert.equal((await pendingLogin).ok, false);
  assert.equal((await f.open().getSession()).user, null);
});
