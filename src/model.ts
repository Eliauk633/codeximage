export type WorkMode = 'codex' | 'chatgpt';
export type ChatGptMode = 'chat' | 'work';
export type ThreadKind = 'codex' | ChatGptMode | 'companion';
export const projectIcons = ['folder', 'code', 'terminal', 'globe', 'briefcase', 'book', 'sparkles', 'layers'] as const;
export const projectColors = ['gray', 'red', 'orange', 'green', 'blue', 'purple', 'pink'] as const;
export type ProjectIcon = typeof projectIcons[number];
export type ProjectColor = typeof projectColors[number];
export type ProjectSection = { id: string; name: string };
export type Project = {
  id: string;
  name: string;
  path: string;
  sources?: string[];
  pinned?: boolean;
  sectionId?: string;
  icon?: ProjectIcon;
  emoji?: string;
  color?: ProjectColor;
};
export type Message = {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: number;
  status?: 'pending' | 'complete' | 'stopped' | 'error';
  durationMs?: number; replyTo?: string; displayModel?: string; error?: string;
};
export type Thread = {
  id: string;
  kind?: ThreadKind;
  title: string;
  projectId: string | null;
  pinned: boolean;
  archived: boolean;
  updatedAt: number;
  messages: Message[];
};
export type AppState = {
  schema: 1;
  workMode: WorkMode;
  chatGptMode: ChatGptMode;
  projects: Project[];
  projectSections: ProjectSection[];
  threads: Thread[];
  activeThreadId: string | null;
  theme: 'system' | 'light' | 'dark';
  sidebarWidth: number;
  sidebarVisible: boolean;
  panel: 'none' | 'files' | 'diff' | 'terminal' | 'browser';
  panelWidth: number;
  fontSize: number;
};

export function createInitialState(): AppState {
  return {
    schema: 1,
    workMode: 'codex',
    chatGptMode: 'work',
    projectSections: [],
    projects: [
      { id: 'desktop-studio', name: 'desktop-studio', path: '~/Projects/desktop-studio' },
      { id: 'starter-app', name: 'starter-app', path: '~/Projects/starter-app' },
    ],
    threads: [
      { id: 'layout-draft', title: '界面布局草稿', projectId: 'desktop-studio', pinned: true, archived: false, updatedAt: 1, messages: [] },
      { id: 'starter-notes', title: '入门项目笔记', projectId: 'starter-app', pinned: false, archived: false, updatedAt: 1, messages: [] },
    ],
    activeThreadId: null,
    theme: 'system',
    sidebarWidth: 288,
    sidebarVisible: true,
    panel: 'none',
    panelWidth: 420,
    fontSize: 14,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeProjectSources(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isText).map(path => path.trim()))] : [];
}

const emojiSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const completeEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v');

export function normalizeProjectEmoji(value: unknown): string | undefined {
  if (!isText(value)) return undefined;
  const trimmed = value.trim();
  const segments = emojiSegments.segment(trimmed)[Symbol.iterator]();
  const first = segments.next();
  return first.value && segments.next().done && completeEmoji.test(first.value.segment) ? trimmed : undefined;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function availableThread(threads: Thread[], preferred: string | null): string | null {
  if (preferred === null) return null;
  return threads.find(thread => thread.id === preferred && !thread.archived)?.id
    ?? threads.find(thread => !thread.archived)?.id
    ?? null;
}

export function restoreState(raw: string | null): AppState {
  const initial = createInitialState();
  if (!raw) return initial;
  let saved: unknown;
  try { saved = JSON.parse(raw); } catch { return initial; }
  if (!isRecord(saved) || saved.schema !== 1 || !Array.isArray(saved.projects) || !Array.isArray(saved.threads)) return initial;

  const projectSections = uniqueById((Array.isArray(saved.projectSections) ? saved.projectSections : []).flatMap((value: unknown): ProjectSection[] => {
    if (!isRecord(value) || !isText(value.id) || !isText(value.name)) return [];
    return [{ id: value.id, name: value.name.trim().slice(0, 120) }];
  }));
  const sectionIds = new Set(projectSections.map(section => section.id));
  const projects = uniqueById(saved.projects.flatMap((value: unknown): Project[] => {
    if (!isRecord(value) || !isText(value.id) || !isText(value.name) || typeof value.path !== 'string') return [];
    const sources = normalizeProjectSources(value.sources);
    const emoji = normalizeProjectEmoji(value.emoji);
    return [{
      id: value.id, name: value.name, path: sources[0] ?? value.path,
      ...(sources.length ? { sources } : {}),
      ...(typeof value.pinned === 'boolean' ? { pinned: value.pinned } : {}),
      ...(typeof value.sectionId === 'string' && sectionIds.has(value.sectionId) ? { sectionId: value.sectionId } : {}),
      ...(emoji ? { emoji } : projectIcons.includes(value.icon as ProjectIcon) ? { icon: value.icon as ProjectIcon } : {}),
      ...(projectColors.includes(value.color as ProjectColor) ? { color: value.color as ProjectColor } : {}),
    }];
  }));
  const projectIds = new Set(projects.map(project => project.id));
  const threads = uniqueById(saved.threads.flatMap((value: unknown): Thread[] => {
    if (!isRecord(value) || !isText(value.id) || !isText(value.title) || !Array.isArray(value.messages)) return [];
    const messages = uniqueById(value.messages.flatMap((message: unknown): Message[] => {
      if (!isRecord(message) || !isText(message.id) || typeof message.content !== 'string'
        || (message.role !== 'user' && message.role !== 'assistant')) return [];
      return [{ id: message.id, role: message.role, content: message.content,
        createdAt: boundedNumber(message.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
        ...(message.role === 'assistant' ? {
          ...(['pending', 'complete', 'stopped', 'error'].includes(String(message.status)) ? { status: message.status === 'pending' ? 'stopped' as const : message.status as Message['status'] } : {}),
          ...(typeof message.durationMs === 'number' && Number.isFinite(message.durationMs) && message.durationMs >= 0 ? { durationMs: message.durationMs } : {}),
          ...(isText(message.replyTo) ? { replyTo: message.replyTo.slice(0, 100) } : {}),
          ...(isText(message.displayModel) ? { displayModel: message.displayModel.slice(0, 100) } : {}),
          ...(isText(message.error) ? { error: message.error.slice(0, 200) } : {}),
        } : {}),
      }];
    }));
    return [{
      id: value.id,
      ...(value.kind === 'codex' || value.kind === 'chat' || value.kind === 'work' || value.kind === 'companion' ? { kind: value.kind } : {}),
      title: value.title,
      projectId: typeof value.projectId === 'string' && projectIds.has(value.projectId) ? value.projectId : null,
      pinned: value.pinned === true,
      archived: value.archived === true,
      updatedAt: boundedNumber(value.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      messages,
    }];
  }));

  return {
    schema: 1,
    workMode: saved.workMode === 'chatgpt' ? 'chatgpt' : 'codex',
    chatGptMode: saved.chatGptMode === 'chat' ? 'chat' : 'work',
    projects,
    projectSections,
    threads,
    activeThreadId: availableThread(threads, saved.activeThreadId === null ? null : typeof saved.activeThreadId === 'string' ? saved.activeThreadId : ''),
    theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : 'system',
    sidebarWidth: boundedNumber(saved.sidebarWidth, 240, 520, initial.sidebarWidth),
    sidebarVisible: typeof saved.sidebarVisible === 'boolean' ? saved.sidebarVisible : initial.sidebarVisible,
    panel: saved.panel === 'files' || saved.panel === 'diff' || saved.panel === 'terminal' || saved.panel === 'browser' ? saved.panel : 'none',
    panelWidth: boundedNumber(saved.panelWidth, 280, 720, initial.panelWidth),
    fontSize: boundedNumber(saved.fontSize, 12, 20, initial.fontSize),
  };
}

export function clampSidebarWidth(value: number, windowWidth: number): number {
  const max = Number.isFinite(windowWidth) ? Math.max(240, Math.min(520, windowWidth - 480)) : 520;
  return boundedNumber(value, 240, max, Math.min(288, max));
}

export function addThread(state: AppState, title = '新对话', projectId: string | null = null, kind: ThreadKind = 'codex'): AppState {
  const thread: Thread = {
    id: crypto.randomUUID(),
    kind,
    title: title.trim() || '新对话',
    projectId: state.projects.some(project => project.id === projectId) ? projectId : null,
    pinned: false,
    archived: false,
    updatedAt: Date.now(),
    messages: [],
  };
  return { ...state, threads: [thread, ...state.threads], activeThreadId: thread.id };
}

export function updateThread(state: AppState, id: string, patch: Partial<Pick<Thread, 'title' | 'pinned' | 'archived' | 'projectId'>>): AppState {
  if (!state.threads.some(thread => thread.id === id)) return state;
  const threads = state.threads.map(thread => thread.id === id ? {
    ...thread,
    title: patch.title?.trim() || thread.title,
    pinned: patch.pinned ?? thread.pinned,
    archived: patch.archived ?? thread.archived,
    projectId: patch.projectId === undefined ? thread.projectId
      : state.projects.some(project => project.id === patch.projectId) ? patch.projectId : null,
    updatedAt: Date.now(),
  } : thread);
  return { ...state, threads, activeThreadId: availableThread(threads, state.activeThreadId) };
}

export function deleteThread(state: AppState, id: string): AppState {
  const threads = state.threads.filter(thread => thread.id !== id);
  if (threads.length === state.threads.length) return state;
  return { ...state, threads, activeThreadId: availableThread(threads, state.activeThreadId) };
}

export function appendUserMessage(state: AppState, threadId: string, content: string): AppState {
  const trimmed = content.trim();
  if (!trimmed || !state.threads.some(thread => thread.id === threadId)) return state;
  const now = Date.now();
  const message: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: now };
  return { ...state, threads: state.threads.map(thread => thread.id === threadId
    ? { ...thread, updatedAt: now, messages: [...thread.messages, message] }
    : thread) };
}
