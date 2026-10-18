import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, addThread, appendUserMessage, restoreState, deleteThread } from '../src/model.ts';
import { beginChatReply, finishChatReply, chatContext } from '../src/chat-state.ts';

const conversation = () => {
  const state = addThread(createInitialState(), 'Conversation');
  return appendUserMessage(state, state.activeThreadId!, '你好');
};

test('reply completion stays with the originating thread after navigation', () => {
  const initial = conversation();
  const id = initial.activeThreadId!;
  const pending = beginChatReply(initial, id, 'request-1', 'GPT-6 Astra');
  const navigated = addThread(pending, 'Second');
  const done = finishChatReply(navigated, id, 'request-1', '你好，有什么可以帮你？', 'complete');
  assert.equal(done.activeThreadId, navigated.activeThreadId);
  assert.equal(done.threads.find(t => t.id === id)!.messages.at(-1)!.content, '你好，有什么可以帮你？');
  assert.equal(done.threads.find(t => t.id === done.activeThreadId)!.messages.length, 0);
  assert.equal(done.threads.find(t => t.id === id)!.messages.at(-1)!.displayModel, 'GPT-6 Astra');
});

test('retry replaces only the final failed reply without duplicating user messages', () => {
  const initial = conversation(); const id = initial.activeThreadId!;
  const failed = finishChatReply(beginChatReply(initial, id, 'r1', '默认'), id, 'r1', '部分回复', 'error', '服务不可用');
  const retry = beginChatReply(failed, id, 'r2', 'GPT-6 Sol', 'r1');
  const messages = retry.threads.find(t => t.id === id)!.messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, '你好');
  assert.equal(messages[1].id, 'r2');
  assert.deepEqual(chatContext(messages), [{ role: 'user', content: '你好' }]);
  assert.throws(() => beginChatReply(retry, id, 'r3', '默认', 'r1'));
});

test('late completion cannot resurrect a deleted chat or overwrite a stopped reply', () => {
  const initial = conversation(); const id = initial.activeThreadId!;
  const pending = beginChatReply(initial, id, 'r1', '默认');
  const removed = deleteThread(pending, id);
  assert.equal(finishChatReply(removed, id, 'r1', 'late', 'complete'), removed);
  const stopped = finishChatReply(pending, id, 'r1', 'partial', 'stopped');
  assert.equal(finishChatReply(stopped, id, 'r1', 'late', 'complete'), stopped);
});

test('restoring interrupted requests preserves partial text and allows explicit retry', () => {
  const initial = conversation(); const id = initial.activeThreadId!;
  const pending = beginChatReply(initial, id, 'r1', 'GPT-6 Astra');
  const restored = restoreState(JSON.stringify(pending));
  assert.equal(restored.threads.find(t => t.id === id)!.messages.at(-1)!.status, 'stopped');
  assert.equal('actualModel' in restored.threads.find(t => t.id === id)!.messages.at(-1)!, false);
  assert.equal(beginChatReply(restored, id, 'r2', '默认', 'r1').threads.find(t => t.id === id)!.messages.length, 2);
});

test('history excludes failed partial replies and truncates by complete turns', () => {
  const messages = [
    { id: 'u1', role: 'user' as const, content: 'old question', createdAt: 1 },
    { id: 'a1', role: 'assistant' as const, content: 'old answer', createdAt: 2 },
    { id: 'u2', role: 'user' as const, content: 'new question', createdAt: 3 },
    { id: 'a2', role: 'assistant' as const, content: 'failure', createdAt: 4, status: 'error' as const },
  ];
  assert.deepEqual(chatContext(messages, 18), [{ role: 'user', content: 'new question' }]);
  assert.throws(() => chatContext(messages, 5), /过长/);
});

test('completed reply duration survives restore and late events cannot change it', () => {
  const initial = conversation(); const id = initial.activeThreadId!;
  const pending = beginChatReply(initial, id, 'timed', '默认');
  pending.threads.find(t => t.id === id)!.messages.at(-1)!.createdAt = Date.now() - 56000;
  const done = finishChatReply(pending, id, 'timed', '回答', 'complete');
  const duration = done.threads.find(t => t.id === id)!.messages.at(-1)!.durationMs!;
  assert.ok(duration >= 56000 && duration < 57000);
  assert.equal(restoreState(JSON.stringify(done)).threads.find(t => t.id === id)!.messages.at(-1)!.durationMs, duration);
  assert.equal(finishChatReply(done, id, 'timed', 'late', 'complete'), done);
});
