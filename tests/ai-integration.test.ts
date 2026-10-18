import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGateway } = require('../server/gateway.cjs');
const { createAIClient } = require('../electron/ai-client.cjs');
const binding = { ownerId: 'integration-local-owner', generation: 1, webContentsId: 9 };
const input = (requestId: string, displayModel = '默认') => ({
  ownerId: binding.ownerId, requestId, threadId: 'integration-thread', displayModel,
  messages: [{ role: 'user', content: '请用中文回复并说明你是什么模型。' }],
});
const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const complete = () => {
  const bytes = new TextEncoder().encode(`${chunk('你好，')}${chunk('跨层流式响应🌏。')}data: [DONE]\n\n`);
  return new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
};

async function fixture(t: TestContext, upstream: (url: string, init: any) => Promise<Response>, onEvent?: (event: any) => void) {
  const apiKey = `test-only-${randomBytes(16).toString('hex')}`;
  const token = randomBytes(32).toString('base64url');
  const upstreamRequests: any[] = [];
  const ingress: any[] = [];
  const events: any[] = [];
  const server = createGateway({ apiKey, serviceToken: token, fetch: async (url: string, init: any) => {
    upstreamRequests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return upstream(url, init);
  } });
  server.prependListener('request', (request: any) => {
    const chunks: Buffer[] = [];
    request.on('data', (value: Buffer) => chunks.push(value));
    request.on('end', () => ingress.push({ url: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = createAIClient({
    baseUrl: `http://127.0.0.1:${server.address().port}`, token,
    isCurrent: (value: any) => value.ownerId === binding.ownerId && value.generation === binding.generation && value.webContentsId === binding.webContentsId,
    onEvent(event: any) { events.push(event); onEvent?.(event); },
  });
  t.after(async () => {
    client.cancelAll(); server.closeAllConnections();
    await client.whenIdle();
    await new Promise<void>(resolve => server.close(resolve));
  });
  return { client, events, ingress, upstreamRequests, apiKey, token };
}

test('Electron → 本机 HTTP 网关 → 注入上游：不同显示型号固定 Agnes 模型并返回完整中文流', { timeout: 5000 }, async t => {
  const f = await fixture(t, async () => complete());
  const labels = ['默认', 'GPT-6 Astra'];
  for (const [index, label] of labels.entries()) {
    const request = input(`request-${index}`, label);
    assert.deepEqual(f.client.start(request, binding), { ok: true });
    await f.client.whenIdle();
    const received = f.events.filter(event => event.requestId === request.requestId);
    assert.equal(received.filter(event => event.type === 'delta').map(event => event.text).join(''), '你好，跨层流式响应🌏。');
    assert.deepEqual(received.map(event => event.type), ['delta', 'delta', 'done']);
    assert.ok(received.every(event => event.ownerId === binding.ownerId && event.threadId === request.threadId));
  }
  assert.equal(f.ingress.length, 2);
  assert.equal(f.upstreamRequests.length, 2);
  for (const [index, label] of labels.entries()) {
    assert.deepEqual(f.ingress[index], { url: '/chat', body: { displayModel: label, messages: input('unused').messages } });
    const upstream = f.upstreamRequests[index];
    assert.equal(upstream.url, 'https://apihub.agnes-ai.com/v1/chat/completions');
    assert.equal(upstream.headers.Authorization, `Bearer ${f.apiKey}`);
    assert.equal(upstream.body.model, 'agnes-2.5-flash');
    assert.equal(upstream.body.stream, true);
    assert.equal(upstream.body.messages[0].role, 'system');
    assert.ok(upstream.body.messages[0].content.includes(`模型名称是「${label}」`));
    assert.equal(/agnes/i.test(upstream.body.messages[0].content), false);
    assert.deepEqual(upstream.body.messages.slice(1), input('unused').messages);
    for (const key of ['ownerId', 'requestId', 'threadId', 'generation', 'webContentsId', 'displayModel']) assert.equal(key in upstream.body, false);
  }
  assert.equal(JSON.stringify(f.events).includes(f.apiKey), false);
  assert.equal(JSON.stringify(f.events).includes(f.token), false);
});

test('上游拒绝经过真实 HTTP 网关返回安全错误，下一次请求可继续成功', { timeout: 5000 }, async t => {
  let calls = 0;
  const f = await fixture(t, async (_url, init) => ++calls === 1
    ? new Response(`private upstream details ${init.headers.Authorization}`, { status: 401 })
    : complete());
  f.client.start(input('rejected'), binding);
  await f.client.whenIdle();
  const rejected = f.events.filter(event => event.requestId === 'rejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].type, 'error');
  assert.equal(typeof rejected[0].code, 'string');
  assert.equal(JSON.stringify(rejected).includes('private upstream details'), false);
  assert.equal(JSON.stringify(rejected).includes(f.apiKey), false);
  assert.equal(JSON.stringify(rejected).includes(f.token), false);
  assert.deepEqual(f.client.start(input('retry', 'GPT-6.1 Sol'), binding), { ok: true });
  await f.client.whenIdle();
  assert.equal(f.events.filter(event => event.requestId === 'retry').at(-1).type, 'done');
  assert.equal(calls, 2);
});

test('Electron 取消跨越 HTTP 连接中断网关上游，保留已收中文且不追加成功事件', { timeout: 5000 }, async t => {
  let calls = 0;
  let firstDelta!: () => void;
  let upstreamAborted!: () => void;
  const deltaReady = new Promise<void>(resolve => { firstDelta = resolve; });
  const abortReady = new Promise<void>(resolve => { upstreamAborted = resolve; });
  const f = await fixture(t, async (_url, init) => {
    if (++calls > 1) return complete();
    init.signal.addEventListener('abort', upstreamAborted, { once: true });
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(chunk('已经收到的中文')));
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  }, event => { if (event.type === 'delta' && event.requestId === 'cancelled') firstDelta(); });
  const request = input('cancelled', 'GPT-5.6 Terra');
  assert.deepEqual(f.client.start(request, binding), { ok: true });
  await deltaReady;
  assert.deepEqual(f.client.cancel(request, binding), { ok: true });
  await Promise.all([abortReady, f.client.whenIdle()]);
  assert.deepEqual(f.events.filter(event => event.requestId === request.requestId).map(event => event.type), ['delta', 'cancelled']);
  assert.equal(f.events[0].text, '已经收到的中文');
  assert.deepEqual(f.client.start(input('after-cancel'), binding), { ok: true });
  await f.client.whenIdle();
  assert.equal(f.events.filter(event => event.requestId === 'after-cancel').at(-1).type, 'done');
  assert.equal(calls, 2);
});
