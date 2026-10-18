import test from 'node:test';
import assert from 'node:assert/strict';
import { appendUserMessage, createInitialState, type AppState, type Thread } from '../src/model.ts';
import { recentThreads, switchChatGptSubmode, threadKindForMode, threadsForMode } from '../src/work-mode.ts';

const item = (id: string, patch: Partial<Thread> = {}): Thread => ({
  id, title: id, projectId: null, pinned: false, archived: false, updatedAt: 1, messages: [], ...patch,
});
const ids = (threads: Thread[]) => threads.map(thread => thread.id);

function fixture(): Thread[] {
  return [
    item('legacy', { updatedAt: 10 }),
    item('chat', { kind: 'chat', updatedAt: 50 }),
    item('codex', { kind: 'codex', updatedAt: 40 }),
    item('work', { kind: 'work', updatedAt: 30 }),
    item('legacy-project', { projectId: 'project-a', updatedAt: 70 }),
    item('chat-project', { kind: 'chat', projectId: 'project-a', updatedAt: 80 }),
    item('work-project', { kind: 'work', projectId: 'project-a', updatedAt: 90 }),
    item('pinned-legacy', { pinned: true, updatedAt: 100 }),
    item('pinned-chat', { kind: 'chat', pinned: true, updatedAt: 110 }),
    item('pinned-work', { kind: 'work', pinned: true, updatedAt: 120 }),
    item('archived-legacy', { archived: true, updatedAt: 130 }),
    item('archived-chat', { kind: 'chat', archived: true, updatedAt: 140 }),
    item('archived-work', { kind: 'work', archived: true, updatedAt: 150 }),
  ];
}

test('new conversation kind follows the active workspace and ChatGPT submode', () => {
  assert.equal(threadKindForMode({ workMode: 'codex', chatGptMode: 'chat' }), 'codex');
  assert.equal(threadKindForMode({ workMode: 'codex', chatGptMode: 'work' }), 'codex');
  assert.equal(threadKindForMode({ workMode: 'chatgpt', chatGptMode: 'chat' }), 'chat');
  assert.equal(threadKindForMode({ workMode: 'chatgpt', chatGptMode: 'work' }), 'work');
});

test('Codex shows legacy and explicit Codex conversations without moving or changing any content', () => {
  const threads = fixture();
  const before = structuredClone(threads);
  const visible = threadsForMode(threads, 'codex');
  assert.deepEqual(ids(visible), ['legacy', 'codex', 'legacy-project', 'pinned-legacy']);
  assert.deepEqual(threads, before);
  assert.notStrictEqual(visible, threads);
  assert.equal(Object.hasOwn(threads[0], 'kind'), false);
  assert.strictEqual(visible[0], threads[0]);
});

test('ChatGPT includes conversations from all origins while excluding every archived item', () => {
  const threads = fixture();
  assert.deepEqual(ids(threadsForMode(threads, 'chatgpt')), [
    'legacy', 'chat', 'codex', 'work', 'legacy-project', 'chat-project', 'work-project', 'pinned-legacy', 'pinned-chat', 'pinned-work',
  ]);
  assert.deepEqual(threadsForMode([], 'chatgpt'), []);
});

test('recent defaults exclude project and pinned conversations and sort newest first', () => {
  const threads = threadsForMode(fixture(), 'chatgpt');
  const before = [...threads];
  assert.deepEqual(ids(recentThreads(threads, 'all')), ['chat', 'codex', 'work', 'legacy']);
  assert.deepEqual(ids(recentThreads(threads, 'all', false)), ['chat', 'codex', 'work', 'legacy']);
  assert.deepEqual(threads, before);
  assert.deepEqual(ids(recentThreads(threadsForMode(fixture(), 'codex'), 'all', false)), ['codex', 'legacy']);
});

test('recent Chat and Work filters distinguish new chat items and include legacy Codex as work', () => {
  const threads = threadsForMode(fixture(), 'chatgpt');
  assert.deepEqual(ids(recentThreads(threads, 'chat', false)), ['chat']);
  assert.deepEqual(ids(recentThreads(threads, 'work', false)), ['codex', 'work', 'legacy']);
  assert.deepEqual(ids(recentThreads(threads, 'chat', true)), ['chat-project', 'chat']);
  assert.deepEqual(ids(recentThreads(threads, 'work', true)), ['work-project', 'legacy-project', 'codex', 'work', 'legacy']);
});

test('including projects never includes pinned or archived items and preserves tie order', () => {
  const threads = fixture();
  assert.deepEqual(ids(recentThreads(threads, 'all', true)), ['work-project', 'chat-project', 'legacy-project', 'chat', 'codex', 'work', 'legacy']);
  const ties = [item('first', { updatedAt: 2 }), item('second', { updatedAt: 2 }), item('last', { updatedAt: 1 })];
  const before = structuredClone(ties);
  assert.deepEqual(ids(recentThreads(ties, 'all', true)), ['first', 'second', 'last']);
  assert.deepEqual(ties, before);
  assert.deepEqual(recentThreads([], 'work', true), []);
});


test('switching ChatGPT submode preserves legacy and Codex empty conversations in the Codex list', () => {
  for (const thread of [item('legacy'), item('codex', { kind: 'codex', pinned: true, projectId: 'desktop-studio' })]) {
    const state: AppState = { ...createInitialState(), workMode: 'chatgpt', chatGptMode: 'work', threads: [thread], activeThreadId: thread.id };
    const before = structuredClone(state);
    const next = switchChatGptSubmode(state, 'chat');
    assert.equal(next.chatGptMode, 'chat');
    assert.strictEqual(next.threads, state.threads);
    assert.deepEqual(next.threads, before.threads);
    assert.deepEqual(ids(threadsForMode(next.threads, 'codex')), [thread.id]);
    assert.deepEqual(state, before);
    assert.strictEqual(switchChatGptSubmode(next, 'chat'), next);
  }
});

test('submode changes only the active explicit ChatGPT empty conversation', () => {
  const state: AppState = { ...createInitialState(), workMode: 'chatgpt', chatGptMode: 'work', activeThreadId: 'active-work', threads: [
    item('active-work', { kind: 'work', projectId: 'desktop-studio', pinned: true, updatedAt: 123 }),
    item('other-work', { kind: 'work' }), item('other-chat', { kind: 'chat' }), item('legacy'),
  ] };
  const next = switchChatGptSubmode(state, 'chat');
  assert.equal(next.chatGptMode, 'chat');
  assert.deepEqual(next.threads[0], { ...state.threads[0], kind: 'chat' });
  assert.deepEqual(next.threads.slice(1), state.threads.slice(1));
  assert.strictEqual(next.projects, state.projects);
  assert.equal(next.activeThreadId, state.activeThreadId);
  assert.equal(state.threads[0].kind, 'work');
});

test('back and forward submode restoration keeps empty conversation classification in sync before first send', () => {
  const state: AppState = { ...createInitialState(), workMode: 'chatgpt', chatGptMode: 'work', activeThreadId: 'task', threads: [item('task', { kind: 'work' })] };
  const chat = switchChatGptSubmode(state, 'chat');
  assert.deepEqual(ids(recentThreads(chat.threads, 'chat')), ['task']);
  const back = switchChatGptSubmode(chat, 'work');
  assert.equal(back.chatGptMode, 'work');
  assert.equal(back.threads[0].kind, 'work');
  assert.deepEqual(ids(recentThreads(back.threads, 'work')), ['task']);
  const forward = switchChatGptSubmode(back, 'chat');
  assert.equal(forward.threads[0].kind, 'chat');
  const backAgain = switchChatGptSubmode(forward, 'work');
  const sent = appendUserMessage(backAgain, 'task', '工作内容');
  assert.deepEqual(ids(recentThreads(sent.threads, 'work')), ['task']);
  assert.deepEqual(recentThreads(sent.threads, 'chat'), []);
  // Also repair an empty conversation when the caller restored the preference before applying the helper.
  assert.equal(switchChatGptSubmode({ ...chat, chatGptMode: 'work' }, 'work').threads[0].kind, 'work');
});

test('submode changes never rewrite nonempty conversation sources and repeated choices are no-ops', () => {
  for (const kind of [undefined, 'codex', 'chat', 'work'] as const) {
    const thread = item('existing', { ...(kind ? { kind } : {}), messages: [{ id: 'message', role: 'user', content: '已有内容', createdAt: 1 }] });
    const state: AppState = { ...createInitialState(), workMode: 'chatgpt', chatGptMode: 'work', threads: [thread], activeThreadId: thread.id };
    const next = switchChatGptSubmode(state, 'chat');
    assert.strictEqual(next.threads, state.threads);
    assert.strictEqual(next.threads[0], thread);
    assert.equal(next.chatGptMode, 'chat');
    assert.strictEqual(switchChatGptSubmode(next, 'chat'), next);
  }
  const state = createInitialState();
  assert.strictEqual(switchChatGptSubmode(state, 'work'), state);
  assert.strictEqual(switchChatGptSubmode(state, 'chat').threads, state.threads);
});
