import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspace, type WorkspaceSnapshot } from '../src/workspace-state.ts';
import { defaultRailPins } from '../src/navigation-state.ts';

const now = new Date(2026, 9, 17, 12, 0).getTime();
function savedWorkspace(): WorkspaceSnapshot {
  const saved = parseWorkspace(null);
  saved.state.threads[0].title = '保留原有聊天';
  saved.preferences.nickname = '原有设置';
  saved.profileDemo.durationMinutes = 875;
  saved.usageDemo.balance = 61_438.25;
  saved.spaces = { schema: 1, view: 'grid', spaces: [{ id: 'project-a', name: '项目资料' }], items: [
    { id: 'notes', title: '项目记录', kind: 'page', content: '# 项目记录\n\n保留中文正文和换行。', url: '', spaceId: 'project-a', shared: false, createdAt: now - 2000, updatedAt: now, deletedAt: null },
    { id: 'site', title: '共享站点', kind: 'site', content: '站点说明', url: 'https://example.com/project?q=one', spaceId: null, shared: true, createdAt: now - 2000, updatedAt: now, deletedAt: now + 1000 },
  ] };
  saved.automations = { tasks: [
    { id: 'weekly-review', name: '每周回顾', instructions: '整理项目进展和下周计划。', paused: true, createdAt: now - 1000, updatedAt: now,
      schedule: { frequency: 'weekly', time: '17:25', weekdays: [1, 5], date: '' } },
    { id: 'past-once', name: '过去的一次任务', instructions: '保留过期任务，不生成完成记录。', paused: false, createdAt: now - 10_000, updatedAt: now,
      schedule: { frequency: 'once', time: '10:00', weekdays: [], date: '2026-10-16' } },
  ] };
  saved.plugins = { version: 1, installed: [{ id: 'github', enabled: false, installedAt: now - 1000 }, { id: 'gmail', enabled: true, installedAt: now }] };
  saved.railPins = ['images', 'automations', 'archive', 'spaces'];
  return saved;
}

test('pre-navigation snapshots get all new module defaults without changing existing account contents', () => {
  const saved = savedWorkspace();
  const { spaces, automations, plugins, railPins, ...legacy } = saved;
  const restored = parseWorkspace(JSON.stringify(legacy));
  const { spaces: actualSpaces, automations: actualAutomations, plugins: actualPlugins, railPins: actualPins, ...existing } = restored;
  assert.deepEqual(existing, legacy);
  assert.equal(actualSpaces.schema, 1);
  assert.equal(actualSpaces.view, 'list');
  assert.deepEqual(actualSpaces.spaces, []);
  assert.deepEqual(actualSpaces.items.filter(item => item.kind === 'page').map(item => item.title), ['项目跟踪表', '待办清单']);
  assert.deepEqual(actualAutomations, { tasks: [] });
  assert.deepEqual(actualPlugins, { version: 1, installed: [] });
  assert.deepEqual(actualPins, ['spaces', 'automations', 'plugins']);
});

test('all navigation modules survive simultaneous JSON save and restore with profile and billing edits', () => {
  const saved = savedWorkspace();
  const restored = parseWorkspace(JSON.stringify(saved));
  assert.deepEqual(restored, saved);
  // A subsequent settings save must retain the other modules, including trash and paused tasks.
  restored.usageDemo.weeklyRemaining = 18.5;
  restored.preferences.language = 'English';
  const savedAgain = parseWorkspace(JSON.stringify(restored));
  assert.deepEqual(savedAgain, restored);
  assert.equal(savedAgain.spaces.items[1].deletedAt, now + 1000);
  assert.equal(savedAgain.automations.tasks[0].paused, true);
  assert.equal(savedAgain.automations.tasks[1].schedule.date, '2026-10-16');
  assert.equal(savedAgain.plugins.installed[0].enabled, false);
  assert.deepEqual(savedAgain.railPins, ['images', 'automations', 'archive', 'spaces']);
});

test('new module data does not share mutable objects across restored accounts', () => {
  const saved = savedWorkspace();
  const first = parseWorkspace(JSON.stringify(saved));
  const second = parseWorkspace(JSON.stringify(saved));
  first.spaces.spaces[0].name = '只修改第一个账号';
  first.spaces.items[0].content = '新的正文';
  first.automations.tasks[0].schedule.weekdays.push(6);
  first.plugins.installed[0].enabled = true;
  first.railPins.splice(0, 1);
  assert.deepEqual(second, saved);
  const defaults = parseWorkspace(null);
  defaults.railPins.length = 0;
  assert.deepEqual(parseWorkspace(null).railPins, ['spaces', 'automations', 'plugins']);
  assert.deepEqual(defaultRailPins, ['spaces', 'automations', 'plugins']);
});

test('malformed rail values fall back or filter unknown entries without erasing module data', () => {
  const saved = savedWorkspace();
  for (const railPins of [undefined, null, false, 12, 'plugins', {}, { 0: 'spaces' }]) {
    const restored = parseWorkspace(JSON.stringify({ ...saved, railPins }));
    assert.deepEqual(restored, { ...saved, railPins: ['spaces', 'automations', 'plugins'] });
  }
  const restored = parseWorkspace(JSON.stringify({ ...saved, railPins: ['plugins', null, 'unknown', 'plugins', 1, 'images', { id: 'spaces' }, 'archive', 'spaces'] }));
  assert.deepEqual(restored, { ...saved, railPins: ['plugins', 'images', 'archive', 'spaces'] });
  for (const railPins of [[], ['unknown', null, false]]) {
    assert.deepEqual(parseWorkspace(JSON.stringify({ ...saved, railPins })), { ...saved, railPins: [] });
  }
});

test('unknown nested module fields are excluded and invalid task or plugin records do not remove valid entries', () => {
  const saved = savedWorkspace();
  const raw = { ...saved,
    spaces: { ...saved.spaces, ignored: true, items: saved.spaces.items.map(item => ({ ...item, ignored: true })) },
    automations: { ...saved.automations, ignored: true, tasks: [null, { id: 'broken' }, ...saved.automations.tasks.map(task => ({ ...task, ignored: true, schedule: { ...task.schedule, ignored: true } }))] },
    plugins: { ...saved.plugins, ignored: true, installed: [{ id: 'unknown', enabled: true, installedAt: now }, ...saved.plugins.installed.map(item => ({ ...item, ignored: true, connected: true }))] },
  };
  assert.deepEqual(parseWorkspace(JSON.stringify(raw)), saved);
});

test('damaged persisted space content is surfaced instead of silently resetting the account workspace', () => {
  const saved = savedWorkspace();
  const damaged = { ...saved, spaces: { ...saved.spaces, items: [{ ...saved.spaces.items[0], spaceId: 'missing-space' }] } };
  const raw = JSON.stringify(damaged);
  assert.throws(() => parseWorkspace(raw), /空间内容包含无效字段/);
  assert.deepEqual(JSON.parse(raw), damaged);
  assert.deepEqual(parseWorkspace(JSON.stringify(saved)), saved);
});
