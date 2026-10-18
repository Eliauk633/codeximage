import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addThread,
  appendUserMessage,
  clampSidebarWidth,
  createInitialState,
  deleteThread,
  restoreState,
  updateThread,
  type AppState,
} from '../src/model.ts';

function emptyState(): AppState {
  return { ...createInitialState(), threads: [], activeThreadId: null };
}

test('fresh states do not share mutable collections or log in automatically', () => {
  const first = createInitialState();
  const second = createInitialState();
  first.projects[0]!.name = 'changed';
  first.threads[0]!.messages.push({ id: 'm', role: 'user', content: 'one', createdAt: 1 });
  assert.notEqual(second.projects[0]!.name, 'changed');
  assert.equal(second.threads[0]!.messages.length, 0);
  assert.equal('session' in second, false);
  assert.equal(second.activeThreadId, null);
});

test('missing, broken and incompatible saved state falls back safely', () => {
  for (const raw of [null, '{broken', 'null', '[]', '42', '{"schema":2}', '{"schema":1}']) {
    const restored = restoreState(raw);
    assert.equal(restored.schema, 1);
    assert.ok(restored.projects.length > 0);
    assert.ok(Array.isArray(restored.threads));
    assert.equal('session' in restored, false);
  }
});

test('valid local state survives a save and restore', () => {
  const state = addThread(emptyState(), 'My draft');
  const populated = appendUserMessage(state, state.activeThreadId!, 'Saved locally');
  populated.theme = 'dark';
  populated.panel = 'terminal';
  assert.deepEqual(restoreState(JSON.stringify(populated)), populated);
});

test('restore removes malformed records, duplicate IDs and unknown fields', () => {
  const state = createInitialState();
  const restored = restoreState(JSON.stringify({
    ...state,
    projects: [null, { id: 'p', name: 'Example', path: '/demo' }, { id: 'p', name: 'Duplicate', path: '' }],
    threads: [
      null,
      { id: 'bad', title: 99 },
      { id: 't', title: 'Draft', projectId: 'missing', pinned: 'yes', archived: false, updatedAt: 12, secret: 'discard',
        messages: [null, { id: 'm', role: 'user', content: 'hello', createdAt: 2 },
          { id: 'm', role: 'user', content: 'duplicate', createdAt: 3 },
          { id: 'bad', role: 'system', content: 'discard', createdAt: 4 }] },
      { id: 't', title: 'Duplicate', projectId: null, pinned: false, archived: false, updatedAt: 12, messages: [] },
    ],
    activeThreadId: 'missing',
    session: { username: 'demo', password: 'must not persist' },
    password: 'must not persist',
  }));
  assert.deepEqual(restored.projects, [{ id: 'p', name: 'Example', path: '/demo' }]);
  assert.equal(restored.threads.length, 1);
  assert.equal(restored.threads[0]!.projectId, null);
  assert.equal(restored.threads[0]!.pinned, false);
  assert.deepEqual(restored.threads[0]!.messages, [{ id: 'm', role: 'user', content: 'hello', createdAt: 2 }]);
  assert.equal(restored.activeThreadId, 't');
  assert.equal('session' in restored, false);
  assert.equal(JSON.stringify(restored).includes('must not persist'), false);
  assert.equal(JSON.stringify(restored).includes('secret'), false);
});

test('restore normalizes invalid settings and an archived active thread', () => {
  const state = addThread(addThread(emptyState(), 'Available'), 'Archived');
  state.threads.find(thread => thread.id === state.activeThreadId)!.archived = true;
  const restored = restoreState(JSON.stringify({
    ...state, theme: 'invalid', panel: 'invalid', sidebarWidth: -10, panelWidth: 9000,
    fontSize: null, sidebarVisible: 'no', session: { username: 'not-demo' },
  }));
  assert.equal(restored.theme, 'system');
  assert.equal(restored.panel, 'none');
  assert.equal(restored.sidebarWidth, 240);
  assert.equal(restored.panelWidth, 720);
  assert.equal(restored.fontSize, createInitialState().fontSize);
  assert.equal(restored.sidebarVisible, true);
  assert.equal('session' in restored, false);
  assert.equal(restored.threads.find(thread => thread.id === restored.activeThreadId)!.title, 'Available');
});

test('malformed saved active IDs cannot execute object coercion or break recovery', () => {
  const state = addThread(emptyState(), 'Available');
  const restored = restoreState(JSON.stringify({ ...state, activeThreadId: { toString: null } }));
  assert.equal(restored.activeThreadId, state.activeThreadId);
});

test('sidebar width respects drag bounds and preserves room for the main view', () => {
  for (const [value, windowWidth, expected] of [
    [100, 1400, 240], [900, 1400, 520], [520, 800, 320], [520, 600, 240],
    [300, 1200, 300], [Number.NaN, 1200, 288], [280, Number.NaN, 280],
  ]) {
    assert.equal(clampSidebarWidth(value!, windowWidth!), expected);
  }
});

test('adding a thread selects it, validates its project and leaves the old state intact', () => {
  const state = emptyState();
  const before = structuredClone(state);
  const next = addThread(state, '  First draft  ', state.projects[0]!.id);
  const thread = next.threads.find(item => item.id === next.activeThreadId)!;
  assert.equal(thread.title, 'First draft');
  assert.equal(thread.projectId, state.projects[0]!.id);
  assert.deepEqual(thread.messages, []);
  assert.equal(thread.archived, false);
  assert.equal(thread.pinned, false);
  assert.deepEqual(state, before);
  const again = addThread(next, ' ', 'missing');
  const second = again.threads.find(item => item.id === again.activeThreadId)!;
  assert.ok(second.title.trim());
  assert.equal(second.projectId, null);
  assert.notEqual(second.id, thread.id);
});

test('rename and pin preserve messages and do not mutate the prior state', () => {
  const state = addThread(emptyState(), 'Original');
  const next = updateThread(state, state.activeThreadId!, { title: ' Updated ', pinned: true });
  assert.equal(next.threads[0]!.title, 'Updated');
  assert.equal(next.threads[0]!.pinned, true);
  assert.equal(state.threads[0]!.title, 'Original');
  assert.equal(state.threads[0]!.pinned, false);
  assert.deepEqual(updateThread(next, next.activeThreadId!, { title: ' ' }).threads[0]!.title, 'Updated');
  assert.strictEqual(updateThread(next, 'missing', { pinned: true }), next);
});

test('archiving the active thread chooses an unarchived thread or the welcome view', () => {
  const first = addThread(emptyState(), 'First');
  const firstId = first.activeThreadId!;
  const second = addThread(first, 'Second');
  const next = updateThread(second, second.activeThreadId!, { archived: true });
  assert.equal(next.activeThreadId, firstId);
  assert.equal(second.threads.find(thread => thread.id === second.activeThreadId)!.archived, false);
  const allArchived = updateThread(next, firstId, { archived: true });
  assert.equal(allArchived.activeThreadId, null);
});

test('deleting the active thread selects a valid thread, skipping archived items', () => {
  let state = addThread(emptyState(), 'Archived');
  state = updateThread(state, state.activeThreadId!, { archived: true });
  state = addThread(state, 'Available');
  const availableId = state.activeThreadId!;
  state = addThread(state, 'Delete me');
  const deleteId = state.activeThreadId!;
  const next = deleteThread(state, deleteId);
  assert.equal(next.activeThreadId, availableId);
  assert.equal(next.threads.some(thread => thread.id === deleteId), false);
  assert.equal(state.threads.some(thread => thread.id === deleteId), true);
  assert.equal(deleteThread(next, availableId).activeThreadId, null);
  assert.strictEqual(deleteThread(next, 'missing'), next);
});

test('messages stay in their own threads, remain local and do not mutate previous state', () => {
  const first = addThread(emptyState(), 'First');
  const firstId = first.activeThreadId!;
  const second = addThread(first, 'Second');
  const secondId = second.activeThreadId!;
  const next = appendUserMessage(second, firstId, '  First message  ');
  const last = appendUserMessage(next, secondId, 'Second message');
  assert.deepEqual(last.threads.find(thread => thread.id === firstId)!.messages.map(message => message.content), ['First message']);
  assert.deepEqual(last.threads.find(thread => thread.id === secondId)!.messages.map(message => message.content), ['Second message']);
  assert.ok(last.threads.flatMap(thread => thread.messages).every(message => message.role === 'user'));
  assert.equal(second.threads.find(thread => thread.id === firstId)!.messages.length, 0);
  assert.strictEqual(appendUserMessage(last, firstId, '  '), last);
  assert.strictEqual(appendUserMessage(last, 'missing', 'hello'), last);
});
