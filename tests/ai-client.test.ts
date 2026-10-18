import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalizeAIEndpoint, createSSEParser, createAIClient } = require('../electron/ai-client.cjs');

const binding = { ownerId: 'owner-one', generation: 1, webContentsId: 7 };
const input = { ownerId: binding.ownerId, requestId: 'request-one', threadId: 'thread-one', displayModel: 'GPT-6 Astra', messages: [{ role: 'user', content: '你好' }] };
function response(text: string, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
function fixture(fetchImpl: typeof fetch, current = () => true) {
  const events: any[] = [];
  const client = createAIClient({ baseUrl: 'http://127.0.0.1:8787', token: 'test-gateway-token', fetchImpl, isCurrent: current, onEvent: (event: any) => events.push(event) });
  return { client, events };
}

test('endpoint permits HTTPS and explicit loopback HTTP while rejecting credential-bearing or unsafe URLs', () => {
  assert.equal(normalizeAIEndpoint('https://service.example/api/'), 'https://service.example/api');
  assert.equal(normalizeAIEndpoint('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(normalizeAIEndpoint('http://[::1]:8787'), 'http://[::1]:8787');
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?q=secret', 'https://example.com#secret', 'file:///tmp/key', 'http://localhost.example.com', 'https://example.com\n', 'http://2130706433', 'http://127.1']) {
    assert.throws(() => normalizeAIEndpoint(url), undefined, url);
  }
});

test('status is local only, reports missing token and never returns secrets', () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('should not fetch'); };
  const { client } = fixture(fetchImpl);
  assert.deepEqual(client.status(), { ok: true, configured: true, url: 'http://127.0.0.1:8787' });
  const absent = createAIClient({ baseUrl: 'http://127.0.0.1:8787', token: '', fetchImpl });
  assert.equal(absent.status().configured, false);
  assert.equal(absent.start(input, binding).code, 'NOT_CONFIGURED');
  const invalid = createAIClient({ baseUrl: 'http://outside.test', token: 'secret', fetchImpl });
  assert.equal(invalid.status().code, 'INVALID_CONFIG');
  assert.equal(JSON.stringify(invalid.status()).includes('secret'), false);
  assert.equal(calls, 0);
});

test('SSE accepts split CRLF, comments and multiline JSON, and rejects malformed/oversized events', () => {
  const events: any[] = [];
  const parser = createSSEParser((event: any) => events.push(event));
  for (const char of ': keepalive\r\ndata: {"type":"delta",\r\ndata: "text":"中文"}\r\n\r\ndata: {"type":"done"}\n\n') parser.push(char);
  parser.finish();
  assert.deepEqual(events, [{ type: 'delta', text: '中文' }, { type: 'done' }]);
  assert.throws(() => createSSEParser(() => {}).push('data: nope\n\n'));
  assert.throws(() => createSSEParser(() => {}).push('x'.repeat(1_048_577)));
  assert.throws(() => createSSEParser(() => {}).push('data: {"type":"delta","text":123}\n\n'));
});

test('streamed UTF8 deltas retain identity and only displayModel/messages reach authenticated gateway', async () => {
  let received: any;
  const { client, events } = fixture(async (url, options) => {
    received = { url, ...options };
    return response('data: {"type":"delta","text":"你好🙂"}\n\ndata: {"type":"done"}\n\n');
  });
  assert.deepEqual(client.start(input, binding), { ok: true });
  await client.whenIdle();
  assert.equal(received.url, 'http://127.0.0.1:8787/chat');
  assert.equal(received.redirect, 'error');
  assert.equal(received.headers.Authorization, 'Bearer test-gateway-token');
  assert.deepEqual(JSON.parse(received.body), { displayModel: input.displayModel, messages: input.messages });
  assert.deepEqual(events, [
    { ownerId: binding.ownerId, requestId: input.requestId, threadId: input.threadId, type: 'delta', text: '你好🙂' },
    { ownerId: binding.ownerId, requestId: input.requestId, threadId: input.threadId, type: 'done' },
  ]);
});

test('wrong account, stale session, malformed messages, and duplicate active thread never start requests', async () => {
  let calls = 0;
  let controller: ReadableStreamDefaultController;
  const { client } = fixture(async () => { calls++; return new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { 'Content-Type': 'text/event-stream' } }); });
  assert.equal(client.start({ ...input, ownerId: 'other' }, binding).code, 'UNAUTHENTICATED');
  assert.equal(client.start({ ...input, messages: [{ role: 'system', content: 'bad' }] }, binding).code, 'INVALID_REQUEST');
  assert.equal(client.start({ ...input, messages: [{ role: 'user', content: 'x'.repeat(200_001) }] }, binding).code, 'INVALID_REQUEST');
  assert.equal(client.start(input, binding).ok, true);
  assert.equal(client.start({ ...input, requestId: 'request-two' }, binding).code, 'BUSY');
  await new Promise(resolve => setImmediate(resolve));
  client.cancelAll();
  try { controller!.close(); } catch { /* cancelled stream */ }
  await client.whenIdle();
  assert.equal(calls, 1);
  const stale = fixture(async () => { throw new Error('never'); }, () => false);
  assert.equal(stale.client.start(input, binding).code, 'UNAUTHENTICATED');
});

test('cancel aborts fetch and ignores late chunks; another session cannot cancel a request', async () => {
  let controller: ReadableStreamDefaultController;
  let signal: AbortSignal;
  const { client, events } = fixture(async (_url, options) => {
    signal = options!.signal as AbortSignal;
    return new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  client.start(input, binding);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.cancel(input, { ...binding, generation: 2 }).code, 'UNAUTHENTICATED');
  assert.equal(client.cancel(input, binding).ok, true);
  assert.equal(signal!.aborted, true);
  try { controller!.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"late"}\n\n')); controller!.close(); } catch { /* cancelled stream */ }
  await client.whenIdle();
  assert.deepEqual(events.map(e => e.type), ['cancelled']);
});

test('session replacement suppresses every late event and cancelAll drains active work', async () => {
  let active = true;
  let resolveFetch: (value: Response) => void;
  const { client, events } = fixture(() => new Promise(resolve => { resolveFetch = resolve; }), () => active);
  client.start(input, binding);
  await new Promise(resolve => setImmediate(resolve));
  active = false;
  client.cancelAll();
  resolveFetch!(response('data: {"type":"delta","text":"late"}\n\ndata: {"type":"done"}\n\n'));
  await client.whenIdle();
  assert.deepEqual(events, []);
});

test('upstream rejection and thrown errors never expose raw bodies, credentials or URL strings', async () => {
  for (const fetchImpl of [
    async () => new Response(JSON.stringify({ ok: false, error: 'test-gateway-token secret stack', code: 'UNAUTHORIZED' }), { status: 401 }),
    async () => { throw new Error('Authorization: test-gateway-token at https://private.example'); },
    async () => new Response('', { status: 302, headers: { Location: 'https://other.example' } }),
    async () => response('data: {"type":"error","error":"test-gateway-token secret","code":"UPSTREAM_ERROR"}\n\n'),
  ]) {
    const { client, events } = fixture(fetchImpl);
    client.start(input, binding); await client.whenIdle();
    assert.equal(events.length, 1); assert.equal(events[0].type, 'error');
    assert.equal(JSON.stringify(events).includes('test-gateway-token'), false);
    assert.equal(JSON.stringify(events).includes('private.example'), false);
  }
});

test('missing terminal, wrong content type and invalid UTF8 report protocol error', async () => {
  for (const reply of [response('data: {"type":"delta","text":"partial"}\n\n'), new Response('<html>bad</html>'), new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'text/event-stream' } })]) {
    const { client, events } = fixture(async () => reply);
    client.start(input, binding); await client.whenIdle();
    assert.equal(events.at(-1).type, 'error');
    assert.equal(events.at(-1).code, 'INVALID_RESPONSE');
  }
});

// Exercise the actual Electron entrypoint with an in-memory window/auth store, without opening UI or touching SQLite.
async function mainHarness() {
  const { EventEmitter } = await import('node:events');
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const path = await import('node:path');
  const handles = new Map<string, Function>();
  const intervals: Array<() => void> = [];
  const app: any = new EventEmitter();
  Object.assign(app, { isPackaged: false, setName() {}, getPath: () => '/tmp/studio-ai-unit', setPath() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {} });
  const sent: any[] = [], windows: any[] = [], pending: Array<(reply: Response) => void> = [];
  let currentUser: any = null;
  const store = {
    async getSession() { return { ok: true, user: currentUser }; },
    async login(value: any) { currentUser = { id: value.id }; return { ok: true, user: currentUser }; },
    async logout() { currentUser = null; return { ok: true }; },
    async loadWorkspace() { return { ok: true, data: null }; },
    close() {},
  };
  class Window extends EventEmitter {
    webContents: any;
    constructor() {
      super();
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { id: windows.length + 1, mainFrame: { url: 'http://127.0.0.1:5187' }, isDestroyed: () => false, setWindowOpenHandler() {}, send: (channel: string, event: any) => sent.push({ channel, event }) });
      windows.push(this);
    }
    isDestroyed() { return false; }
    loadURL() { return Promise.resolve(); }
    show() {}
    static getAllWindows() { return windows; }
  }
  app.dock = { setIcon() {} };
  const electron = { app, nativeImage: { createFromPath: () => ({ isEmpty: () => false }) }, BrowserWindow: Window, clipboard: {}, dialog: {}, ipcMain: { handle: (name: string, callback: Function) => handles.set(name, callback), on() {} }, Menu: { buildFromTemplate: (v: any) => v, setApplicationMenu() {} }, session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {}, webRequest: { onBeforeRequest() {} } } }, safeStorage: {} };
  runInNewContext(readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'), {
    require: (name: string) => name === 'electron' ? electron : name === 'node:fs' ? { mkdirSync() {} }
      : name === '../scripts/local-config.cjs' ? { readLocalConfig: () => ({ CODEX_STUDIO_AI_TOKEN: 'unit-token' }) }
      : name === './auth-store.cjs' ? { createAuthStore: () => store }
        : name === './ai-client.cjs' ? { createAIClient: (options: any) => createAIClient({ ...options, fetchImpl: () => new Promise(resolve => pending.push(resolve)) }) } : require(name),
    __dirname: path.resolve('electron'), process: { platform: 'darwin', env: { CODEX_STUDIO_DEV_URL: 'http://127.0.0.1:5187', CODEX_STUDIO_AI_TOKEN: 'unit-token' } }, URL, setImmediate, setTimeout, clearTimeout, setInterval: (callback: () => void) => { intervals.push(callback); return { unref() {} }; }, clearInterval() {},
  });
  await new Promise(resolve => setImmediate(resolve));
  const window = windows[0], event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return { handles, sent, pending, window, event, intervals, expireSession: () => { currentUser = null; }, call: (name: string, value?: any) => handles.get(name)!(event, value) };
}

test('Electron bridge checks trusted frame/account and does not block logout on a streaming request', async () => {
  const h = await mainHarness();
  assert.equal((await h.call('ai:start', input)).code, 'UNAUTHENTICATED');
  await h.call('auth:login', { id: binding.ownerId });
  assert.equal((await h.handles.get('ai:start')!({ ...h.event, senderFrame: {} }, input)).code, 'UNTRUSTED');
  assert.equal((await h.call('ai:status')).configured, true);
  assert.equal((await h.call('ai:start', input)).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.pending.length, 1);
  assert.equal((await h.call('auth:logout')).ok, true);
  await h.call('auth:login', { id: 'owner-two' });
  h.pending.shift()!(response('data: {"type":"delta","text":"wrong account"}\n\ndata: {"type":"done"}\n\n'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sent.some((e: any) => e.channel === 'ai:event'), false);
});

test('Electron main-frame navigation invalidates in-flight requests even when the account is unchanged', async () => {
  const h = await mainHarness();
  await h.call('auth:login', { id: binding.ownerId });
  await h.call('ai:start', input);
  await new Promise(resolve => setImmediate(resolve));
  h.window.webContents.emit('did-start-navigation', {}, 'http://127.0.0.1:5187', false, true);
  h.pending.shift()!(response('data: {"type":"delta","text":"old document"}\n\ndata: {"type":"done"}\n\n'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sent.some((e: any) => e.channel === 'ai:event'), false);
});

test('UTF8 input and response caps match gateway boundaries before oversized data reaches UI', async () => {
  const { client, events } = fixture(async () => response(Array.from({ length: 9 }, () => `data: ${JSON.stringify({ type: 'delta', text: 'x'.repeat(32_000) })}\n\n`).join('') + 'data: {"type":"done"}\n\n', 32_000));
  assert.equal(client.start({ ...input, messages: [{ role: 'user', content: '中'.repeat(22_000) }] }, binding).code, 'INVALID_REQUEST');
  assert.equal(client.start({ ...input, messages: Array.from({ length: 7 }, () => ({ role: 'user', content: '中'.repeat(10_000) })) }, binding).code, 'INVALID_REQUEST');
  assert.equal(client.start({ ...input, messages: Array.from({ length: 101 }, () => ({ role: 'user', content: 'ok' })) }, binding).code, 'INVALID_REQUEST');
  client.start(input, binding); await client.whenIdle();
  assert.equal(events.at(-1).code, 'RESPONSE_TOO_LARGE');
  assert.ok(events.filter(e => e.type === 'delta').reduce((sum, e) => sum + Buffer.byteLength(e.text), 0) <= 256 * 1024);
});

test('gateway safe error codes retain a useful message without reflecting supplied error text', async () => {
  for (const reply of [
    new Response(JSON.stringify({ ok: false, code: 'UPSTREAM_AUTH', error: 'secret-token' }), { status: 502, headers: { 'Content-Type': 'application/json' } }),
    response('data: {"type":"error","code":"UPSTREAM_AUTH","error":"secret-token"}\n\n'),
  ]) {
    const { client, events } = fixture(async () => reply);
    client.start(input, binding); await client.whenIdle();
    assert.equal(events.at(-1).code, 'UPSTREAM_AUTH');
    assert.equal(events.at(-1).error.includes('凭证'), true);
    assert.equal(JSON.stringify(events).includes('secret-token'), false);
  }
});

test('preload exposes structured AI events and cleanup removes only its own listener', async () => {
  const { EventEmitter } = await import('node:events');
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const ipc: any = new EventEmitter(); const calls: any[] = []; const seen: any[] = [];
  ipc.invoke = (channel: string, input: any) => { calls.push([channel, input]); return Promise.resolve({ ok: true }); };
  let desktop: any;
  runInNewContext(readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'), { require: () => ({ ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_name: string, api: any) => { desktop = api; } } }), process: { platform: 'darwin' } });
  const cleanup = desktop.ai.onEvent((value: any) => seen.push(value));
  await desktop.ai.start(input);
  ipc.emit('ai:event', { privilegedElectronEvent: true }, { ownerId: input.ownerId, requestId: input.requestId, threadId: input.threadId, type: 'done' });
  cleanup();
  ipc.emit('ai:event', {}, { ...input, type: 'done' });
  assert.equal(seen.length, 1); assert.equal(seen[0].privilegedElectronEvent, undefined);
  assert.equal(calls[0][0], 'ai:start'); assert.equal(ipc.listenerCount('ai:event'), 0);
});


test('active streams are cancelled when the periodic auth check finds session expiry', async () => {
  const h = await mainHarness();
  await h.call('auth:login', { id: binding.ownerId });
  await h.call('ai:start', input);
  await new Promise(resolve => setImmediate(resolve));
  h.expireSession();
  assert.ok(h.intervals.length > 0);
  h.intervals.forEach(callback => callback());
  await new Promise(resolve => setImmediate(resolve));
  h.pending.shift()!(response('data: {"type":"delta","text":"expired"}\n\ndata: {"type":"done"}\n\n'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.sent.filter((e: any) => e.channel === 'ai:event').map((e: any) => [e.event.type, e.event.code]), [['error', 'UNAUTHENTICATED']]);
});
