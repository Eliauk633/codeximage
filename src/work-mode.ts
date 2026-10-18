import type { AppState, ChatGptMode, Thread, ThreadKind, WorkMode } from './model.ts';

export function threadKindForMode(state: Pick<AppState, 'workMode' | 'chatGptMode'>): ThreadKind {
  return state.workMode === 'codex' ? 'codex' : state.chatGptMode;
}

export function threadsForMode(threads: Thread[], workMode: WorkMode): Thread[] {
  return threads.filter(thread => !thread.archived && thread.kind !== 'companion' && (workMode === 'chatgpt' || (thread.kind ?? 'codex') === 'codex'));
}

export function recentThreads(threads: Thread[], filter: 'all' | 'chat' | 'work', includeProjects = false): Thread[] {
  return threads.filter(thread => !thread.archived && thread.kind !== 'companion' && !thread.pinned && (includeProjects || !thread.projectId)
    && (filter === 'all' || (filter === 'chat' ? thread.kind === 'chat' : (thread.kind ?? 'codex') !== 'chat')))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function switchChatGptSubmode(state: AppState, chatGptMode: ChatGptMode): AppState {
  const active = state.threads.find(thread => thread.id === state.activeThreadId);
  const updateKind = active !== undefined && active.messages.length === 0
    && (active.kind === 'chat' || active.kind === 'work') && active.kind !== chatGptMode;
  if (state.chatGptMode === chatGptMode && !updateKind) return state;
  return { ...state, chatGptMode, threads: updateKind
    ? state.threads.map(thread => thread.id === active.id ? { ...thread, kind: chatGptMode } : thread)
    : state.threads };
}
