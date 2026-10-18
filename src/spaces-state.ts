export type SpaceItemKind = 'page' | 'site' | 'image' | 'file';
export type SpaceItem = {
  id: string; title: string; kind: SpaceItemKind; content: string; url: string;
  spaceId: string | null; shared: boolean; createdAt: number; updatedAt: number; deletedAt: number | null;
};
export type SpaceGroup = { id: string; name: string };
export type SpacesState = { schema: 1; items: SpaceItem[]; spaces: SpaceGroup[]; view: 'list' | 'grid' };
export const spacesLimits = { items: 250, groups: 50, title: 160, content: 100_000, imageBytes: 1_000_000, totalBytes: 8 * 1024 * 1024 };
const day = 86_400_000;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const name = (value: unknown, max = spacesLimits.title): value is string => text(value, max) && !!value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function safeSpaceUrl(value: string, kind: SpaceItemKind): boolean {
  if (!value) return true;
  if (kind === 'image') return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value) && value.length <= 1_400_000;
  if (kind !== 'site') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function validateSpacesState(value: unknown): string | null {
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.items) || !Array.isArray(value.spaces)
    || !['list', 'grid'].includes(value.view as string)) return '空间数据格式无法读取。';
  if (value.items.length > spacesLimits.items || value.spaces.length > spacesLimits.groups) return '空间内容数量已达上限。';
  const ids = new Set<string>();
  for (const group of value.spaces) {
    if (!record(group) || !identifier(group.id) || ids.has(group.id) || !name(group.name, 80)) return '空间名称或编号无效。';
    ids.add(group.id);
  }
  const itemIds = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !identifier(item.id) || itemIds.has(item.id) || !name(item.title)
      || !['page', 'site', 'image', 'file'].includes(item.kind as string) || !text(item.content, spacesLimits.content)
      || !text(item.url, 1_400_000) || !safeSpaceUrl(item.url, item.kind as SpaceItemKind)
      || (item.spaceId !== null && (typeof item.spaceId !== 'string' || !ids.has(item.spaceId)))
      || typeof item.shared !== 'boolean' || !timestamp(item.createdAt) || !timestamp(item.updatedAt)
      || item.updatedAt < item.createdAt || (item.deletedAt !== null && !timestamp(item.deletedAt))) return '空间内容包含无效字段。';
    itemIds.add(item.id);
  }
  const bytes = new TextEncoder().encode(JSON.stringify(copySpacesState(value as SpacesState))).byteLength;
  return bytes > spacesLimits.totalBytes ? '空间内容已超过 8 MB，请减少图像、文本内容或清空回收站。' : null;
}

function copySpacesState(saved: SpacesState): SpacesState {
  return { schema: 1, view: saved.view, spaces: saved.spaces.map(({ id, name }) => ({ id, name })),
    items: saved.items.map(({ id, title, kind, content, url, spaceId, shared, createdAt, updatedAt, deletedAt }) => ({ id, title, kind, content, url, spaceId, shared, createdAt, updatedAt, deletedAt })) };
}

export function restoreSpacesState(value: unknown, now = Date.now()): SpacesState {
  if (value === undefined || value === null) {
    const make = (id: string, title: string, kind: SpaceItemKind, days: number, content: string): SpaceItem => ({
      id, title, kind, content, url: '', spaceId: null, shared: false, createdAt: now - days * day, updatedAt: now - days * day, deletedAt: null,
    });
    return { schema: 1, spaces: [], view: 'list', items: [
      make('project-tracker', '项目跟踪表', 'page', 7, '# 项目跟踪表\n\n## 进行中\n- [ ] 梳理需求和优先级\n- [ ] 完成界面设计\n- [ ] 核对验收结果\n\n## 已完成\n- [x] 创建项目空间'),
      make('todo-list', '待办清单', 'page', 14, '# 待办清单\n\n- [ ] 整理本周计划\n- [ ] 跟进项目进度\n- [ ] 记录重要事项'),
      make('recent-agents', 'Codex-AGENTS-Append-Snippet.md', 'file', 1, '# 工作约定\n\n记录项目目标、验收标准和协作方式。'),
      make('recent-project', 'AWS-Oregon-Codex-Project-Context.md', 'file', 2, '# 项目上下文\n\n在这里整理项目说明和进度。'),
      make('recent-rule', 'AWS-Oregon-Android-Rule.yaml', 'file', 3, '# 项目规则\nmode: rule'),
      make('recent-android', 'AWS-Oregon-Android-Global.yaml', 'file', 4, '# 全局配置\nmode: global'),
      make('recent-windows', 'AWS-Oregon-Windows-Global.yaml', 'file', 5, '# 全局配置\nmode: global'),
    ] };
  }
  const error = validateSpacesState(value);
  if (error) throw new Error(error);
  return copySpacesState(value as SpacesState);
}

export function updateSpaceItem(state: SpacesState, item: SpaceItem): SpacesState {
  const next = { ...state, items: state.items.some(entry => entry.id === item.id) ? state.items.map(entry => entry.id === item.id ? item : entry) : [...state.items, item] };
  const error = validateSpacesState(next); if (error) throw new Error(error);
  return next;
}

export function deleteSpaceItem(state: SpacesState, id: string, now = Date.now()): SpacesState {
  const item = state.items.find(entry => entry.id === id);
  return item ? updateSpaceItem(state, { ...item, deletedAt: now }) : state;
}

export function restoreSpaceItem(state: SpacesState, id: string): SpacesState {
  const item = state.items.find(entry => entry.id === id);
  return item ? updateSpaceItem(state, { ...item, deletedAt: null }) : state;
}

export function purgeSpaceTrash(state: SpacesState, id?: string): SpacesState {
  return { ...state, items: state.items.filter(item => item.deletedAt === null || (id !== undefined && item.id !== id)) };
}

export function spaceActivityLabel(timestamp: number, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - timestamp) / day);
  if (!days) return '今天';
  if (days < 7) return `${days} 天`;
  if (days < 30) return `${Math.floor(days / 7)} 周`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}
