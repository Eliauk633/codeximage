import type { AppState, Message } from './model';

export function beginChatReply(state: AppState, threadId: string, requestId: string, displayModel: string, retryId?: string): AppState {
  const thread = state.threads.find(t => t.id === threadId && !t.archived);
  if (!thread) throw new Error('聊天已关闭，请重新选择聊天。');
  let messages = thread.messages;
  if (retryId) {
    const last = messages.at(-1);
    if (last?.id !== retryId || last.role !== 'assistant' || !['stopped', 'error'].includes(last.status ?? '')) throw new Error('只能重试最后一条未完成的回复。');
    messages = messages.slice(0, -1);
  }
  const last = messages.at(-1);
  if (last?.role !== 'user') throw new Error('请先输入消息。');
  const reply: Message = { id: requestId, role: 'assistant', content: '', createdAt: Date.now(), status: 'pending', replyTo: last.id, displayModel };
  return { ...state, threads: state.threads.map(t => t.id === threadId ? { ...t, messages: [...messages, reply], updatedAt: reply.createdAt } : t) };
}

export function finishChatReply(state: AppState, threadId: string, requestId: string, content: string, status: 'complete' | 'stopped' | 'error', error?: string): AppState {
  const target = state.threads.find(t => t.id === threadId)?.messages.find(m => m.id === requestId && m.status === 'pending');
  if (!target) return state;
  return { ...state, threads: state.threads.map(t => t.id === threadId ? { ...t, messages: t.messages.map(m => m.id === requestId ? { ...m, content, status, durationMs: Math.max(0, Date.now() - m.createdAt), ...(error ? { error } : {}) } : m) } : t) };
}

// Keep complete recent turns, never a cut-off answer or an error as conversation history.
export const CONTEXT_CHAR_LIMIT = 32000;

export function chatContext(messages: Message[], maxChars = CONTEXT_CHAR_LIMIT): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[][] = [];
  for (const message of messages) {
    if (!message.content.trim() || message.status && message.status !== 'complete') continue;
    if (message.role === 'user') turns.push([{ role: 'user', content: message.content }]);
    else if (turns.length) turns.at(-1)!.push({ role: 'assistant', content: message.content });
  }
  const result: { role: 'user' | 'assistant'; content: string }[] = [];
  let size = 0;
  for (const turn of turns.reverse()) {
    const length = turn.reduce((sum, m) => sum + m.content.length, 0);
    if (size + length > maxChars || result.length + turn.length > 40) {
      if (!result.length) throw new Error('这条消息过长，请缩短后发送。');
      break;
    }
    result.unshift(...turn); size += length;
  }
  return result;
}

/** Same retained history as the sender; this is a character budget, not provider tokens. */
export function contextUsage(messages: Message[]) {
  try {
    const retained = chatContext(messages);
    const used = retained.reduce((sum, message) => sum + message.content.length, 0);
    return { used, limit: CONTEXT_CHAR_LIMIT, percent: used / CONTEXT_CHAR_LIMIT * 100, exceeded: false };
  } catch {
    return { used: null, limit: CONTEXT_CHAR_LIMIT, percent: 100, exceeded: true };
  }
}
