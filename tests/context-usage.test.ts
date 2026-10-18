import test from 'node:test';
import assert from 'node:assert/strict';
import { contextUsage } from '../src/chat-state.ts';
import type { Message } from '../src/model.ts';
import { parseWorkspace } from '../src/workspace-state.ts';
const message = (content: string, role: 'user' | 'assistant' = 'user', status: Message['status'] = 'complete'): Message => ({ id: content.slice(0, 5), role, content, status, createdAt: 1 });

test('context ring measures retained characters, excluding incomplete replies', () => {
  assert.deepEqual(contextUsage([]), { used: 0, limit: 32000, percent: 0, exceeded: false });
  assert.equal(contextUsage([message('你'.repeat(8000)), message('好'.repeat(8000), 'assistant')]).percent, 50);
  assert.equal(contextUsage([message('问题'), message('生成中', 'assistant', 'pending')]).used, 2);
});
test('context ring follows the same character and message trimming as sent history', () => {
  assert.equal(contextUsage([message('旧'.repeat(30000)), message('新'.repeat(5000))]).used, 5000);
  assert.equal(contextUsage(Array.from({length: 45}, () => message('字'))).used, 40);
  assert.deepEqual(contextUsage([message('长'.repeat(32001))]), { used: null, limit: 32000, percent: 100, exceeded: true });
});
test('account snapshots retain approval selection without changing other permission settings', () => {
  const first = parseWorkspace(null);
  first.preferences.permissionMode = '完全访问';
  const restored = parseWorkspace(JSON.stringify(first));
  assert.equal(restored.preferences.permissionMode, '完全访问');
  assert.equal(restored.preferences.defaultPermission, first.preferences.defaultPermission);
  assert.equal(parseWorkspace(null).preferences.permissionMode, '请求批准');
});
