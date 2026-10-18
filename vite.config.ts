import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [react(), {
    name: 'allow-generated-inline-bootstrap',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
          .filter(match => !/\bsrc\s*=/.test(match[1]) && match[2].trim())
          .map(match => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
        return hashes.length ? html.replace("script-src 'self';", `script-src 'self' ${hashes.join(' ')};`) : html;
      },
    },
  }],
  base: './',
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
