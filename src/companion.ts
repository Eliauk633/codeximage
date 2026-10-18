import { addThread, normalizeProjectEmoji, type AppState } from './model.ts';

export function validCompanionName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 40 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validCompanionAvatar(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || !!normalizeProjectEmoji(value)
    || (value.length <= 180000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)));
}
export function openCompanion(state: AppState, name: string): AppState {
  const existing = state.threads.find(t => t.kind === 'companion' && !t.archived);
  return existing ? { ...state, activeThreadId: existing.id, panel: 'none' }
    : { ...addThread(state, name, null, 'companion'), panel: 'none' };
}
