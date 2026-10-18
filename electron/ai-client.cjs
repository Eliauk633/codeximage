const MAX_EVENT_BYTES = 64 * 1024;
const errors = {
  INVALID_CONFIG: 'AI 服务地址配置无效，请检查客户端启动配置。',
  NOT_CONFIGURED: 'AI 服务尚未配置，请配置统一服务地址和访问凭证。',
  UNAUTHENTICATED: '登录已失效，请重新登录。',
  INVALID_REQUEST: '对话内容无效或过长，请缩短内容后重试。',
  BUSY: '此聊天正在生成回复，请先停止或等待完成。',
  TOO_MANY_REQUESTS: '同时生成的聊天过多，请等待后重试。',
  SERVICE_AUTH_ERROR: 'AI 服务访问凭证无效，请联系服务管理员。',
  RATE_LIMITED: 'AI 服务请求频率过高，请稍后重试。',
  SERVICE_ERROR: 'AI 服务暂时不可用，请稍后重试。',
  INVALID_RESPONSE: 'AI 服务返回内容不完整或格式无效，请重试。',
  NETWORK_ERROR: '无法连接 AI 服务，请检查服务地址和网络。',
  TIMEOUT: 'AI 服务响应超时，请重试。',
  UNAUTHORIZED: 'AI 服务访问凭证无效，请联系服务管理员。',
  REQUEST_TOO_LARGE: '对话上下文超过限制，请缩短内容。',
  REQUEST_TIMEOUT: 'AI 服务读取请求超时，请重试。',
  UPSTREAM_AUTH: '模型服务凭证不可用，请联系服务管理员。',
  UPSTREAM_RATE_LIMIT: '模型服务额度或请求频率受限，请稍后重试。',
  UPSTREAM_ERROR: '模型服务暂时不可用，请稍后重试。',
  UPSTREAM_PROTOCOL: '模型服务返回了无法读取的响应。',
  UPSTREAM_INCOMPLETE: '模型回复中断，请重试。',
  UPSTREAM_TIMEOUT: '模型服务响应超时，请重试。',
  RESPONSE_TOO_LARGE: '模型回复超过限制，请缩小问题范围。',
};
const failure = code => ({ ok: false, code, error: errors[code] || errors.SERVICE_ERROR });

function normalizeAIEndpoint(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /\s/.test(value)) throw new Error('Invalid service URL');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || value.includes('?') || value.includes('#')) throw new Error('Invalid service URL');
  // Require explicit loopback spelling; URL parsing also accepts ambiguous numeric IPv4 aliases.
  const authority = value.match(/^https?:\/\/([^/]+)/i)?.[1];
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(authority || '');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Invalid service URL');
  return url.href.replace(/\/+$/, '');
}

function createSSEParser(onEvent) {
  let line = '', data = [], size = 0, afterCR = false;
  function flushLine() {
    if (line === '') {
      if (data.length) {
        let event;
        try { event = JSON.parse(data.join('\n')); } catch { throw new Error('Invalid SSE JSON'); }
        if (!event || typeof event !== 'object' || !['delta', 'done', 'error'].includes(event.type)
          || (event.type === 'delta' && typeof event.text !== 'string')
          || (event.type === 'error' && typeof event.error !== 'string')) throw new Error('Invalid SSE event');
        const safe = event.type === 'delta' ? { type: 'delta', text: event.text }
          : event.type === 'done' ? { type: 'done' }
            : { type: 'error', error: event.error, ...(typeof event.code === 'string' ? { code: event.code } : {}) };
        onEvent(safe);
      }
      data = []; size = 0;
    } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    line = '';
  }
  return {
    push(chunk) {
      for (const character of chunk) {
        if (afterCR && character === '\n') { afterCR = false; continue; }
        afterCR = false;
        size += Buffer.byteLength(character);
        if (size > MAX_EVENT_BYTES) throw new Error('SSE event too large');
        if (character === '\r' || character === '\n') {
          flushLine(); afterCR = character === '\r';
        } else line += character;
      }
    },
    finish() { if (line || data.length) throw new Error('Incomplete SSE event'); },
  };
}

function validInput(input) {
  const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);
  if (!input || !identifier(input.ownerId) || !identifier(input.requestId) || !identifier(input.threadId)
    || typeof input.displayModel !== 'string' || !input.displayModel.trim() || input.displayModel.length > 100
    || !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 100) return false;
  let bytes = 0;
  for (const message of input.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string'
      || !message.content.trim() || Buffer.byteLength(message.content) > 64 * 1024) return false;
    bytes += Buffer.byteLength(message.content);
  }
  return bytes <= 192 * 1024 && input.messages.at(-1).role === 'user'
    && Buffer.byteLength(JSON.stringify({ displayModel: input.displayModel, messages: input.messages.map(({ role, content }) => ({ role, content })) })) <= 256 * 1024;
}
const sameBinding = (a, b) => a.ownerId === b.ownerId && a.generation === b.generation && a.webContentsId === b.webContentsId;

async function gatewayErrorCode(response, request) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) return;
  request.reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (!request.terminal) {
      const { done, value } = await request.reader.read();
      if (done) {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed?.code === 'string' && Object.hasOwn(errors, parsed.code) ? parsed.code : undefined;
      }
      size += value.byteLength;
      if (size > 16 * 1024) return;
      chunks.push(Buffer.from(value));
    }
  } catch { /* Only a known code is accepted; raw response messages never cross IPC. */ }
  finally { void request.reader.cancel().catch(() => {}); }
}

function createAIClient({ baseUrl = 'http://127.0.0.1:8787', token, fetchImpl = globalThis.fetch, isCurrent = () => true, onEvent = () => {}, timeoutMs = 180_000 } = {}) {
  let url;
  try { url = normalizeAIEndpoint(baseUrl); } catch { /* Invalid values never leave the main process. */ }
  const credential = typeof token === 'string' && token.trim() && !/[\r\n]/.test(token) ? token.trim() : '';
  const requests = new Map();
  const jobs = new Set();
  function status() { return url ? { ok: true, configured: Boolean(credential), url } : failure('INVALID_CONFIG'); }
  function emit(request, event) {
    if (request.terminal) return;
    if (!isCurrent(request.binding)) { stop(request, false); return; }
    if (event.type !== 'delta') request.terminal = true;
    onEvent({ ownerId: request.binding.ownerId, requestId: request.requestId, threadId: request.threadId, ...event }, request.binding);
  }
  function report(request, code) { const result = failure(code); emit(request, { type: 'error', error: result.error, code: result.code }); }
  function stop(request, notify) {
    if (!request.terminal && notify) emit(request, { type: 'cancelled' });
    request.terminal = true;
    request.controller.abort();
    void request.reader?.cancel().catch(() => {});
  }
  async function run(request, body) {
    const timer = setTimeout(() => { report(request, 'TIMEOUT'); stop(request, false); }, timeoutMs);
    timer.unref?.();
    try {
      if (request.terminal || !isCurrent(request.binding)) return;
      const response = await fetchImpl(`${url}/chat`, {
        method: 'POST', redirect: 'error', signal: request.controller.signal,
        headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
      });
      if (request.terminal || !isCurrent(request.binding)) { void response.body?.cancel().catch(() => {}); return; }
      if (!response.ok || response.redirected) {
        const code = response.status === 401 || response.status === 403 ? 'SERVICE_AUTH_ERROR'
          : response.status === 429 ? 'RATE_LIMITED' : response.status === 400 || response.status === 413 ? 'INVALID_REQUEST' : 'SERVICE_ERROR';
        report(request, await gatewayErrorCode(response, request) || code);
        if (!request.reader) void response.body?.cancel().catch(() => {});
        return;
      }
      if (!/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body) { report(request, 'INVALID_RESPONSE'); void response.body?.cancel().catch(() => {}); return; }
      request.reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let replyBytes = 0;
      const parser = createSSEParser(event => {
        if (event.type === 'delta') {
          replyBytes += Buffer.byteLength(event.text);
          if (replyBytes > 256 * 1024) { report(request, 'RESPONSE_TOO_LARGE'); return; }
        }
        if (event.type === 'error') report(request, Object.hasOwn(errors, event.code) ? event.code : 'SERVICE_ERROR');
        else emit(request, event);
      });
      try {
        while (!request.terminal) {
          const { done, value } = await request.reader.read();
          if (request.terminal || !isCurrent(request.binding)) break;
          if (done) { parser.push(decoder.decode()); parser.finish(); break; }
          parser.push(decoder.decode(value, { stream: true }));
        }
        if (!request.terminal) report(request, 'INVALID_RESPONSE');
      } catch {
        if (!request.terminal) report(request, 'INVALID_RESPONSE');
      }
    } catch {
      if (!request.terminal) report(request, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      request.terminal = true;
      void request.reader?.cancel().catch(() => {});
      requests.delete(request.requestId);
    }
  }
  return {
    status,
    start(input, binding) {
      if (!binding || !isCurrent(binding) || input?.ownerId !== binding.ownerId) return failure('UNAUTHENTICATED');
      if (!validInput(input)) return failure('INVALID_REQUEST');
      if (!url) return failure('INVALID_CONFIG');
      if (!credential) return failure('NOT_CONFIGURED');
      if (requests.has(input.requestId) || [...requests.values()].some(r => sameBinding(r.binding, binding) && r.threadId === input.threadId)) return failure('BUSY');
      if (requests.size >= 8) return failure('TOO_MANY_REQUESTS');
      const request = { requestId: input.requestId, threadId: input.threadId, binding: { ...binding }, controller: new AbortController(), terminal: false };
      requests.set(request.requestId, request);
      // Copy only gateway fields; renderer-owned account/session identifiers never leave Electron.
      const body = { displayModel: input.displayModel, messages: input.messages.map(({ role, content }) => ({ role, content })) };
      const job = Promise.resolve().then(() => run(request, body));
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
      return { ok: true };
    },
    cancel(input, binding) {
      if (!binding || !isCurrent(binding) || input?.ownerId !== binding.ownerId) return failure('UNAUTHENTICATED');
      const request = requests.get(input?.requestId);
      if (!request) return { ok: true };
      if (!sameBinding(request.binding, binding)) return failure('UNAUTHENTICATED');
      stop(request, true);
      return { ok: true };
    },
    cancelAll(code) {
      for (const request of requests.values()) {
        if (code) report(request, Object.hasOwn(errors, code) ? code : 'SERVICE_ERROR');
        stop(request, false);
      }
    },
    hasActiveRequests() { return [...requests.values()].some(request => !request.terminal); },
    async whenIdle() { await Promise.all([...jobs]); },
  };
}

module.exports = { normalizeAIEndpoint, createSSEParser, createAIClient };
