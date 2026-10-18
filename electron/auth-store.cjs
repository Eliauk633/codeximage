const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { mkdirSync, chmodSync, openSync, closeSync, lstatSync, readFileSync, writeFileSync, renameSync, rmSync } = require('node:fs');
const path = require('node:path');

const derivePassword = promisify(scrypt);
const PASSWORD_PARAMS = Object.freeze({ N: 32768, r: 8, p: 3, keyLength: 64 });
const PASSWORD_VERSION = 1;
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
const MEMORY_SESSION_WARNING = '系统安全存储不可用，本次登录仅在应用运行期间有效，关闭后需要重新登录。';
const credentialKeys = new Set(['password', 'passwd', 'passwordhash', 'passwordsalt', 'passwordparams',
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken', 'bearer', 'authorization',
  'cookie', 'cookies', 'credential', 'credentials', 'privatekey', 'secret', 'clientsecret', 'apikey']);

const failure = (code, error) => ({ ok: false, error, code });
const publicUser = row => ({ id: row.id, email: row.email, name: row.display_name,
  createdAt: row.created_at, lastLoginAt: row.last_login_at });
const tokenHash = token => createHash('sha256').update(token).digest('hex');

function validateCredentials(input, registration) {
  if (!input || typeof input !== 'object' || typeof input.email !== 'string' || typeof input.password !== 'string') {
    return failure('INVALID_INPUT', '请填写有效邮箱和密码。');
  }
  const email = input.email.trim().toLowerCase();
  const [local = '', domain = '', extra] = email.split('@');
  if (email.length > 254 || local.length > 64 || extra !== undefined
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !domain.includes('.') || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return failure('INVALID_EMAIL', '请输入有效邮箱地址。');
  }
  if (input.password.length > 512 || [...input.password].length < 8 || [...input.password].length > 128) {
    return failure('INVALID_PASSWORD', '密码长度须为 8–128 个字符。');
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (registration && (!name || name.length > 80 || [...name].length > 40 || /[\u0000-\u001f\u007f]/.test(name))) {
    return failure('INVALID_NAME', '昵称须为 1–40 个字符，且不能包含控制字符。');
  }
  return { email, password: input.password, name };
}

function workspaceIsValid(data) {
  if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > MAX_WORKSPACE_BYTES) return false;
  let parsed;
  try { parsed = JSON.parse(data); } catch { return false; }
  const pending = [parsed];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item)) {
      if (credentialKeys.has(key.replace(/[_\s-]/g, '').toLowerCase())) return false;
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  return true;
}

function createAuthStore({ directory, encryptString, decryptString, isEncryptionAvailable, now = Date.now }) {
  let db;
  let databasePath;
  let sessionPath;
  try {
    if (typeof directory !== 'string' || !directory) throw new Error('Invalid directory');
    directory = path.resolve(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!lstatSync(directory).isDirectory()) throw new Error('Invalid directory');
    chmodSync(directory, 0o700);
    databasePath = path.join(directory, 'accounts.sqlite');
    sessionPath = path.join(directory, 'session.enc');
    try { closeSync(openSync(databasePath, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!lstatSync(databasePath).isFile() || lstatSync(databasePath).isSymbolicLink()) throw new Error('Invalid database');
    chmodSync(databasePath, 0o600);
    db = new DatabaseSync(databasePath);
    db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_version INTEGER NOT NULL,
        password_params TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_workspaces (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  } catch {
    try { db?.close(); } catch { /* Initialization may already have closed SQLite. */ }
    throw new Error('账户存储无法打开，请检查应用数据目录权限。');
  }

  let currentToken = null;
  let restored = false;
  let persistentSession = false;
  let warning;
  let closed = false;
  let pendingOperations = 0;
  let queue = Promise.resolve();
  const failedAttempts = new Map();
  let globalFailures = { count: 0, until: 0 };
  const dummySalt = randomBytes(16).toString('hex');

  function enqueue(operation, allowFullQueue = false) {
    if (closed) return Promise.resolve(failure('STORE_CLOSED', '账户存储已关闭。'));
    if (!allowFullQueue && pendingOperations >= 32) return Promise.resolve(failure('RATE_LIMITED', '操作过于频繁，请稍后重试。'));
    pendingOperations += 1;
    const result = queue.then(async () => {
      if (closed) return failure('STORE_CLOSED', '账户存储已关闭。');
      try { return await operation(); } catch { return failure('STORAGE_ERROR', '账户操作失败，请稍后重试。'); }
    }).finally(() => { pendingOperations -= 1; });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function encryptionAvailable() {
    try {
      return typeof encryptString === 'function' && typeof decryptString === 'function'
        && typeof isEncryptionAvailable === 'function' && isEncryptionAvailable() === true;
    } catch { return false; }
  }

  function clearSessionFile() {
    rmSync(sessionPath, { force: true });
  }

  function restoreToken() {
    if (restored) return;
    restored = true;
    let metadata;
    try { metadata = lstatSync(sessionPath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    try {
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024 || !encryptionAvailable()) throw new Error('Invalid session');
      chmodSync(sessionPath, 0o600);
      const token = decryptString(readFileSync(sessionPath));
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
      currentToken = token;
      persistentSession = true;
    } catch {
      warning = '保存的登录状态无法安全恢复，请重新登录。';
      clearSessionFile();
    }
  }

  function sessionUser() {
    restoreToken();
    if (!currentToken) return null;
    const hash = tokenHash(currentToken);
    const row = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hash, now());
    if (row) return row;
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    currentToken = null;
    persistentSession = false;
    clearSessionFile();
    return null;
  }

  function persistToken() {
    if (!encryptionAvailable()) return false;
    const temporaryPath = path.join(directory, `.session-${randomUUID()}.tmp`);
    try {
      const encrypted = encryptString(currentToken);
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.includes(Buffer.from(currentToken))) return false;
      writeFileSync(temporaryPath, encrypted, { flag: 'wx', mode: 0o600 });
      renameSync(temporaryPath, sessionPath);
      chmodSync(sessionPath, 0o600);
      return true;
    } catch {
      clearSessionFile();
      return false;
    } finally { rmSync(temporaryPath, { force: true }); }
  }

  function isLimited(email) {
    const time = now();
    for (const [key, value] of failedAttempts) if (value.until <= time) failedAttempts.delete(key);
    if (globalFailures.until <= time) globalFailures = { count: 0, until: time + 60_000 };
    return (failedAttempts.get(email)?.count || 0) >= 5 || globalFailures.count >= 20;
  }

  function recordFailure(email) {
    const entry = failedAttempts.get(email) || { count: 0, until: now() + 60_000 };
    entry.count += 1;
    failedAttempts.set(email, entry);
    globalFailures.count += 1;
  }

  async function hashPassword(password, salt) {
    return derivePassword(password, Buffer.from(salt, 'hex'), PASSWORD_PARAMS.keyLength,
      { N: PASSWORD_PARAMS.N, r: PASSWORD_PARAMS.r, p: PASSWORD_PARAMS.p, maxmem: 64 * 1024 * 1024 });
  }

  return {
    register(input) {
      return enqueue(async () => {
        const credentials = validateCredentials(input, true);
        if (credentials.ok === false) return credentials;
        const { email, password, name } = credentials;
        if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return failure('EMAIL_EXISTS', '该邮箱已注册，请直接登录。');
        const salt = randomBytes(16).toString('hex');
        const hash = await hashPassword(password, salt);
        try {
          if (closed) return failure('STORE_CLOSED', '账户存储已关闭。');
          const id = randomUUID();
          const timestamp = now();
          try {
            db.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt,
              password_version, password_params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, email, name, hash.toString('hex'), salt, PASSWORD_VERSION, JSON.stringify(PASSWORD_PARAMS), timestamp, timestamp);
          } catch (error) {
            if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return failure('EMAIL_EXISTS', '该邮箱已注册，请直接登录。');
            throw error;
          }
          return { ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) };
        } finally { hash.fill(0); }
      });
    },

    login(input) {
      return enqueue(async () => {
        const credentials = validateCredentials(input, false);
        if (credentials.ok === false) return credentials;
        const { email, password } = credentials;
        if (isLimited(email)) return failure('RATE_LIMITED', '登录失败次数过多，请一分钟后重试。');
        const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        const usable = row && row.password_version === PASSWORD_VERSION && row.password_params === JSON.stringify(PASSWORD_PARAMS)
          && /^[a-f0-9]{32}$/.test(row.password_salt) && /^[a-f0-9]{128}$/.test(row.password_hash);
        const actual = await hashPassword(password, usable ? row.password_salt : dummySalt);
        const expected = usable ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_PARAMS.keyLength);
        const matches = timingSafeEqual(actual, expected);
        actual.fill(0);
        expected.fill(0);
        if (closed) return failure('STORE_CLOSED', '账户存储已关闭。');
        if (!usable || !matches) {
          recordFailure(email);
          return failure('INVALID_CREDENTIALS', '邮箱或密码不正确。');
        }
        restoreToken();
        clearSessionFile();
        const nextToken = randomBytes(32).toString('base64url');
        const timestamp = now();
        db.exec('BEGIN IMMEDIATE');
        try {
          if (currentToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(currentToken));
          db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(timestamp);
          db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
            .run(tokenHash(nextToken), row.id, timestamp, timestamp + SESSION_DURATION);
          db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, row.id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        currentToken = nextToken;
        persistentSession = persistToken();
        warning = persistentSession ? undefined : MEMORY_SESSION_WARNING;
        failedAttempts.delete(email);
        const result = { ok: true, user: publicUser({ ...row, last_login_at: timestamp }) };
        return warning ? { ...result, warning } : result;
      });
    },

    getSession() {
      return enqueue(() => {
        const row = sessionUser();
        const result = { ok: true, user: row ? publicUser(row) : null };
        return warning ? { ...result, warning } : result;
      });
    },

    logout() {
      return enqueue(() => {
        restoreToken();
        if (currentToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(currentToken));
        currentToken = null;
        persistentSession = false;
        warning = undefined;
        clearSessionFile();
        return { ok: true };
      }, true);
    },

    loadWorkspace() {
      return enqueue(() => {
        const user = sessionUser();
        if (!user) return failure('UNAUTHENTICATED', '请先登录。');
        const saved = db.prepare('SELECT payload FROM user_workspaces WHERE user_id = ?').get(user.id);
        return { ok: true, data: saved ? saved.payload : null };
      });
    },

    saveWorkspace(data) {
      return enqueue(() => {
        const user = sessionUser();
        if (!user) return failure('UNAUTHENTICATED', '请先登录。');
        if (!workspaceIsValid(data)) return failure('INVALID_WORKSPACE', '工作区须为不含凭据的有效 JSON，且不能超过 10 MB。');
        db.prepare(`INSERT INTO user_workspaces (user_id, payload, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
          .run(user.id, data, now());
        return { ok: true };
      });
    },

    close() {
      if (closed) return;
      closed = true;
      try {
        if (currentToken && !persistentSession) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(currentToken));
      } finally {
        currentToken = null;
        failedAttempts.clear();
        db.close();
      }
    },
  };
}

module.exports = { createAuthStore };
