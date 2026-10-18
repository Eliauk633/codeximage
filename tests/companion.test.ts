import test from 'node:test';
import assert from 'node:assert/strict';
import { openCompanion, validCompanionAvatar, validCompanionName } from '../src/companion.ts';
import { restoreState, appendUserMessage } from '../src/model.ts';
import { parseWorkspace } from '../src/workspace-state.ts';
import { threadsForMode, recentThreads } from '../src/work-mode.ts';
import { restoreSettingsPreferences } from '../src/settings-preferences.ts';

test('companion opens one reusable conversation and remains outside normal lists', () => {
  let state = openCompanion(restoreState(null), '小智');
  const id = state.activeThreadId!;
  state = appendUserMessage(state, id, '你好');
  const reopened = openCompanion({ ...state, activeThreadId: null }, '小智');
  assert.equal(reopened.activeThreadId, id);
  assert.equal(reopened.threads.filter(t => t.kind === 'companion').length, 1);
  for (const mode of ['codex', 'chatgpt'] as const) assert.ok(!threadsForMode(reopened.threads, mode).some(t => t.id === id));
  assert.ok(!recentThreads(reopened.threads, 'all').some(t => t.id === id));
  const restored = restoreState(JSON.stringify(reopened));
  assert.equal(restored.threads.find(t => t.id === id)?.kind, 'companion');
  assert.equal(restored.threads.find(t => t.id === id)?.messages[0].content, '你好');
});
test('companion profile survives account snapshot roundtrip without changing permissions', () => {
  const snapshot = parseWorkspace(null);
  snapshot.preferences.companionName = '小猫'; snapshot.preferences.companionAvatar = '🐱';
  const restored = parseWorkspace(JSON.stringify(snapshot));
  assert.equal(restored.preferences.companionName, '小猫'); assert.equal(restored.preferences.companionAvatar, '🐱');
  assert.equal(parseWorkspace(null).preferences.companionName, '小智');
  assert.equal(restored.preferences.permissionMode, snapshot.preferences.permissionMode);
});
test('invalid avatar URLs, oversized images and blank names are rejected', () => {
  for (const v of ['https://example.com/avatar.png', 'javascript:alert(1)', '<svg/>', 'abc', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,'+'a'.repeat(180000)]) assert.equal(validCompanionAvatar(v), false);
  for (const v of ['', '🐼', 'data:image/png;base64,AAAA']) assert.equal(validCompanionAvatar(v), true);
  for (const v of ['', ' ', 'a'.repeat(41), 'a\nb']) assert.equal(validCompanionName(v), false);
  assert.equal(validCompanionName('小智'), true);
  const restored = restoreSettingsPreferences(JSON.stringify({companionName:' ',companionAvatar:'https://bad.test/image'}));
  assert.equal(restored.companionName,'小智'); assert.equal(restored.companionAvatar,'');
});
