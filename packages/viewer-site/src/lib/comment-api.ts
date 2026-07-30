/**
 * viewer-site 评论 API 客户端。
 *
 * 实现 demo-ui 的 CommentApiAdapter，封装对 author-site 评论 REST API 的调用：
 * - 已登录用户：通过 X-Auth-Token 携带 JWT，服务端解析身份。
 * - 匿名用户：在写入请求 body 中携带 anonymousId + displayName（存 localStorage）。
 *
 * 同时提供：
 * - recordProjectVisit：已登录用户打开项目时记录访问（供 @候选人列表使用）。
 * - getCommentWsUrl：评论实时通知 WebSocket 地址（agent-service /ws/comments）。
 */
import type {
  AddReplyInput,
  CommentApiAdapter,
  CreateCommentInput,
  MentionCandidate,
} from "@workbench/demo-ui";
import type { CommentReply, CommentThread, ProjectVisitor } from "@workbench/shared";
import { DATA_BASE, getAuthToken } from "./api";
import { getBrowserAgentServiceUrl } from "./runtime-config";

const ANON_ID_KEY = "viewer.comment.anonymousId";
const ANON_NAME_KEY = "viewer.comment.displayName";

/** 获取（或初始化）匿名用户 ID（UUID，存 localStorage） */
export function getAnonymousId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** 获取匿名显示名（默认"匿名用户"） */
export function getAnonymousDisplayName(): string {
  if (typeof window === "undefined") return "匿名用户";
  try {
    return window.localStorage.getItem(ANON_NAME_KEY) || "匿名用户";
  } catch {
    return "匿名用户";
  }
}

/** 设置匿名显示名 */
export function setAnonymousDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANON_NAME_KEY, name.trim() || "匿名用户");
  } catch {
    // 忽略存储失败
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message?: string };
}

async function commentRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getAuthToken();
  if (token) headers["X-Auth-Token"] = token;

  const res = await fetch(`${DATA_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: { message?: string };
  };
  if (!res.ok || body.success === false) {
    throw new Error(body.error?.message || `评论请求失败 (${res.status})`);
  }
  return body.data;
}

/**
 * 未登录时附加匿名身份字段；已登录则返回空对象（服务端从 token 解析身份）。
 */
function anonymousFields(): { anonymousId?: string; displayName?: string } {
  if (getAuthToken()) return {};
  return {
    anonymousId: getAnonymousId(),
    displayName: getAnonymousDisplayName(),
  };
}

/** 创建指定项目的评论 API 适配器 */
export function createCommentApi(projectId: string): CommentApiAdapter {
  const enc = encodeURIComponent(projectId);
  const base = `/api/projects/${enc}/comments`;

  return {
    async listComments(pageId?: string): Promise<CommentThread[]> {
      const qs = pageId ? `?pageId=${encodeURIComponent(pageId)}` : "";
      const data = await commentRequest<{ threads: CommentThread[] }>(`${base}${qs}`);
      return data.threads;
    },

    async createComment(input: CreateCommentInput): Promise<CommentThread> {
      const data = await commentRequest<{ thread: CommentThread }>(base, {
        method: "POST",
        body: JSON.stringify({ ...input, ...anonymousFields() }),
      });
      return data.thread;
    },

    async addReply(threadId: string, input: AddReplyInput): Promise<CommentReply> {
      const data = await commentRequest<{ reply: CommentReply }>(
        `${base}/${encodeURIComponent(threadId)}/replies`,
        {
          method: "POST",
          body: JSON.stringify({ ...input, ...anonymousFields() }),
        },
      );
      return data.reply;
    },

    async setResolved(threadId: string, resolved: boolean): Promise<void> {
      await commentRequest<{ thread: CommentThread }>(
        `${base}/${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ resolved, ...anonymousFields() }),
        },
      );
    },

    async deleteThread(threadId: string): Promise<void> {
      await commentRequest<{ deleted: boolean }>(
        `${base}/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ ...anonymousFields() }),
        },
      );
    },

    async deleteReply(threadId: string, replyId: string): Promise<void> {
      await commentRequest<{ deleted: boolean }>(
        `${base}/${encodeURIComponent(threadId)}/replies/${encodeURIComponent(replyId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ ...anonymousFields() }),
        },
      );
    },

    async listMentionCandidates(): Promise<MentionCandidate[]> {
      const data = await commentRequest<{ visitors: ProjectVisitor[] }>(
        `/api/projects/${enc}/visitors`,
      );
      return data.visitors.map((v) => ({
        id: v.userId,
        name: v.name,
        type: "user" as const,
      }));
    },
  };
}

/**
 * 记录已登录用户访问项目（更新 visitors.json）。
 * 未登录时静默跳过。失败不抛出（不影响主流程）。
 */
export async function recordProjectVisit(projectId: string): Promise<void> {
  if (!getAuthToken()) return;
  try {
    await commentRequest<{ visitor: ProjectVisitor }>(
      `/api/projects/${encodeURIComponent(projectId)}/visit`,
      { method: "POST", body: "{}" },
    );
  } catch {
    // 访问记录失败不影响浏览
  }
}

/** 评论实时通知 WebSocket 地址（agent-service /ws/comments） */
export function getCommentWsUrl(): string | undefined {
  const httpBase = getBrowserAgentServiceUrl();
  if (!httpBase) return undefined;
  return `${httpBase.replace(/^http/, "ws")}/ws/comments`;
}
