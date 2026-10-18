export type AuthUser = { id: string; email: string; name: string; createdAt: number; lastLoginAt: number | null };
export type AuthResult<T = Record<never, never>> = ({ ok: true; warning?: string } & T) | { ok: false; error: string; code?: string };
export type DesktopAuth = {
  register(input: { email: string; password: string; name: string }): Promise<AuthResult<{ user: AuthUser }>>;
  login(input: { email: string; password: string }): Promise<AuthResult<{ user: AuthUser }>>;
  getSession(): Promise<AuthResult<{ user: AuthUser | null }>>;
  logout(): Promise<AuthResult>;
  loadWorkspace(ownerId: string): Promise<AuthResult<{ data: string | null }>>;
  saveWorkspace(ownerId: string, data: string): Promise<AuthResult>;
};
