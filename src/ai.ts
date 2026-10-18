export type AIMessage = { role: 'user' | 'assistant'; content: string };
export type AIResult = { ok: true } | { ok: false; error: string; code?: string };
export type AIStatus = { ok: true; configured: boolean; url: string } | { ok: false; error: string; code?: string };
export type AIStartInput = { ownerId: string; requestId: string; threadId: string; displayModel: string; messages: AIMessage[] };
export type AIEvent = {
  ownerId: string;
  requestId: string;
  threadId: string;
  type: 'delta' | 'done' | 'error' | 'cancelled';
  text?: string;
  error?: string;
  code?: string;
};
export type DesktopAI = {
  status(): Promise<AIStatus>;
  start(input: AIStartInput): Promise<AIResult>;
  cancel(input: Pick<AIStartInput, 'ownerId' | 'requestId'>): Promise<AIResult>;
  onEvent(callback: (event: AIEvent) => void): () => void;
};
