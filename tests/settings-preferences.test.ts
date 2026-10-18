import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSettingsPreferences,
  restoreSettingsPreferences,
  settingsPreferenceTextLimits,
  type SettingsPreferences,
} from '../src/settings-preferences.ts';

test('missing, malformed and non-object settings restore an independent default object', () => {
  for (const raw of [null, '', '{broken', 'null', '[]', '42', 'true', '"text"']) {
    const restored = restoreSettingsPreferences(raw);
    assert.deepEqual(restored, defaultSettingsPreferences);
    assert.notStrictEqual(restored, defaultSettingsPreferences);
  }
  const first = restoreSettingsPreferences(null);
  first.nickname = 'Changed';
  assert.equal(restoreSettingsPreferences(null).nickname, '');
});

test('all supported preferences survive a save and restore, including false booleans', () => {
  const changed: SettingsPreferences = {
    ...defaultSettingsPreferences,
    defaultPermission: false, fullAccess: false, taskFolder: '~/Projects/演示', fileOpener: 'Cursor',
    language: 'English', menuBar: false, closeConfirmation: '始终', fullView: true,
    bottomPanel: false, preventSleep: false, notificationTasks: false, notificationSounds: false,
    notificationApprovals: false, completionSound: 'Glass', voice: 'Juniper', voiceLanguage: '简体中文',
    speechBackground: true, personalization: false, customInstructions: '请用中文。\n保留换行。',
    nickname: '测试用户', occupation: '开发者', aboutYou: '本地演示偏好', mini: false,
    pets: true, computerUse: true, computerHistory: true, appSnapshots: true,
    browserConnection: true, usageSharing: true,
    terminalPosition: '右侧', compressHistory: true, betaFeatures: true, editorPredictions: false,
    plainTextEditor: true, contextUsage: false, sendShortcut: '始终⌘+Enter', followUpBehavior: '引导',
    turnNotification: '始终', questionNotifications: false, confetti: false, audioVisualizer: false,
  };
  assert.deepEqual(restoreSettingsPreferences(JSON.stringify(changed)), changed);
});

test('incorrect field types do not coerce to enabled booleans or discard valid neighboring fields', () => {
  const invalid: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaultSettingsPreferences)) {
    if (typeof value === 'boolean') invalid[key] = value ? 0 : 'true';
  }
  Object.assign(invalid, { taskFolder: [], customInstructions: {}, nickname: 123, occupation: null, aboutYou: false, language: 'English' });
  const restored = restoreSettingsPreferences(JSON.stringify(invalid));
  assert.deepEqual(restored, { ...defaultSettingsPreferences, language: 'English' });
});

test('enum fields accept their full supported choices and reject unrelated values and wrong types', () => {
  const choices = {
    fileOpener: ['VS Code', 'Cursor', 'Finder', '终端'],
    language: ['自动检测', '简体中文', 'English'],
    closeConfirmation: ['仅在使用“关闭”快捷键时', '始终', '从不'],
    completionSound: ['默认', '无', '经典', 'Basso', 'Glass', 'Ping', 'Pop', 'Purr', 'Tink'],
    voice: ['Cove', 'Ember', 'Juniper'],
    voiceLanguage: ['自动检测', '简体中文', 'English'],
  } as const;
  for (const [key, values] of Object.entries(choices)) {
    for (const value of values) assert.equal(restoreSettingsPreferences(JSON.stringify({ [key]: value }))[key as keyof SettingsPreferences], value);
    for (const value of ['unsupported', '', 1, true, null, {}, []]) {
      assert.equal(restoreSettingsPreferences(JSON.stringify({ [key]: value }))[key as keyof SettingsPreferences], defaultSettingsPreferences[key as keyof SettingsPreferences]);
    }
  }
});

test('additional general-setting enums use verified choices and discard the unsupported soft sound', () => {
  const choices = {
    terminalPosition: ['底部', '右侧'],
    sendShortcut: ['Enter', '⌘+Enter（多行）', '始终⌘+Enter'],
    followUpBehavior: ['排队', '引导'],
    turnNotification: ['从不', '仅非焦点时', '始终'],
  } as const;
  for (const [key, values] of Object.entries(choices)) {
    for (const value of values) assert.equal(restoreSettingsPreferences(JSON.stringify({ [key]: value }))[key as keyof SettingsPreferences], value);
    for (const value of ['unsupported', '', 1, true, null, {}, []]) {
      assert.equal(restoreSettingsPreferences(JSON.stringify({ [key]: value }))[key as keyof SettingsPreferences], defaultSettingsPreferences[key as keyof SettingsPreferences]);
    }
  }
  assert.equal(restoreSettingsPreferences('{"completionSound":"轻柔"}').completionSound, '默认');
});

test('text limits accept the boundary and reset only oversized fields without truncating user text', () => {
  for (const [key, limit] of Object.entries(settingsPreferenceTextLimits)) {
    const exact = '字'.repeat(limit);
    assert.equal(restoreSettingsPreferences(JSON.stringify({ [key]: exact }))[key as keyof SettingsPreferences], exact);
    const restored = restoreSettingsPreferences(JSON.stringify({ [key]: exact + '字', voice: 'Ember' }));
    assert.equal(restored[key as keyof SettingsPreferences], defaultSettingsPreferences[key as keyof SettingsPreferences]);
    assert.equal(restored.voice, 'Ember');
  }
  assert.equal(restoreSettingsPreferences('{"taskFolder":"  "}').taskFolder, defaultSettingsPreferences.taskFolder);
  assert.equal(restoreSettingsPreferences('{"nickname":"","customInstructions":""}').nickname, '');
});

test('unknown and prototype-related fields never enter the restored settings', () => {
  const restored = restoreSettingsPreferences('{"nickname":"Demo","token":"discard","systemPermissions":{"all":true},"__proto__":{"polluted":true},"constructor":{"x":1}}');
  assert.deepEqual(Object.keys(restored).sort(), Object.keys(defaultSettingsPreferences).sort());
  assert.equal(Object.hasOwn(restored, '__proto__'), false);
  assert.equal(Object.hasOwn(restored, 'token'), false);
  assert.equal(Object.hasOwn(restored, 'systemPermissions'), false);
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal(restored.nickname, 'Demo');
});

test('composer approval choice persists while invalid or older values default safely', () => {
  for (const permissionMode of ['请求批准', '帮我批准', '完全访问'] as const) {
    assert.equal(restoreSettingsPreferences(JSON.stringify({ permissionMode })).permissionMode, permissionMode);
  }
  for (const permissionMode of [undefined, null, true, 'invalid', 2]) {
    assert.equal(restoreSettingsPreferences(JSON.stringify({ permissionMode, nickname: '保留' })).permissionMode, '请求批准');
  }
  const first = restoreSettingsPreferences(JSON.stringify({ permissionMode: '完全访问' }));
  assert.equal(restoreSettingsPreferences(null).permissionMode, '请求批准');
  assert.equal(first.permissionMode, '完全访问');
});
