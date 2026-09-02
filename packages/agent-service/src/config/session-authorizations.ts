import type { AgentAuthorAuthorization, AuthorRole } from "../core/types";

/** Server-only authoring authorization, populated through /internal. */
class SessionAuthorizations {
  private readonly entries = new Map<string, AgentAuthorAuthorization>();

  set(sessionId: string, value: AgentAuthorAuthorization): void {
    this.entries.set(sessionId, value);
  }

  get(sessionId: string, projectId?: string): AgentAuthorAuthorization | null {
    const value = this.entries.get(sessionId);
    if (!value || value.expiresAt <= Date.now()) return null;
    if (projectId && value.projectId !== projectId) return null;
    return value;
  }

  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}

let store: SessionAuthorizations | null = null;
export function getSessionAuthorizations(): SessionAuthorizations {
  store ??= new SessionAuthorizations();
  return store;
}

export function parseAuthorRole(value: unknown): AuthorRole | null {
  return value === "admin" || value === "editor" ? value : null;
}
