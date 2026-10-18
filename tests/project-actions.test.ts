import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, normalizeProjectEmoji, restoreState, type AppState } from '../src/model.ts';
import { addProjectSection, archiveProjectChats, editProject, moveProjectToSection,
  removeProject, removeProjectSection, renameProjectSection, restoreRemovedProject, setProjectPinned } from '../src/project-actions.ts';

function fixture(): AppState {
  const state = createInitialState();
  state.workMode = 'chatgpt';
  state.chatGptMode = 'chat';
  state.projectSections = [{ id: 'section-a', name: '工作' }, { id: 'section-b', name: '个人' }];
  state.projects[0] = { ...state.projects[0], sectionId: 'section-a', pinned: true };
  const original = state.threads[0];
  state.threads = [
    { ...original, kind: 'chat', messages: [{ id: 'm1', role: 'user', content: '保留内容', createdAt: 7 }], updatedAt: 17 },
    { ...original, id: 'work', kind: 'work', pinned: false, updatedAt: 19 },
    { ...original, id: 'archived', archived: true, updatedAt: 11 },
    state.threads[1],
  ];
  state.activeThreadId = original.id;
  return state;
}

test('旧账号恢复新增分区默认空，原项目和会话字段保持不变', () => {
  const legacy: Record<string, unknown> = { ...createInitialState() };
  delete legacy.projectSections;
  const restored = restoreState(JSON.stringify(legacy));
  assert.deepEqual(restored.projectSections, []);
  assert.deepEqual(restored.projects, legacy.projects);
  assert.deepEqual(restored.threads, legacy.threads);
});

test('恢复过滤非法分区和外观，sources 去重并统一主要路径', () => {
  const state = createInitialState();
  const raw = { ...state, projectSections: [
    { id: 'ok', name: ' 工作 ', unknown: true }, { id: 'ok', name: '重复 ID' },
    { id: 'blank', name: '  ' }, { id: 0, name: '坏 ID' }, null,
  ], projects: [
    { id: 'a', name: '旧名称', path: '/old', pinned: true, sectionId: 'ok', sources: [' /a ', '/a', 5, '', '/b'], icon: 'code', emoji: ' 🐸 ', color: 'blue', unknown: true },
    { id: 'b', name: '旧名称2', path: '/keep', pinned: 'yes', sectionId: 'missing', sources: ['', 0], icon: 'script', emoji: ' ', color: 'url(...)' },
  ] };
  const restored = restoreState(JSON.stringify(raw));
  assert.deepEqual(restored.projectSections, [{ id: 'ok', name: '工作' }]);
  assert.deepEqual(restored.projects, [
    { id: 'a', name: '旧名称', path: '/a', pinned: true, sectionId: 'ok', sources: ['/a', '/b'], emoji: '🐸', color: 'blue' },
    { id: 'b', name: '旧名称2', path: '/keep' },
  ]);
});

test('新项目字段与分区 roundtrip，模式和聊天完整保留', () => {
  const state = fixture();
  state.projects[0] = { ...state.projects[0], sources: ['/primary', '/extra'], path: '/primary', icon: 'terminal', color: 'purple' };
  assert.deepEqual(restoreState(JSON.stringify(state)), state);
});

test('编辑名称、来源不修改聊天或其来源，原状态不变', () => {
  const state = fixture();
  const before = structuredClone(state);
  const next = editProject(state, state.projects[0].id, { name: '  新项目  ', sources: [' /b ', '/a', '/b'] });
  assert.equal(next.projects[0].name, '新项目');
  assert.equal(next.projects[0].path, '/b');
  assert.deepEqual(next.projects[0].sources, ['/b', '/a']);
  assert.equal(next.projects[0].sectionId, 'section-a');
  assert.equal(next.projects[0].pinned, true);
  assert.strictEqual(next.threads, state.threads);
  assert.equal(next.activeThreadId, state.activeThreadId);
  assert.deepEqual(state, before);
  const pathOnly = editProject(next, next.projects[0].id, { path: ' /a ' });
  assert.deepEqual(pathOnly.projects[0].sources, ['/a', '/b']);
  assert.equal(pathOnly.projects[0].path, '/a');
});

test('非法项目、空名称和空来源拒绝整个编辑；长名称截断', () => {
  const state = fixture();
  const id = state.projects[0].id;
  assert.strictEqual(editProject(state, 'missing', { name: '新名称' }), state);
  assert.strictEqual(editProject(state, id, { name: '   ', color: 'blue' }), state);
  assert.strictEqual(editProject(state, id, { name: '不能部分保存', sources: [] }), state);
  assert.strictEqual(editProject(state, id, { sources: ['  '] }), state);
  assert.strictEqual(editProject(state, id, {}), state);
  assert.equal(editProject(state, id, { name: '新'.repeat(200) }).projects[0].name.length, 120);
  assert.equal('sources' in editProject(state, id, { name: '仅改名' }).projects[0], false);
});

test('外观切换互斥、完整保留组合表情，并可完全恢复默认', () => {
  const state = fixture();
  const id = state.projects[0].id;
  const emoji = editProject(state, id, { icon: 'code', emoji: ' 👩🏽‍❤️‍💋‍👩🏿 ', color: 'green' });
  assert.equal(emoji.projects[0].emoji, '👩🏽‍❤️‍💋‍👩🏿');
  assert.equal('icon' in emoji.projects[0], false);
  const icon = editProject(emoji, id, { icon: 'book', emoji: null });
  assert.equal(icon.projects[0].icon, 'book');
  assert.equal('emoji' in icon.projects[0], false);
  const plain = editProject(icon, id, { icon: null, emoji: null, color: null });
  assert.equal('icon' in plain.projects[0], false);
  assert.equal('emoji' in plain.projects[0], false);
  assert.equal('color' in plain.projects[0], false);
});

test('表情规范化完整保留合法 ZWJ、旗帜、肤色、keycap，拒绝普通文字和多个表情', () => {
  for (const emoji of ['👩🏽‍❤️‍💋‍👩🏿', '👨‍👩‍👧‍👦', '🇨🇳', '👍🏽', '1️⃣', '🐸', '❤️']) {
    assert.equal(normalizeProjectEmoji(` ${emoji} `), emoji);
    const state = createInitialState();
    state.projects[0] = { ...state.projects[0], emoji };
    assert.equal(restoreState(JSON.stringify(state)).projects[0].emoji, emoji);
  }
  for (const invalid of ['', ' ', '项目', 'abc', '<script>alert(1)</script>', '🐸文字', '文字🐸', '😀😀', '1', '👩🏽‍❤️‍💋‍', null, 5]) {
    assert.equal(normalizeProjectEmoji(invalid), undefined);
    const state = createInitialState();
    const raw = { ...state, projects: [{ ...state.projects[0], emoji: invalid }] };
    assert.equal('emoji' in restoreState(JSON.stringify(raw)).projects[0], false);
  }
});

test('非法或空表情编辑不会清除既有头像，只有 null 显式清除', () => {
  const state = fixture();
  state.projects[0].emoji = '👩🏽‍❤️‍💋‍👩🏿';
  for (const invalid of ['', ' ', 'abc', '😀😀', '👩🏽‍❤️‍💋‍👩🏿文字']) {
    const next = editProject(state, state.projects[0].id, { emoji: invalid });
    assert.equal(next.projects[0].emoji, state.projects[0].emoji);
  }
  const cleared = editProject(state, state.projects[0].id, { emoji: null });
  assert.equal('emoji' in cleared.projects[0], false);
  assert.equal(state.projects[0].emoji, '👩🏽‍❤️‍💋‍👩🏿');
});

test('置顶独立保留分区，移动分区取消置顶，取消分区不影响聊天', () => {
  const state = fixture();
  const id = state.projects[0].id;
  const unpinned = setProjectPinned(state, id, false);
  assert.equal(unpinned.projects[0].sectionId, 'section-a');
  const pinned = setProjectPinned(unpinned, id, true);
  assert.equal(pinned.projects[0].sectionId, 'section-a');
  const moved = moveProjectToSection(pinned, id, 'section-b');
  assert.equal(moved.projects[0].sectionId, 'section-b');
  assert.equal(moved.projects[0].pinned, false);
  assert.strictEqual(moved.threads, state.threads);
  const cleared = moveProjectToSection(moved, id, null);
  assert.equal('sectionId' in cleared.projects[0], false);
  assert.strictEqual(moveProjectToSection(state, id, 'missing'), state);
  assert.strictEqual(moveProjectToSection(state, 'missing', 'section-a'), state);
  assert.strictEqual(setProjectPinned(state, 'missing', true), state);
});

test('分区增改删闭环、空名及重名拒绝，删分区不会删项目或聊天', () => {
  const state = fixture();
  const added = addProjectSection(state, ' 新分区 ');
  const section = added.projectSections.at(-1)!;
  assert.equal(section.name, '新分区');
  assert.ok(section.id);
  assert.equal(added.projectSections.length, 3);
  assert.strictEqual(addProjectSection(state, '工作'), state);
  assert.strictEqual(addProjectSection(state, ' '), state);
  assert.strictEqual(renameProjectSection(state, 'section-a', '个人'), state);
  assert.strictEqual(renameProjectSection(state, 'section-a', '  '), state);
  assert.strictEqual(renameProjectSection(state, 'missing', '新名称'), state);
  const renamed = renameProjectSection(added, section.id, '重命名');
  assert.equal(renamed.projectSections.at(-1)!.name, '重命名');
  const removed = removeProjectSection(state, 'section-a');
  assert.deepEqual(removed.projectSections, [{ id: 'section-b', name: '个人' }]);
  assert.equal(removed.projects.length, state.projects.length);
  assert.equal('sectionId' in removed.projects[0], false);
  assert.equal(removed.projects[0].pinned, true);
  assert.strictEqual(removed.threads, state.threads);
  assert.strictEqual(removeProjectSection(state, 'missing'), state);
  assert.equal(state.projects[0].sectionId, 'section-a');
});

test('批量归档仅项目未归档聊天，保留来源、消息、时间及关联', () => {
  const state = fixture();
  const next = archiveProjectChats(state, state.projects[0].id);
  assert.equal(next.activeThreadId, null);
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(next.threads[index], { ...state.threads[index], archived: true });
    assert.strictEqual(next.threads[index].messages, state.threads[index].messages);
  }
  assert.strictEqual(next.threads[2], state.threads[2]);
  assert.strictEqual(next.threads[3], state.threads[3]);
  assert.equal(state.threads[0].archived, false);
  assert.strictEqual(archiveProjectChats(next, state.projects[0].id), next);
  assert.strictEqual(archiveProjectChats(state, 'missing'), state);
  const otherActive = { ...state, activeThreadId: state.threads[3].id };
  assert.equal(archiveProjectChats(otherActive, state.projects[0].id).activeThreadId, state.threads[3].id);
});

test('移除项目仅解除聊天关联，保留当前会话、来源、消息、置顶与归档', () => {
  const state = fixture();
  const next = removeProject(state, state.projects[0].id);
  assert.deepEqual(next.projects, [state.projects[1]]);
  assert.equal(next.activeThreadId, state.activeThreadId);
  assert.equal(next.workMode, 'chatgpt');
  assert.equal(next.chatGptMode, 'chat');
  assert.equal(next.threads.length, state.threads.length);
  for (let index = 0; index < 3; index++) assert.deepEqual(next.threads[index], { ...state.threads[index], projectId: null });
  assert.strictEqual(next.threads[3], state.threads[3]);
  assert.strictEqual(next.projectSections, state.projectSections);
  assert.strictEqual(removeProject(state, 'missing'), state);
  assert.equal(state.threads[0].projectId, state.projects[0].id);
});

test('撤销移除保留聊天最新状态，仅恢复仍未归属其他项目的记录', () => {
  const state = fixture();
  const project = state.projects[0];
  const removed = removeProject(state, project.id);
  removed.threads = removed.threads.map((thread, index) => index === 0
    ? { ...thread, updatedAt: 100, pinned: false, kind: 'work', messages: [...thread.messages, { id: 'latest', role: 'user', content: '移除后新增', createdAt: 100 }] }
    : index === 1 ? { ...thread, projectId: state.projects[1].id }
    : index === 2 ? { ...thread, archived: false } : thread);
  removed.threads.push({ ...removed.threads[0], id: 'unrelated', projectId: null });
  const snapshot = structuredClone(removed);
  const restored = restoreRemovedProject(removed, project, 0, ['layout-draft', 'work', 'archived', 'deleted']);
  assert.deepEqual(restored.projects, state.projects);
  assert.deepEqual(restored.threads[0], { ...removed.threads[0], projectId: project.id });
  assert.strictEqual(restored.threads[0].messages, removed.threads[0].messages);
  assert.strictEqual(restored.threads[1], removed.threads[1]);
  assert.deepEqual(restored.threads[2], { ...removed.threads[2], projectId: project.id });
  assert.strictEqual(restored.threads[3], removed.threads[3]);
  assert.strictEqual(restored.threads[4], removed.threads[4]);
  assert.equal(restored.activeThreadId, removed.activeThreadId);
  assert.equal(restored.workMode, removed.workMode);
  assert.equal(restored.chatGptMode, removed.chatGptMode);
  assert.deepEqual(removed, snapshot);
});

test('撤销遇相同项目 ID 或主要路径冲突时整次拒绝', () => {
  const state = fixture();
  const project = state.projects[0];
  assert.strictEqual(restoreRemovedProject(state, { ...project, path: '/different' }, 0, ['starter-notes']), state);
  const removed = removeProject(state, project.id);
  const conflicting = { ...removed, projects: [...removed.projects, { ...project, id: 'recreated' }] };
  assert.strictEqual(restoreRemovedProject(conflicting, project, 0, ['layout-draft']), conflicting);
  assert.equal(conflicting.threads[0].projectId, null);
});

test('撤销位置限制在当前项目范围，已删除分区不会复活', () => {
  const state = fixture();
  const project = { ...state.projects[0], sources: ['/primary', '/secondary'], path: '/primary' };
  const removed = removeProjectSection(removeProject(state, project.id), 'section-a');
  const restored = restoreRemovedProject(removed, project, -5, []);
  assert.equal(restored.projects[0].id, project.id);
  assert.equal('sectionId' in restored.projects[0], false);
  assert.equal(restored.projects[0].pinned, true);
  assert.deepEqual(restored.projects[0].sources, project.sources);
  assert.equal(project.sectionId, 'section-a');
  assert.deepEqual(restored.projectSections, removed.projectSections);
  assert.deepEqual(restored.threads, removed.threads);
  assert.equal(restoreRemovedProject(removed, project, 99, []).projects.at(-1)!.id, project.id);
  const middle = { ...removed, projects: [...removed.projects, { id: 'third', name: '第三个', path: '/third' }] };
  assert.deepEqual(restoreRemovedProject(middle, project, 1, []).projects.map(value => value.id), [middle.projects[0].id, project.id, 'third']);
});
