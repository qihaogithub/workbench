import { AgentConfig, AgentStatus } from '../core/types';
import type { WorkspaceMeta } from '@opencode-workbench/shared';
import { logger } from '../utils/logger';

/** 会话过期时间，与 author-site SESSION_EXPIRY_MS 对齐 */
const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

/** 过期清理检查间隔 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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

  /** 清理过期的会话元数据 */
  cleanupExpired(): string[] {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, meta] of this.sessions) {
      if (now - meta.updatedAt > SESSION_EXPIRY_MS) {
        expiredIds.push(id);
        this.sessions.delete(id);
      }
    }

    if (expiredIds.length > 0) {
      logger.info(
        { count: expiredIds.length, ids: expiredIds },
        'Cleaned up expired session metadata',
      );
    }

    return expiredIds;
  }
}

// ============================================================
// 全局单例：SessionStoreService
// ============================================================

let instance: MemorySessionStore | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 获取全局 SessionStore 单例。
 * 首次调用时自动启动过期清理定时器。
 */
export function getSessionStore(): MemorySessionStore {
  if (!instance) {
    instance = new MemorySessionStore();
    cleanupTimer = setInterval(() => {
      instance!.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);
  }
  return instance;
}

/**
 * 销毁全局 SessionStore 单例，停止清理定时器。
 * 仅在服务关闭时调用。
 */
export function destroySessionStore(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (instance) {
    instance = null;
  }
}
