import { validCompanionAvatar, validCompanionName } from './companion.ts';
/** Display preferences for this prototype only; these values do not grant system permissions. */
export type PermissionMode = '请求批准' | '帮我批准' | '完全访问';

export type SettingsPreferences = {
  companionName: string;
  companionAvatar: string;
  permissionMode: PermissionMode;
  defaultPermission: boolean;
  fullAccess: boolean;
  taskFolder: string;
  fileOpener: 'VS Code' | 'Cursor' | 'Finder' | '终端';
  language: '自动检测' | '简体中文' | 'English';
  menuBar: boolean;
  closeConfirmation: '仅在使用“关闭”快捷键时' | '始终' | '从不';
  fullView: boolean;
  bottomPanel: boolean;
  terminalPosition: '底部' | '右侧';
  compressHistory: boolean;
  betaFeatures: boolean;
  editorPredictions: boolean;
  plainTextEditor: boolean;
  contextUsage: boolean;
  sendShortcut: 'Enter' | '⌘+Enter（多行）' | '始终⌘+Enter';
  followUpBehavior: '排队' | '引导';
  preventSleep: boolean;
  notificationTasks: boolean;
  notificationSounds: boolean;
  notificationApprovals: boolean;
  turnNotification: '从不' | '仅非焦点时' | '始终';
  questionNotifications: boolean;
  completionSound: '默认' | '无' | '经典' | 'Basso' | 'Glass' | 'Ping' | 'Pop' | 'Purr' | 'Tink';
  voice: 'Cove' | 'Ember' | 'Juniper';
  voiceLanguage: '自动检测' | '简体中文' | 'English';
  speechBackground: boolean;
  audioVisualizer: boolean;
  personalization: boolean;
  customInstructions: string;
  nickname: string;
  occupation: string;
  aboutYou: string;
  mini: boolean;
  pets: boolean;
  confetti: boolean;
  computerUse: boolean;
  computerHistory: boolean;
  appSnapshots: boolean;
  browserConnection: boolean;
  usageSharing: boolean;
};

export const defaultSettingsPreferences: SettingsPreferences = {
  companionName: '小智',
  companionAvatar: '',
  permissionMode: '请求批准',
  defaultPermission: true,
  fullAccess: true,
  taskFolder: '~/Documents/Codex',
  fileOpener: 'VS Code',
  language: '自动检测',
  menuBar: true,
  closeConfirmation: '仅在使用“关闭”快捷键时',
  fullView: false,
  bottomPanel: true,
  terminalPosition: '底部',
  compressHistory: false,
  betaFeatures: false,
  editorPredictions: true,
  plainTextEditor: false,
  contextUsage: true,
  sendShortcut: 'Enter',
  followUpBehavior: '排队',
  preventSleep: true,
  notificationTasks: true,
  notificationSounds: true,
  notificationApprovals: true,
  turnNotification: '仅非焦点时',
  questionNotifications: true,
  completionSound: '默认',
  voice: 'Cove',
  voiceLanguage: '自动检测',
  speechBackground: false,
  audioVisualizer: true,
  personalization: true,
  customInstructions: '',
  nickname: '',
  occupation: '',
  aboutYou: '',
  mini: true,
  pets: false,
  confetti: true,
  computerUse: false,
  computerHistory: false,
  appSnapshots: false,
  browserConnection: false,
  usageSharing: false,
};

/** UTF-16 lengths, matching HTML input/textarea maxLength. Oversized fields reset to their default. */
export const settingsPreferenceTextLimits = {
  taskFolder: 1024,
  customInstructions: 12000,
  nickname: 80,
  occupation: 160,
  aboutYou: 4000,
} as const;

const booleanFields = [
  'defaultPermission', 'fullAccess', 'menuBar', 'fullView', 'bottomPanel', 'preventSleep',
  'notificationTasks', 'notificationSounds', 'notificationApprovals', 'speechBackground',
  'personalization', 'mini', 'pets', 'computerUse', 'computerHistory', 'appSnapshots',
  'browserConnection', 'usageSharing',
  'compressHistory', 'betaFeatures', 'editorPredictions', 'plainTextEditor', 'contextUsage',
  'questionNotifications', 'confetti', 'audioVisualizer',
] as const;

function enumValue<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

/** Parse only our known preference fields. Storage reads/writes remain the caller's responsibility. */
export function restoreSettingsPreferences(raw: string | null): SettingsPreferences {
  const result = { ...defaultSettingsPreferences };
  if (!raw) return result;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return result; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
  const saved = parsed as Record<string, unknown>;

  for (const key of booleanFields) {
    const value = saved[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  for (const key of Object.keys(settingsPreferenceTextLimits) as (keyof typeof settingsPreferenceTextLimits)[]) {
    const value = saved[key];
    if (typeof value === 'string' && value.length <= settingsPreferenceTextLimits[key]
      && (key !== 'taskFolder' || value.trim().length > 0)) result[key] = value;
  }

  if (validCompanionName(saved.companionName)) result.companionName = saved.companionName.trim();
  if (validCompanionAvatar(saved.companionAvatar)) result.companionAvatar = saved.companionAvatar;
  result.permissionMode = enumValue(saved.permissionMode, ['请求批准', '帮我批准', '完全访问'], result.permissionMode);
  result.fileOpener = enumValue(saved.fileOpener, ['VS Code', 'Cursor', 'Finder', '终端'], result.fileOpener);
  result.language = enumValue(saved.language, ['自动检测', '简体中文', 'English'], result.language);
  result.closeConfirmation = enumValue(saved.closeConfirmation, ['仅在使用“关闭”快捷键时', '始终', '从不'], result.closeConfirmation);
  result.terminalPosition = enumValue(saved.terminalPosition, ['底部', '右侧'], result.terminalPosition);
  result.sendShortcut = enumValue(saved.sendShortcut, ['Enter', '⌘+Enter（多行）', '始终⌘+Enter'], result.sendShortcut);
  result.followUpBehavior = enumValue(saved.followUpBehavior, ['排队', '引导'], result.followUpBehavior);
  result.turnNotification = enumValue(saved.turnNotification, ['从不', '仅非焦点时', '始终'], result.turnNotification);
  result.completionSound = enumValue(saved.completionSound, ['默认', '无', '经典', 'Basso', 'Glass', 'Ping', 'Pop', 'Purr', 'Tink'], result.completionSound);
  result.voice = enumValue(saved.voice, ['Cove', 'Ember', 'Juniper'], result.voice);
  result.voiceLanguage = enumValue(saved.voiceLanguage, ['自动检测', '简体中文', 'English'], result.voiceLanguage);
  return result;
}
