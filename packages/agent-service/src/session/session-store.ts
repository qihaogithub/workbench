import { AgentConfig, AgentStatus } from '../core/types';
import type { WorkspaceMeta } from '@opencode-workbench/shared';

export interface SessionMeta {
  sessionId: string;
  demoId?: string;
  backend: string;
  workingDir: string;
  customWorkspace: boolean;
  workspaceType: 'user' | 'temp';
  snapshotMode: 'git-repo' | 'snapshot' | null;
  snapshotBranch: string | null;
  status: AgentStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  opencodeSessionId?: string;
}

export interface CreateSessionOptions extends AgentConfig {
  workspaceMeta?: WorkspaceMeta;
}

export interface ISessionStore {
  create(sessionId: string, config: CreateSessionOptions): SessionMeta;
  get(sessionId: string): SessionMeta | undefined;
  update(sessionId: string, updates: Partial<SessionMeta>): void;
  delete(sessionId: string): void;
  list(filter?: SessionFilter): SessionMeta[];
}

export interface SessionFilter {
  status?: AgentStatus;
  demoId?: string;
  backend?: string;
}

export class MemorySessionStore implements ISessionStore {
  private sessions: Map<string, SessionMeta> = new Map();

  create(sessionId: string, config: CreateSessionOptions): SessionMeta {
    const workspaceMeta = config.workspaceMeta;
    
    const meta: SessionMeta = {
      sessionId,
      demoId: config.demoId,
      backend: config.backend || 'opencode-http',
      workingDir: workspaceMeta?.workingDir || config.workingDir || '',
      customWorkspace: workspaceMeta?.customWorkspace ?? false,
      workspaceType: workspaceMeta?.workspaceType || 'temp',
      snapshotMode: workspaceMeta?.snapshotMode ?? null,
      snapshotBranch: workspaceMeta?.snapshotBranch ?? null,
      status: 'initializing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };
    this.sessions.set(sessionId, meta);
    return meta;
  }

  get(sessionId: string): SessionMeta | undefined {
    return this.sessions.get(sessionId);
  }

  update(sessionId: string, updates: Partial<SessionMeta>): void {
    const meta = this.sessions.get(sessionId);
    if (meta) {
      this.sessions.set(sessionId, {
        ...meta,
        ...updates,
        updatedAt: Date.now(),
      });
    }
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  list(filter?: SessionFilter): SessionMeta[] {
    let result = Array.from(this.sessions.values());

    if (filter) {
      if (filter.status) {
        result = result.filter((s) => s.status === filter.status);
      }
      if (filter.demoId) {
        result = result.filter((s) => s.demoId === filter.demoId);
      }
      if (filter.backend) {
        result = result.filter((s) => s.backend === filter.backend);
      }
    }

    return result;
  }
}
