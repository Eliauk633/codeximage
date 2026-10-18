import { restoreState, type AppState } from './model.ts';
import { restoreSettingsPreferences, type SettingsPreferences } from './settings-preferences.ts';
import { restoreProfileDemo, type ProfileDemoConfig } from './profile-demo.ts';
import { restoreUsageDemo, type UsageDemoConfig } from './usage-demo.ts';
import { restoreSpacesState, type SpacesState } from './spaces-state.ts';
import { restoreAutomationsState, type AutomationsState } from './automations-state.ts';
import { restorePluginsState, type PluginsState } from './plugins-state.ts';
import { restoreRailPins, type NavigationDestination } from './navigation-state.ts';

export type WorkspaceSnapshot = { schema: 1; state: AppState; preferences: SettingsPreferences; profileDemo: ProfileDemoConfig; usageDemo: UsageDemoConfig;
  spaces: SpacesState; automations: AutomationsState; plugins: PluginsState; railPins: NavigationDestination[] };

/** Unknown or damaged formats must not be silently overwritten with a new workspace. */
export function parseWorkspace(raw: string | null): WorkspaceSnapshot {
  if (raw === null) return { schema: 1, state: restoreState(null), preferences: restoreSettingsPreferences(null),
    profileDemo: restoreProfileDemo(undefined), usageDemo: restoreUsageDemo(undefined), spaces: restoreSpacesState(undefined),
    automations: restoreAutomationsState(undefined), plugins: restorePluginsState(undefined), railPins: restoreRailPins(undefined) };
  const saved = JSON.parse(raw);
  if (!saved || saved.schema !== 1 || !saved.state || saved.state.schema !== 1
    || !Array.isArray(saved.state.projects) || !Array.isArray(saved.state.threads)
    || !saved.preferences || typeof saved.preferences !== 'object' || Array.isArray(saved.preferences)) {
    throw new Error('工作区格式无法读取。');
  }
  return { schema: 1, state: restoreState(JSON.stringify(saved.state)),
    preferences: restoreSettingsPreferences(JSON.stringify(saved.preferences)), profileDemo: restoreProfileDemo(saved.profileDemo),
    usageDemo: restoreUsageDemo(saved.usageDemo), spaces: restoreSpacesState(saved.spaces), automations: restoreAutomationsState(saved.automations),
    plugins: restorePluginsState(saved.plugins), railPins: restoreRailPins(saved.railPins) };
}
