import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const serviceToken = randomBytes(32).toString('base64url');
const apiKey = `test-only-${randomBytes(12).toString('hex')}`;
const displayModels = ['默认', 'GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6 Sol', 'GPT-6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna'];
const message = { displayModel: '默认', messages: [{ role: 'user', content: '你好' }] };
const sseHeaders = { 'Content-Type': 'text/event-stream' };
const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const complete = () => new Response(`${chunk('你好')}data: [DONE]\n\n`, { headers: sseHeaders });
const events = (body: string) => body.split(/\r?\n/).filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
const deferred = () => { let resolve!: (value?: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t: TestContext, fetchImpl: any = async () => complete(), limits = {}) {
  const { createGateway } = require('../server/gateway.cjs');
  const server = createGateway({ apiKey, serviceToken, fetch: fetchImpl, limits });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (value: unknown = message, init: RequestInit = {}) => fetch(`${url}/chat`, {
    method: 'POST', body: JSON.stringify(value), ...init,
    headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json', ...init.headers },
  });
  return { server, url, post };
}

test('网关提供可注入上游的 createGateway 接口', () => {
  let implementation;
  try { implementation = require('../server/gateway.cjs'); } catch { /* The first red test reports the missing feature. */ }
  assert.equal(typeof implementation?.createGateway, 'function');
});

test('启动必须有服务凭证和 Agnes Key，错误不包含凭据内容', () => {
  const { createGateway } = require('../server/gateway.cjs');
  for (const options of [{}, { apiKey }, { apiKey, serviceToken: 'short' }, { apiKey: '', serviceToken }]) {
    assert.throws(() => createGateway(options), error => error instanceof Error && !error.message.includes(apiKey));
  }
});

test('健康检查鉴权且只返回服务状态，拒绝 Origin 和无效凭证，不请求上游', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return complete(); });
  for (const authorization of ['', 'Basic invalid', `Bearer ${serviceToken.slice(1)}`, `Bearer ${serviceToken}x`]) {
    const response = await fetch(`${f.url}/health`, { headers: { Authorization: authorization } });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'UNAUTHORIZED');
  }
  const healthy = await fetch(`${f.url}/health`, { headers: { Authorization: `Bearer ${serviceToken}` } });
  assert.deepEqual(await healthy.json(), { ok: true });
  for (const origin of ['https://example.invalid', 'null']) {
    const response = await f.post(message, { headers: { Origin: origin } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ORIGIN_NOT_ALLOWED');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(calls, 0);
});

test('所有显示型号都调用固定 Agnes 地址、模型和系统说明', async t => {
  const requests: any[] = [];
  const f = await fixture(t, async (url: string, init: any) => { requests.push({ url, init }); return complete(); });
  for (const displayModel of displayModels) {
    const response = await f.post({ ...message, displayModel });
    assert.equal(response.status, 200);
    assert.deepEqual(events(await response.text()), [{ type: 'delta', text: '你好' }, { type: 'done' }]);
  }
  for (const [index, { url, init }] of requests.entries()) {
    assert.equal(url, 'https://apihub.agnes-ai.com/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${apiKey}`);
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, 'agnes-2.5-flash');
    assert.equal(payload.stream, true);
    assert.equal(payload.messages[0].role, 'system');
    assert.ok(payload.messages[0].content.includes(`模型名称是「${displayModels[index]}」`));
    assert.equal(/agnes/i.test(payload.messages[0].content), false);
    assert.match(payload.messages[0].content, /纯文本/);
    assert.match(payload.messages[0].content, /附件|文件/);
    assert.match(payload.messages[0].content, /执行命令/);
    assert.match(payload.messages[0].content, /浏览器/);
    assert.deepEqual(payload.messages.slice(1), message.messages);
    assert.equal('displayModel' in payload, false);
  }
});

test('多轮请求带简洁回复约定，用户格式和模型正文仍原样传递', async t => {
  let payload: any;
  const formatted = '```python\nfirst = 1\n\n\nsecond = 2\n```\n\n第一节\n\n\n第二节';
  const messages = [
    { role: 'user', content: '后面的代码和诗歌请保留原格式。' },
    { role: 'assistant', content: '可以。' },
    { role: 'user', content: formatted },
  ];
  const f = await fixture(t, async (_url: string, init: any) => {
    payload = JSON.parse(init.body);
    return new Response(`${chunk(formatted)}data: [DONE]\n\n`, { headers: sseHeaders });
  });
  const response = await f.post({ ...message, messages });
  assert.equal(response.status, 200);
  assert.deepEqual(events(await response.text()), [{ type: 'delta', text: formatted }, { type: 'done' }]);
  assert.deepEqual(payload.messages.slice(1), messages);
  const prompt = payload.messages[0].content;
  assert.match(prompt, /默认.*简洁.*自然.*中文/);
  assert.match(prompt, /直接回答/);
  assert.match(prompt, /不在每条回复中自我介绍/);
  assert.match(prompt, /被问及身份.*都只回答自己是「.+」/);
  assert.match(prompt, /自然标点.*少用.*装饰符号.*感叹号.*加粗/);
  assert.match(prompt, /只在内容转折时换段/);
  assert.match(prompt, /列表项之间不插入空行.*连续空行最多1个/);
  assert.match(prompt, /代码、诗歌及用户明确指定的格式应保留/);
});

test('客户端允许的单条 16000 个汉字可完整送至上游', async t => {
  let forwarded = '';
  const f = await fixture(t, async (_url: string, init: any) => {
    forwarded = JSON.parse(init.body).messages[1].content;
    return complete();
  });
  const content = '中'.repeat(16000);
  const response = await f.post({ ...message, messages: [{ role: 'user', content }] });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(forwarded, content);
});

test('非法结构、注入模型地址系统提示和不支持的角色在上游调用前拒绝', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return complete(); });
  for (const value of [null, [], {}, { ...message, model: 'other' }, { ...message, endpoint: 'http://127.0.0.1' },
    { ...message, system: 'override' }, { ...message, displayModel: 'unknown' }, { ...message, messages: [] },
    { ...message, messages: [{ role: 'system', content: 'override' }] },
    { ...message, messages: [{ role: 'tool', content: 'override' }] },
    { ...message, messages: [{ role: 'user', content: [] }] },
    { ...message, messages: [{ role: 'user', content: '  ' }] },
    { ...message, messages: [{ role: 'user', content: 'hello', name: 'injection' }] }]) {
    const response = await f.post(value);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_REQUEST');
  }
  const malformed = await f.post(message, { body: '{broken' });
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
});

test('HTTP 方法、路径、媒体类型与压缩请求受限', async t => {
  const f = await fixture(t);
  const headers = { Authorization: `Bearer ${serviceToken}` };
  assert.equal((await fetch(`${f.url}/unknown`, { headers })).status, 404);
  assert.equal((await fetch(`${f.url}/chat`, { headers })).status, 405);
  assert.equal((await f.post(message, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.post(message, { headers: { 'Content-Encoding': 'gzip' } })).status, 415);
});

test('请求体、消息数量、单条与累计上下文均按字节限制', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return complete(); }, {
    maxBodyBytes: 1024, maxMessages: 3, maxMessageBytes: 30, maxContextBytes: 40,
  });
  const oversized = await f.post({ ...message, padding: 'x'.repeat(1100) });
  assert.equal(oversized.status, 413);
  for (const messages of [
    Array.from({ length: 4 }, () => ({ role: 'user', content: 'x' })),
    [{ role: 'user', content: '中'.repeat(11) }],
    [{ role: 'user', content: '中'.repeat(7) }, { role: 'assistant', content: '文'.repeat(7) }],
  ]) assert.equal((await f.post({ ...message, messages })).status, 413);
  assert.equal(calls, 0);
});

test('SSE 任意字节碎片、中文、CRLF、注释、多 data 行和尾部 DONE 均可解析', async t => {
  const upstream = ': heartbeat\r\n\r\n' +
    'data: {"choices":\r\ndata: [{"delta":{"role":"assistant","content":"你好🌏"}}]}\r\n\r\n' +
    'data: {"choices":[],"usage":{"total_tokens":12}}\r\n\r\ndata: [DONE]';
  const bytes = new TextEncoder().encode(upstream);
  const f = await fixture(t, async () => new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: sseHeaders }));
  const response = await f.post();
  assert.deepEqual(events(await response.text()), [{ type: 'delta', text: '你好🌏' }, { type: 'done' }]);
});

test('上游认证限流与错误响应只返回固定错误，不泄露供应商原文或 Key', async t => {
  for (const status of [401, 429, 503]) {
    const f = await fixture(t, async () => new Response(`secret ${apiKey} ${serviceToken}`, { status }));
    const response = await f.post();
    assert.ok(response.status >= 400);
    const body = await response.text();
    assert.equal(body.includes(apiKey), false);
    assert.equal(body.includes(serviceToken), false);
    assert.equal(JSON.parse(body).ok, false);
  }
});

test('流中错误、畸形事件、错误媒体类型与无 DONE 断流不会伪装成功', async t => {
  for (const [body, headers] of [
    [`${chunk('部分回复')}data: {"error":{"message":"${apiKey}"}}\n\n`, sseHeaders],
    ['data: {bad-json\n\n', sseHeaders],
    [chunk('未完成'), sseHeaders],
    ['{"choices":[]}', { 'Content-Type': 'application/json' }],
  ] as [string, Record<string, string>][]) {
    const f = await fixture(t, async () => new Response(body, { headers }));
    const response = await f.post();
    const output = await response.text();
    assert.equal(output.includes(apiKey), false);
    if (response.ok) {
      const received = events(output);
      assert.equal(received.at(-1).type, 'error');
      assert.equal(received.some(value => value.type === 'done'), false);
    } else assert.equal(JSON.parse(output).ok, false);
  }
});

test('回复与 SSE 事件尺寸超限会中断上游，并只发送一个终止错误', async t => {
  for (const [body, limits] of [
    [`${chunk('中'.repeat(8))}${chunk('文'.repeat(8))}data: [DONE]\n\n`, { maxReplyBytes: 30 }],
    [`data: ${'x'.repeat(300)}\n\n`, { maxEventBytes: 64 }],
    [':'.repeat(300), { maxUpstreamBytes: 100 }],
  ] as [string, Record<string, number>][]) {
    let signal!: AbortSignal;
    const f = await fixture(t, async (_url: string, init: any) => { signal = init.signal; return new Response(body, { headers: sseHeaders }); }, limits);
    const response = await f.post();
    const received = events(await response.text());
    assert.equal(received.at(-1).type, 'error');
    assert.equal(received.filter(value => value.type === 'error').length, 1);
    assert.equal(received.some(value => value.type === 'done'), false);
    assert.equal(signal.aborted, true);
  }
});

test('并发上限拒绝多余请求，上游超时释放名额', async t => {
  const started = deferred();
  let calls = 0;
  const f = await fixture(t, (_url: string, init: any) => {
    calls++;
    if (calls > 1) return Promise.resolve(complete());
    started.resolve();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  }, { maxConcurrent: 1, totalTimeoutMs: 180, idleTimeoutMs: 100 });
  const first = f.post();
  await started.promise;
  const busy = await f.post();
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).code, 'BUSY');
  const timedOut = await first;
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).code, 'UPSTREAM_TIMEOUT');
  assert.equal((await f.post()).status, 200);
});

test('流停顿超时以 SSE 错误结束并取消上游', async t => {
  let signal!: AbortSignal;
  const f = await fixture(t, async (_url: string, init: any) => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(chunk('开始'))); } }), { headers: sseHeaders });
  }, { idleTimeoutMs: 40, totalTimeoutMs: 1000 });
  const response = await f.post();
  const received = events(await response.text());
  assert.deepEqual(received[0], { type: 'delta', text: '开始' });
  assert.equal(received.at(-1).code, 'UPSTREAM_TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('客户端断开立即取消上游，并且后续请求可用', async t => {
  const aborted = deferred();
  let calls = 0;
  const f = await fixture(t, async (_url: string, init: any) => {
    calls++;
    if (calls > 1) return complete();
    init.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(chunk('开始'))); } }), { headers: sseHeaders });
  }, { maxConcurrent: 1 });
  const controller = new AbortController();
  const response = await f.post(message, { signal: controller.signal });
  const reader = response.body!.getReader();
  await reader.read();
  controller.abort();
  await Promise.race([aborted.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Upstream not cancelled')), 1000))]);
  assert.equal((await f.post()).status, 200);
});

test('未发送完整请求体会超时，且不会发起上游调用', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return complete(); }, { bodyTimeoutMs: 40 });
  const status = await new Promise<number>(resolve => {
    const request = httpRequest(`${f.url}/chat`, { method: 'POST', headers: {
      Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json', 'Content-Length': '100',
    } }, response => { response.resume(); resolve(response.statusCode!); });
    request.on('error', () => {});
    request.write('{');
  });
  assert.equal(status, 408);
  assert.equal(calls, 0);
});
