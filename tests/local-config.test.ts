import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readLocalConfig } = require('../scripts/local-config.cjs');

test('client config reads only allowed keys and never returns the provider secret', t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, '.env');
  writeFileSync(file, 'AGNES_API_KEY="test-only-provider"\nCODEX_STUDIO_AI_URL="http://127.0.0.1:8787"\nCODEX_STUDIO_AI_TOKEN=test-only-client\n');
  const config = readLocalConfig(['CODEX_STUDIO_AI_URL', 'CODEX_STUDIO_AI_TOKEN'], { file, env: {} });
  assert.deepEqual(config, { CODEX_STUDIO_AI_URL: 'http://127.0.0.1:8787', CODEX_STUDIO_AI_TOKEN: 'test-only-client' });
  assert.equal('AGNES_API_KEY' in config, false);
  assert.equal(readLocalConfig(['AGNES_API_KEY'], { file, env: {} }).AGNES_API_KEY, 'test-only-provider');
});

test('explicit process configuration wins over the file and missing files are allowed', t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, '.env');
  const env = { AGNES_API_KEY: 'test-only-environment' };
  assert.deepEqual(readLocalConfig(['AGNES_API_KEY'], { file, env }), env);
  writeFileSync(file, 'AGNES_API_KEY=test-only-file\n');
  assert.deepEqual(readLocalConfig(['AGNES_API_KEY'], { file, env }), env);
  assert.deepEqual(env, { AGNES_API_KEY: 'test-only-environment' });
});

test('unreadable config errors do not expose file contents or paths', t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => readLocalConfig(['AGNES_API_KEY'], { file: dir, env: {} }), { message: '无法读取本地模型配置文件。' });
});
