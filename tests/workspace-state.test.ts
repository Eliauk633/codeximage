import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspace } from '../src/workspace-state.ts';

test('new accounts have independent state, preference, profile and billing objects', () => {
  const first = parseWorkspace(null);
  const second = parseWorkspace(null);
  const originalDuration = second.profileDemo.durationMinutes;
  first.state.threads[0].title = 'account A';
  first.preferences.nickname = 'account A';
  first.profileDemo.durationMinutes = originalDuration + 1;
  first.usageDemo.balance = 123;
  first.usageDemo.resetHistory.push(Date.now());
  assert.notEqual(second.state.threads[0].title, 'account A');
  assert.equal(second.preferences.nickname, '');
  assert.notStrictEqual(first.profileDemo, second.profileDemo);
  assert.equal(second.profileDemo.durationMinutes, originalDuration);
  assert.notStrictEqual(first.usageDemo, second.usageDemo);
  assert.equal(second.usageDemo.balance, 10_000);
  assert.deepEqual(second.usageDemo.resetHistory, []);
});

test('known workspace values restore without accepting legacy identity or secrets', () => {
  const saved = parseWorkspace(null);
  saved.preferences.language = 'English';
  saved.state.theme = 'dark';
  saved.profileDemo.durationMinutes = 1234;
  const raw = JSON.stringify({ ...saved, session: { username: 'old' },
    state: { ...saved.state, session: { username: 'old' } },
    preferences: { ...saved.preferences, bearer: 'not-a-credential' },
    profileDemo: { ...saved.profileDemo, session: { username: 'old' }, bearer: 'not-a-credential' },
    usageDemo: { ...saved.usageDemo, session: { username: 'old' }, bearer: 'not-a-credential' } });
  const restored = parseWorkspace(raw);
  assert.equal(restored.preferences.language, 'English');
  assert.equal(restored.state.theme, 'dark');
  assert.deepEqual(restored.profileDemo, saved.profileDemo);
  assert.deepEqual(restored.usageDemo, saved.usageDemo);
  assert.equal(JSON.stringify(restored).includes('session'), false);
  assert.equal('bearer' in restored.preferences, false);
  assert.equal('bearer' in restored.profileDemo, false);
  assert.equal('bearer' in restored.usageDemo, false);
});

test('legacy workspaces receive profile defaults without changing existing account data', () => {
  const saved = parseWorkspace(null);
  saved.state.threads[0].title = 'existing conversation';
  saved.state.projects[0].path = '/existing/project';
  saved.preferences.nickname = 'existing preference';
  const restored = parseWorkspace(JSON.stringify({ schema: saved.schema, state: saved.state, preferences: saved.preferences }));
  assert.equal(restored.schema, 1);
  assert.ok(restored.profileDemo);
  assert.deepEqual(restored.state, saved.state);
  assert.deepEqual(restored.preferences, saved.preferences);
  assert.deepEqual(restored.profileDemo, saved.profileDemo);
});

test('damaged profile demo values reset only their own configuration', () => {
  const saved = parseWorkspace(null);
  saved.state.threads[0].title = 'keep this conversation';
  saved.state.projects[0].path = '/keep/this/project';
  saved.preferences.language = 'English';
  for (const profileDemo of [null, [], 42, 'invalid', {}, { ...saved.profileDemo, durationMinutes: -1 },
    { ...saved.profileDemo, startDate: '2026-02-30' }]) {
    const restored = parseWorkspace(JSON.stringify({ ...saved, profileDemo }));
    assert.equal(restored.schema, 1);
    assert.ok(restored.profileDemo);
    assert.deepEqual(restored.state, saved.state);
    assert.deepEqual(restored.preferences, saved.preferences);
    assert.deepEqual(restored.profileDemo, saved.profileDemo);
  }
});

test('damaged or future workspace formats do not silently reset saved data', () => {
  for (const raw of ['{', 'null', '[]', '{}', '{"schema":2}', JSON.stringify({ ...parseWorkspace(null), preferences: [] })]) {
    assert.throws(() => parseWorkspace(raw));
  }
});

test('adding gap-day editing preserves legacy profile values and account contents', () => {
  const saved = parseWorkspace(null);
  saved.profileDemo.durationMinutes = 321;
  saved.state.threads[0].title = 'preserve existing account';
  const { gapDays: omitted, ...legacyDemo } = saved.profileDemo;
  const restored = parseWorkspace(JSON.stringify({ ...saved, profileDemo: legacyDemo }));
  assert.equal(restored.profileDemo.gapDays, 2);
  assert.deepEqual(restored.profileDemo, { ...legacyDemo, gapDays: 2 });
  assert.deepEqual(restored.state, saved.state);
  assert.deepEqual(restored.preferences, saved.preferences);
});

test('explicit gap counts survive save/restore and are not shared between accounts', () => {
  const first = parseWorkspace(null);
  const second = parseWorkspace(null);
  first.profileDemo.gapDays = 10;
  assert.equal(parseWorkspace(JSON.stringify(first)).profileDemo.gapDays, 10);
  assert.equal(second.profileDemo.gapDays, 2);
  const recovered = parseWorkspace(JSON.stringify({ ...first, profileDemo: { ...first.profileDemo, gapDays: -1 } }));
  assert.deepEqual(recovered.profileDemo, { ...first.profileDemo, gapDays: 2 });
});

test('workspaces created before billing editing retain profile and account data', () => {
  const saved = parseWorkspace(null);
  saved.state.threads[0].title = 'existing billing workspace';
  saved.preferences.nickname = 'existing nickname';
  saved.profileDemo.durationMinutes = 876;
  const { usageDemo, ...legacy } = saved;
  const before = Date.now();
  const restored = parseWorkspace(JSON.stringify(legacy));
  assert.deepEqual(restored.state, saved.state);
  assert.deepEqual(restored.preferences, saved.preferences);
  assert.deepEqual(restored.profileDemo, saved.profileDemo);
  assert.equal(restored.usageDemo.plan, 'ChatGPT Pro 200');
  assert.equal(restored.usageDemo.weeklyRemaining, 50);
  assert.ok(restored.usageDemo.weeklyResetAt >= before + 140 * 3_600_000);
  assert.ok(restored.usageDemo.weeklyResetAt <= Date.now() + 140 * 3_600_000);
});

test('billing edits including expired dates survive JSON persistence with no profile changes', () => {
  const saved = parseWorkspace(null);
  const past = Date.UTC(2025, 0, 1);
  saved.usageDemo = { ...saved.usageDemo, plan: 'ChatGPT Go', billingCycle: '年付', weeklyRemaining: 39.25,
    weeklyResetAt: past, balance: 61_438.75, resetCount: 7, resetExpiresAt: past,
    resetExpiryOverrides: { '0': null, '4': past + 3_600_000 },
    allowReset: true, resetHistory: [past - 3_600_000, past] };
  const restored = parseWorkspace(JSON.stringify(saved));
  assert.deepEqual(restored, saved);
  restored.usageDemo.resetHistory.push(Date.now());
  assert.equal(saved.usageDemo.resetHistory.length, 2);
  restored.usageDemo.resetExpiryOverrides!['0'] = past;
  assert.equal(saved.usageDemo.resetExpiryOverrides['0'], null);
});

test('damaged billing data falls back without erasing the rest of the workspace', () => {
  const saved = parseWorkspace(null);
  saved.state.threads[0].title = 'keep conversation';
  saved.preferences.language = 'English';
  saved.profileDemo.durationMinutes = 456;
  for (const usageDemo of [null, [], {}, { ...saved.usageDemo, balance: -1 },
    { ...saved.usageDemo, resetExpiresAt: 'invalid' }]) {
    const restored = parseWorkspace(JSON.stringify({ ...saved, usageDemo }));
    assert.deepEqual(restored.state, saved.state);
    assert.deepEqual(restored.preferences, saved.preferences);
    assert.deepEqual(restored.profileDemo, saved.profileDemo);
    assert.equal(restored.usageDemo.balance, 10_000);
    assert.equal(restored.usageDemo.resetExpiresAt, null);
  }
});
