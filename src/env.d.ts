import type { DesktopAuth } from './auth';
import type { DesktopAI } from './ai';
export {};

declare global {
  interface Window {
    desktop?: {
      platform: string;
      auth: DesktopAuth;
      ai: DesktopAI;
      onAction(callback: (action: string) => void): () => void;
      pickProject(): Promise<{ name: string; path: string } | null>;
      copyText(text: string): Promise<void>;
      minimize(): void;
      maximize(): void;
      close(): void;
    };
  }
}
