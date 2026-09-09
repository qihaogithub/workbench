"use client";

/**
 * author-site 评论 API 客户端适配器（创作端）。
 *
 * 与 author-site 评论 REST API 同源，身份通过 cookie（auth_token）自动携带，
 * 服务端从 JWT 解析作者身份，因此客户端无需附加 anonymousId。
 *
 * 创作端特性：
 * - canMentionAgent = true（可 @AI，评论即异步任务）。
 * - @候选人 = 项目访问者（visitors.json）+ AI 助手。
 */
import type {
  AddReplyInput,
  CommentApiAdapter,
  CreateCommentInput,
  MentionCandidate,
  UpdateCommentContentInput,
} from "@workbench/demo-ui/comment";
import type { CommentReply, CommentThread, CommentTarget, ProjectVisitor } from "@workbench/shared";

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
  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
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

async function uploadCommentImage(path: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(path, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<{ url: string; imageId: string; filename?: string; kind: "image" }>;
  if (!res.ok || body.success === false || !body.data?.url) {
    throw new Error(body.error?.message || `图片上传失败 (${res.status})`);
  }
  return body.data;
}

/** 创建指定项目的评论 API 适配器（创作端，cookie 鉴权） */
export function createAuthorCommentApi(projectId: string): CommentApiAdapter {
  const enc = encodeURIComponent(projectId);
  const base = `/api/projects/${enc}/comments`;

  return {
    async listComments(target?: CommentTarget): Promise<CommentThread[]> {
      const qs = target?.kind === "page"
        ? `?pageId=${encodeURIComponent(target.pageId)}`
        : target?.kind === "document"
          ? `?resourceId=${encodeURIComponent(target.resourceId)}`
          : target?.kind === "config"
            ? `?configScope=${encodeURIComponent(target.scope)}${target.pageId ? `&pageId=${encodeURIComponent(target.pageId)}` : ""}&fieldKey=${encodeURIComponent(target.fieldKey)}`
          : "";
      const data = await commentRequest<{ threads: CommentThread[] }>(`${base}${qs}`);
      return data.threads;
    },

    async createComment(input: CreateCommentInput): Promise<CommentThread> {
      const data = await commentRequest<{ thread: CommentThread }>(base, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return data.thread;
    },

    async addReply(threadId: string, input: AddReplyInput): Promise<CommentReply> {
      const data = await commentRequest<{ reply: CommentReply }>(
        `${base}/${encodeURIComponent(threadId)}/replies`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return data.reply;
    },

    async updateComment(threadId: string, input: UpdateCommentContentInput): Promise<CommentThread> {
      const data = await commentRequest<{ thread: CommentThread }>(`${base}/${encodeURIComponent(threadId)}`, {
        method: "PATCH", body: JSON.stringify(input),
      });
      return data.thread;
    },

    async updateReply(threadId: string, replyId: string, input: UpdateCommentContentInput): Promise<CommentReply> {
      const data = await commentRequest<{ reply: CommentReply }>(`${base}/${encodeURIComponent(threadId)}/replies/${encodeURIComponent(replyId)}`, {
        method: "PATCH", body: JSON.stringify(input),
      });
      return data.reply;
    },

    async setResolved(threadId: string, resolved: boolean): Promise<void> {
      await commentRequest<{ thread: CommentThread }>(
        `${base}/${encodeURIComponent(threadId)}`,
        { method: "PATCH", body: JSON.stringify({ resolved }) },
      );
    },

    async deleteThread(threadId: string): Promise<void> {
      await commentRequest<{ deleted: boolean }>(
        `${base}/${encodeURIComponent(threadId)}`,
        { method: "DELETE" },
      );
    },

    async deleteReply(threadId: string, replyId: string): Promise<void> {
      await commentRequest<{ deleted: boolean }>(
        `${base}/${encodeURIComponent(threadId)}/replies/${encodeURIComponent(replyId)}`,
        { method: "DELETE" },
      );
    },

    async uploadCommentImage(file: File) {
      return uploadCommentImage(`${base}/assets`, file);
    },

    async retryAiTask(threadId: string): Promise<void> {
      await commentRequest<{ thread: CommentThread }>(
        `${base}/${encodeURIComponent(threadId)}/retry-ai`,
        { method: "POST", body: JSON.stringify({}) },
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
