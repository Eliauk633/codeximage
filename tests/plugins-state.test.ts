import test from 'node:test';
import assert from 'node:assert/strict';
import { installPlugin, pluginIds, removePlugin, restorePluginsState, setPluginEnabled } from '../src/plugins-state.ts';

test('plugin restoration starts empty and returns independent known fields only', () => {
  const first = restorePluginsState(null);
  const second = restorePluginsState(undefined);
  first.installed.push({ id: 'gmail', enabled: true, installedAt: 10 });
  assert.deepEqual(second, { version: 1, installed: [] });
  const raw = { version: 1, installed: [{ id: 'gmail', enabled: false, installedAt: 10, token: 'not-restored', connected: true }], token: 'not-restored' };
  const result = restorePluginsState(raw);
  assert.deepEqual(result, { version: 1, installed: [{ id: 'gmail', enabled: false, installedAt: 10 }] });
  result.installed[0].enabled = true;
  assert.equal(raw.installed[0].enabled, false);
});

test('plugin restoration rejects unknown ids, invalid values and duplicates while preserving valid entries', () => {
  const items = [null, [], {}, { id: 'unknown', enabled: true, installedAt: 1 },
    { id: 'gmail', enabled: 'true', installedAt: 1 }, { id: 'gmail', enabled: true, installedAt: '1' },
    ...[-1, Infinity, NaN, 8.64e15].map(installedAt => ({ id: 'gmail', enabled: true, installedAt })),
    { id: 'gmail', enabled: false, installedAt: 100 }, { id: 'gmail', enabled: true, installedAt: 200 },
    { id: 'github', enabled: true, installedAt: 300 }];
  assert.deepEqual(restorePluginsState({ version: 1, installed: items }).installed, [
    { id: 'gmail', enabled: false, installedAt: 100 }, { id: 'github', enabled: true, installedAt: 300 },
  ]);
  for (const raw of [[], 'invalid', { version: 2, installed: items }, { version: 1, installed: {} }]) {
    assert.deepEqual(restorePluginsState(raw).installed, []);
  }
});

test('install, toggle and removal preserve other plugins without mutating prior state', () => {
  const original = restorePluginsState(undefined);
  let current = original;
  for (const id of pluginIds) current = installPlugin(current, id, 123);
  assert.equal(current.installed.length, 5);
  assert.equal(original.installed.length, 0);
  assert.strictEqual(installPlugin(current, 'gmail', 456), current);
  assert.strictEqual(installPlugin(original, 'gmail', NaN), original);
  const disabled = setPluginEnabled(current, 'gmail', false);
  assert.equal(disabled.installed.find(item => item.id === 'gmail')?.enabled, false);
  assert.equal(current.installed.find(item => item.id === 'gmail')?.enabled, true);
  assert.strictEqual(setPluginEnabled(disabled, 'gmail', false), disabled);
  const removed = removePlugin(disabled, 'gmail');
  assert.equal(removed.installed.length, 4);
  assert.equal(disabled.installed.length, 5);
  assert.strictEqual(removePlugin(removed, 'gmail'), removed);
  assert.strictEqual(setPluginEnabled(removed, 'gmail', true), removed);
  assert.equal(installPlugin(removed, 'gmail', 999).installed.at(-1)?.installedAt, 999);
});
