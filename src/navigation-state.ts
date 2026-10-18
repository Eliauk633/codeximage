export const navigationDestinations = ['spaces', 'automations', 'plugins', 'sites', 'images', 'archive'] as const;
export type NavigationDestination = typeof navigationDestinations[number];
export const defaultRailPins: NavigationDestination[] = ['spaces', 'automations', 'plugins'];
export function restoreRailPins(value: unknown): NavigationDestination[] {
  if (!Array.isArray(value)) return [...defaultRailPins];
  return [...new Set(value.filter((item): item is NavigationDestination => (navigationDestinations as readonly unknown[]).includes(item)))];
}
