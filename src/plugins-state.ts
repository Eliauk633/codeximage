export const pluginIds = ['google-drive', 'notion', 'github', 'gmail', 'google-calendar'] as const;
export type PluginId = typeof pluginIds[number];
export type PluginInstallation = { id: PluginId; enabled: boolean; installedAt: number };
export type PluginsState = { version: 1; installed: PluginInstallation[] };

function validId(value: unknown): value is PluginId {
  return typeof value === 'string' && (pluginIds as readonly string[]).includes(value);
}
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 8.64e15;
}

export function restorePluginsState(value: unknown): PluginsState {
  const result: PluginsState = { version: 1, installed: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.installed)) return result;
  const seen = new Set<PluginId>();
  for (const item of raw.installed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    if (!validId(entry.id) || seen.has(entry.id) || typeof entry.enabled !== 'boolean' || !validTime(entry.installedAt)) continue;
    seen.add(entry.id);
    result.installed.push({ id: entry.id, enabled: entry.enabled, installedAt: entry.installedAt });
    if (seen.size === pluginIds.length) break;
  }
  return result;
}

export function installPlugin(value: PluginsState, id: PluginId, now = Date.now()): PluginsState {
  if (!validId(id) || !validTime(now) || value.installed.some(item => item.id === id)) return value;
  return { ...value, installed: [...value.installed, { id, enabled: true, installedAt: now }] };
}

export function setPluginEnabled(value: PluginsState, id: PluginId, enabled: boolean): PluginsState {
  if (!value.installed.some(item => item.id === id && item.enabled !== enabled)) return value;
  return { ...value, installed: value.installed.map(item => item.id === id ? { ...item, enabled } : item) };
}

export function removePlugin(value: PluginsState, id: PluginId): PluginsState {
  if (!value.installed.some(item => item.id === id)) return value;
  return { ...value, installed: value.installed.filter(item => item.id !== id) };
}
