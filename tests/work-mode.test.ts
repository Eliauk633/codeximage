import test from 'node:test';
import assert from 'node:assert/strict';
import { addThread, appendUserMessage, createInitialState, restoreState, updateThread, type AppState, type WorkMode } from '../src/model.ts';
import { parseWorkspace } from '../src/workspace-state.ts';

function populatedState(): AppState {
  let state = createInitialState();
  state = addThread(state, '保留项目对话', state.projects[0].id);
  state = appendUserMessage(state, state.activeThreadId!, '保留原有正文，不因切换模式而移动。');
  state = updateThread(state, state.activeThreadId!, { pinned: true });
  state = updateThread(state, 'starter-notes', { archived: true });
  return state;
}

test('new accounts and legacy state default to Codex without reclassifying existing threads', () => {
  assert.equal(createInitialState().workMode, 'codex');
  const saved = populatedState();
  const { workMode, ...legacy } = saved;
  const restored = restoreState(JSON.stringify(legacy));
  assert.deepEqual(restored, saved);
  assert.equal(restored.activeThreadId, saved.activeThreadId);
  assert.deepEqual(restored.threads, saved.threads);
  assert.ok(restored.threads.every(thread => !('mode' in thread) && !('workMode' in thread)));
});

test('work mode restoration accepts only the two known string values', () => {
  const state = populatedState();
  for (const workMode of [undefined, null, false, 0, 'ChatGPT', 'CODEX', 'other', '', ['chatgpt'], { value: 'chatgpt' }, { toString: null }]) {
    assert.deepEqual(restoreState(JSON.stringify({ ...state, workMode })), { ...state, workMode: 'codex' });
  }
  for (const workMode of ['codex', 'chatgpt'] as WorkMode[]) {
    assert.deepEqual(restoreState(JSON.stringify({ ...state, workMode })), { ...state, workMode });
  }
});

test('switching presentation mode preserves active thread, messages, pins, archive and project links', () => {
  const original = populatedState();
  const switched: AppState = { ...original, workMode: 'chatgpt' };
  const restored = restoreState(JSON.stringify(switched));
  assert.deepEqual(restored, switched);
  assert.deepEqual(restored.projects, original.projects);
  assert.deepEqual(restored.threads, original.threads);
  assert.equal(restored.activeThreadId, original.activeThreadId);
  assert.equal(restored.threads.find(thread => thread.id === original.activeThreadId)!.projectId, original.projects[0].id);
  assert.equal(original.workMode, 'codex');
  const back = restoreState(JSON.stringify({ ...restored, workMode: 'codex' }));
  assert.deepEqual(back, original);
});

test('creating a recent conversation retains ChatGPT mode and does not inherit the active project', () => {
  const original: AppState = { ...populatedState(), workMode: 'chatgpt' };
  const previousActive = original.threads.find(thread => thread.id === original.activeThreadId)!;
  assert.ok(previousActive.projectId);
  const next = addThread(original, '新对话', null);
  assert.equal(next.workMode, 'chatgpt');
  assert.equal(next.threads.length, original.threads.length + 1);
  assert.notEqual(next.activeThreadId, original.activeThreadId);
  assert.equal(next.threads[0].id, next.activeThreadId);
  assert.equal(next.threads[0].projectId, null);
  assert.deepEqual(next.threads[0].messages, []);
  assert.deepEqual(next.threads.slice(1), original.threads);
  assert.deepEqual(restoreState(JSON.stringify(next)), next);
});

test('workspace mode persists alongside navigation modules and legacy workspaces keep all other fields', () => {
  const saved = parseWorkspace(null);
  saved.state = { ...populatedState(), workMode: 'chatgpt' };
  saved.spaces.items[0].content = '# 保留空间内容';
  saved.plugins = { version: 1, installed: [{ id: 'github', enabled: false, installedAt: 123 }] };
  saved.automations = { tasks: [{ id: 'retain-task', name: '保留任务', instructions: '保留指令', paused: true, createdAt: 1, updatedAt: 2,
    schedule: { frequency: 'daily', time: '09:00', weekdays: [], date: '' } }] };
  saved.railPins = ['images', 'plugins', 'spaces'];
  assert.deepEqual(parseWorkspace(JSON.stringify(saved)), saved);
  const { workMode, ...legacyState } = saved.state;
  const restoredLegacy = parseWorkspace(JSON.stringify({ ...saved, state: legacyState }));
  assert.deepEqual(restoredLegacy, { ...saved, state: { ...saved.state, workMode: 'codex' } });
});

test('legacy ChatGPT preference defaults to Work and old threads stay byte-equivalent in their fields', () => {
  const saved = populatedState();
  const legacyThreads = saved.threads.map(({ kind, ...thread }) => thread);
  const { chatGptMode, ...legacyState } = saved;
  const restored = restoreState(JSON.stringify({ ...legacyState, threads: legacyThreads }));
  assert.equal(restored.chatGptMode, 'work');
  assert.deepEqual(restored.threads, legacyThreads);
  assert.ok(restored.threads.every(thread => !Object.hasOwn(thread, 'kind')));
  assert.equal(restored.activeThreadId, saved.activeThreadId);
  assert.deepEqual(restored.projects, saved.projects);
});

test('ChatGPT submode accepts only chat and work and restores alongside the top-level mode', () => {
  const saved = { ...populatedState(), workMode: 'chatgpt' as const };
  for (const chatGptMode of [undefined, null, 0, false, 'Chat', 'WORK', 'codex', 'other', [], { value: 'chat' }]) {
    assert.deepEqual(restoreState(JSON.stringify({ ...saved, chatGptMode })), { ...saved, chatGptMode: 'work' });
  }
  for (const chatGptMode of ['chat', 'work'] as const) {
    const snapshot = parseWorkspace(null);
    snapshot.state = { ...saved, chatGptMode };
    assert.deepEqual(parseWorkspace(JSON.stringify(snapshot)), snapshot);
  }
});

test('new chat and work conversations have explicit kinds without changing current presentation preferences', () => {
  const original: AppState = { ...populatedState(), workMode: 'chatgpt', chatGptMode: 'work' };
  for (const kind of ['codex', 'chat', 'work'] as const) {
    const next = addThread(original, `  ${kind} 对话  `, original.projects[0].id, kind);
    assert.equal(next.threads[0].kind, kind);
    assert.equal(next.threads[0].title, `${kind} 对话`);
    assert.equal(next.threads[0].projectId, original.projects[0].id);
    assert.equal(next.activeThreadId, next.threads[0].id);
    assert.equal(next.workMode, 'chatgpt');
    assert.equal(next.chatGptMode, 'work');
    assert.deepEqual(next.threads.slice(1), original.threads);
    assert.deepEqual(restoreState(JSON.stringify(next)), next);
  }
  assert.equal(addThread(original).threads[0].kind, 'codex');
  assert.equal(addThread(original, '聊天', null, 'chat').threads[0].projectId, null);
  assert.equal(addThread(original, '工作', 'missing', 'work').threads[0].projectId, null);
});

test('unknown kinds are omitted while valid original kinds survive without inferred ownership', () => {
  const saved = populatedState();
  const base = saved.threads[0];
  const values = [undefined, null, false, 1, '', 'Chat', 'chatgpt', ['work'], { value: 'codex' }, 'codex', 'chat', 'work'];
  const threads = values.map((kind, index) => ({ ...base, id: `kind-${index}`, kind }));
  const restored = restoreState(JSON.stringify({ ...saved, threads, activeThreadId: 'kind-0' }));
  values.forEach((kind, index) => {
    const { kind: restoredKind, ...known } = restored.threads[index];
    const { kind: ignored, ...expected } = threads[index];
    assert.deepEqual(known, expected);
    if (kind === 'codex' || kind === 'chat' || kind === 'work') assert.equal(restoredKind, kind);
    else assert.equal(Object.hasOwn(restored.threads[index], 'kind'), false);
  });
  assert.equal(restored.activeThreadId, 'kind-0');
});
