import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server: Awaited<ReturnType<typeof createServer>>;
let ChatMessage: any;
let copyReplyLink: (address: string, onCopy: (text: string) => Promise<void>) => Promise<string>;

before(async () => {
  server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  ({ ChatMessage } = await server.ssrLoadModule('/src/components/ChatMessage.tsx'));
  ({ copyReplyLink } = await server.ssrLoadModule('/src/components/ReplyContent.tsx'));
});

after(async () => { await server?.close(); });

function render(content: string, role = 'assistant') {
  return renderToStaticMarkup(createElement(ChatMessage, {
    message: { id: 'reply', role, content, status: 'pending', createdAt: 1 },
    content,
    canRetry: false,
    onRetry: () => {},
    onCopy: async () => {},
  }));
}

test('assistant paragraphs collapse surplus blank lines and render lists and inline code', () => {
  const html = render('\n\n第一段。\n\n\n\n第二段含有 `代码`。\n\n- 第一项\n- 第二项');
  assert.match(html, /<p>第一段。<\/p>/);
  assert.match(html, /<p>第二段含有 <code>代码<\/code>。<\/p>/);
  assert.match(html, /<ul>\s*<li>第一项<\/li>\s*<li>第二项<\/li>\s*<\/ul>/);
  assert.doesNotMatch(html, /<p>\s*<\/p>/);
});

test('code blocks retain indentation and internal empty lines while poems retain line breaks', () => {
  const code = '  first()\n\n\n  second()\n';
  const html = render(`\n\n\`\`\`js\n${code}\`\`\`\n\n床前明月光\n疑是地上霜`);
  assert.ok(html.includes(`<pre><code class="language-js">${code}</code></pre>`));
  assert.match(html, /<p>床前明月光\n疑是地上霜<\/p>/);
  assert.match(render('    indented()\n\n    next()'), /<pre><code>indented\(\)\n\nnext\(\)\n<\/code><\/pre>/);
});

test('reply Markdown cannot navigate, execute HTML, or automatically fetch images', () => {
  const html = render('[网页](https://example.com/docs) [危险](javascript:alert%281%29) [数据](data:text/html,test) [文件](file:///tmp/private)\n\n![远程图片](https://example.com/tracking.png)\n\n<script>alert(1)</script><iframe src="https://example.com/embed"></iframe>');
  assert.match(html, /<button[^>]*aria-label="复制链接地址：https:\/\/example.com\/docs"/);
  assert.match(html, /图片：远程图片/);
  assert.doesNotMatch(html, /<(?:a|img|script|iframe)\b/);
  assert.doesNotMatch(html, /<button[^>]*(?:javascript:|data:|file:)/);
});

test('user bubbles keep their original text and Markdown punctuation', () => {
  const content = '\n\n**用户原文**\n\n\n- 保留符号';
  const html = render(content, 'user');
  assert.ok(html.includes(`<div class="message-content">${content}</div>`));
  assert.doesNotMatch(html, /<strong>|<ul>|reply-content/);
});

test('link copy sends the exact address and reports success only after the clipboard resolves', async () => {
  assert.equal(typeof copyReplyLink, 'function');
  let copied = '';
  let complete!: () => void;
  const pending = copyReplyLink('https://example.com/docs?q=1#section', address => {
    copied = address;
    return new Promise<void>(resolve => { complete = resolve; });
  });
  let resolved = false;
  void pending.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(copied, 'https://example.com/docs?q=1#section');
  assert.equal(resolved, false);
  complete();
  assert.equal(await pending, '已复制链接地址');
});

test('link copy catches clipboard rejection and reports failure without leaking the error', async () => {
  assert.equal(typeof copyReplyLink, 'function');
  assert.equal(await copyReplyLink('https://example.com', async () => {
    throw new Error('private clipboard failure details');
  }), '无法复制链接地址，请重试');
});

test('reply exposes a dedicated live region for link copy feedback', () => {
  assert.match(render('[网页](https://example.com/docs)'), /class="reply-link-status" role="status"/);
});
