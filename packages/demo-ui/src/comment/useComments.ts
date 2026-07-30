"use client";

/**
 * useComments：评论数据管理 hook。
 *
 * - 通过 CommentApiAdapter 拉取评论线程（REST）。
 * - 可选连接 agent-service 的 /ws/comments WebSocket，订阅项目评论事件，
 *   收到广播后增量更新本地状态（幂等，兼容自身写入触发的回声事件）。
 * - 提供创建/回复/解决/删除等 mutation，均乐观更新 + 失败回滚。
 *
 * demo-ui 不依赖 SWR，这里用原生 React state 实现等价的 fetch + mutate 语义。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommentMention,
  CommentReply,
  CommentThread,
  CommentWsEvent,
} from "@workbench/shared";
import type { AddReplyInput, CommentApiAdapter, CreateCommentInput } from "./types";

export interface UseCommentsOptions {
  projectId: string;
  pageId: string;
  api: CommentApiAdapter;
  /** agent-service WS 地址，如 ws://localhost:4201/ws/comments */
  wsUrl?: string;
  /** 是否启用数据拉取与 WS 订阅（外部管理数据时传 false），默认 true */
  enabled?: boolean;
}

export interface UseCommentsResult {
  threads: CommentThread[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createComment: (input: CreateCommentInput) => Promise<CommentThread>;
  addReply: (threadId: string, input: AddReplyInput) => Promise<CommentReply>;
  setResolved: (threadId: string, resolved: boolean) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  deleteReply: (threadId: string, replyId: string) => Promise<void>;
}

/** 将 WS 事件幂等地应用到线程列表 */
function applyWsEvent(
  threads: CommentThread[],
  event: CommentWsEvent,
): CommentThread[] {
  switch (event.type) {
    case "comment:created": {
      if (threads.some((t) => t.id === event.thread.id)) return threads;
      return [...threads, event.thread];
    }
    case "comment:replied": {
      return threads.map((t) => {
        if (t.id !== event.threadId) return t;
        if (t.replies.some((r) => r.id === event.reply.id)) return t;
        return {
          ...t,
          replies: [...t.replies, event.reply],
          updatedAt: event.reply.createdAt,
        };
      });
    }
    case "comment:resolved": {
      return threads.map((t) =>
        t.id === event.threadId ? { ...t, resolved: event.resolved } : t,
      );
    }
    case "comment:ai-status": {
      return threads.map((t) =>
        t.id === event.threadId ? { ...t, aiTaskStatus: event.aiTaskStatus } : t,
      );
    }
    case "comment:deleted": {
      return threads.filter((t) => t.id !== event.threadId);
    }
    default:
      return threads;
  }
}

export function useComments({
  projectId,
  pageId,
  api,
  wsUrl,
  enabled = true,
}: UseCommentsOptions): UseCommentsResult {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await apiRef.current.listComments(pageId);
      setThreads(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [pageId]);

  // 首次加载 + pageId 变化时重新拉取
  useEffect(() => {
    if (!enabled) return;
    setIsLoading(true);
    void refresh();
  }, [refresh, enabled]);

  // WebSocket 订阅：实时接收评论事件
  useEffect(() => {
    if (!enabled || !wsUrl || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "subscribe", projectId }));
      };
      ws.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data) as CommentWsEvent;
          if (!data || typeof data !== "object" || !("type" in data)) return;
          if (typeof data.type !== "string" || !data.type.startsWith("comment:")) {
            return;
          }
          setThreads((current) => applyWsEvent(current, data));
        } catch {
          // 忽略无法解析的消息
        }
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [wsUrl, projectId, enabled]);

  const createComment = useCallback(
    async (input: CreateCommentInput): Promise<CommentThread> => {
      const created = await apiRef.current.createComment(input);
      setThreads((current) =>
        current.some((t) => t.id === created.id) ? current : [...current, created],
      );
      return created;
    },
    [],
  );

  const addReply = useCallback(
    async (threadId: string, input: AddReplyInput): Promise<CommentReply> => {
      const reply = await apiRef.current.addReply(threadId, input);
      setThreads((current) =>
        current.map((t) => {
          if (t.id !== threadId) return t;
          if (t.replies.some((r) => r.id === reply.id)) return t;
          return { ...t, replies: [...t.replies, reply], updatedAt: reply.createdAt };
        }),
      );
      return reply;
    },
    [],
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean): Promise<void> => {
      // 乐观更新
      const previous = threads;
      setThreads((current) =>
        current.map((t) => (t.id === threadId ? { ...t, resolved } : t)),
      );
      try {
        await apiRef.current.setResolved(threadId, resolved);
      } catch (err) {
        setThreads(previous);
        throw err;
      }
    },
    [threads],
  );

  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      const previous = threads;
      setThreads((current) => current.filter((t) => t.id !== threadId));
      try {
        await apiRef.current.deleteThread(threadId);
      } catch (err) {
        setThreads(previous);
        throw err;
      }
    },
    [threads],
  );

  const deleteReply = useCallback(
    async (threadId: string, replyId: string): Promise<void> => {
      const previous = threads;
      setThreads((current) =>
        current.map((t) =>
          t.id === threadId
            ? { ...t, replies: t.replies.filter((r) => r.id !== replyId) }
            : t,
        ),
      );
      try {
        await apiRef.current.deleteReply(threadId, replyId);
      } catch (err) {
        setThreads(previous);
        throw err;
      }
    },
    [threads],
  );

  return {
    threads,
    isLoading,
    error,
    refresh,
    createComment,
    addReply,
    setResolved,
    deleteThread,
    deleteReply,
  };
}

/** 工具：判断评论是否提及指定用户 */
export function threadMentionsUser(
  thread: CommentThread,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  const inMentions = (mentions?: CommentMention[]) =>
    !!mentions?.some((m) => m.type === "user" && m.id === userId);
  return (
    inMentions(thread.mentions) ||
    thread.replies.some((r) => inMentions(r.mentions))
  );
}
