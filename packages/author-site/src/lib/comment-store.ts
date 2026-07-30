/**
 * 评论存储层
 *
 * 读写 data/projects/<projectId>/comments.json，
 * 写入后调用 agent-service 内部通知接口触发 WS 广播。
 */
import fs from "fs";
import path from "path";
import type {
  CommentThread,
  CommentReply,
  CommentStoreData,
  CommentAiTaskStatus,
  CommentWsEvent,
} from "@workbench/shared";
import { getProjectPath } from "./paths";
import { getServerAgentServiceUrl, getInternalApiToken } from "./runtime-config";

const COMMENTS_FILENAME = "comments.json";

function getCommentsPath(projectId: string): string {
  return path.join(getProjectPath(projectId), COMMENTS_FILENAME);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readCommentStore(projectId: string): CommentStoreData {
  const filePath = getCommentsPath(projectId);
  if (!fs.existsSync(filePath)) {
    return { threads: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as CommentStoreData;
    if (!Array.isArray(data.threads)) {
      return { threads: [] };
    }
    return data;
  } catch {
    return { threads: [] };
  }
}

function writeCommentStore(projectId: string, data: CommentStoreData): void {
  const filePath = getCommentsPath(projectId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 通知 agent-service 广播 WS 事件（尽力而为，失败不阻塞写入）
 */
async function notifyWsEvent(
  projectId: string,
  event: CommentWsEvent,
): Promise<void> {
  const token = getInternalApiToken();
  try {
    await fetch(`${getServerAgentServiceUrl()}/internal/comments/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Internal-Token": token } : {}),
      },
      body: JSON.stringify({ projectId, event }),
    });
  } catch {
    // 通知失败不影响主流程
  }
}

export interface ListCommentsOptions {
  pageId?: string;
  resolved?: boolean;
}

export function listComments(
  projectId: string,
  options: ListCommentsOptions = {},
): CommentThread[] {
  const { threads } = readCommentStore(projectId);
  let result = threads;
  if (options.pageId) {
    result = result.filter((t) => t.pageId === options.pageId);
  }
  if (options.resolved !== undefined) {
    result = result.filter((t) => t.resolved === options.resolved);
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function getCommentThread(
  projectId: string,
  threadId: string,
): CommentThread | null {
  const { threads } = readCommentStore(projectId);
  return threads.find((t) => t.id === threadId) ?? null;
}

export interface CreateCommentInput {
  projectId: string;
  pageId: string;
  anchor: CommentThread["anchor"];
  pin: CommentThread["pin"];
  content: string;
  author: CommentThread["author"];
  mentions?: CommentThread["mentions"];
}

export async function createCommentThread(
  input: CreateCommentInput,
): Promise<CommentThread> {
  const data = readCommentStore(input.projectId);
  const now = Date.now();
  const hasAgentMention = input.mentions?.some((m) => m.type === "agent");

  const thread: CommentThread = {
    id: generateId("cmt"),
    projectId: input.projectId,
    pageId: input.pageId,
    anchor: input.anchor,
    pin: input.pin,
    content: input.content,
    author: input.author,
    mentions: input.mentions,
    aiTaskStatus: hasAgentMention ? "pending" : undefined,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    replies: [],
  };

  data.threads.push(thread);
  writeCommentStore(input.projectId, data);
  await notifyWsEvent(input.projectId, {
    type: "comment:created",
    thread,
  });

  // @AI 提及 → 通知 agent-service 入队
  if (hasAgentMention) {
    await enqueueAiTask(input.projectId, thread.id);
  }

  return thread;
}

export interface UpdateCommentInput {
  resolved?: boolean;
  content?: string;
  aiTaskStatus?: CommentAiTaskStatus;
}

export async function updateCommentThread(
  projectId: string,
  threadId: string,
  updates: UpdateCommentInput,
): Promise<CommentThread | null> {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return null;

  if (updates.resolved !== undefined) {
    thread.resolved = updates.resolved;
  }
  if (updates.content !== undefined) {
    thread.content = updates.content;
  }
  if (updates.aiTaskStatus !== undefined) {
    thread.aiTaskStatus = updates.aiTaskStatus;
  }
  thread.updatedAt = Date.now();

  writeCommentStore(projectId, data);

  if (updates.resolved !== undefined) {
    await notifyWsEvent(projectId, {
      type: "comment:resolved",
      threadId,
      resolved: thread.resolved,
    });
  }
  if (updates.aiTaskStatus !== undefined) {
    await notifyWsEvent(projectId, {
      type: "comment:ai-status",
      threadId,
      aiTaskStatus: updates.aiTaskStatus,
    });
  }

  return thread;
}

export async function deleteCommentThread(
  projectId: string,
  threadId: string,
): Promise<boolean> {
  const data = readCommentStore(projectId);
  const index = data.threads.findIndex((t) => t.id === threadId);
  if (index === -1) return false;

  data.threads.splice(index, 1);
  writeCommentStore(projectId, data);
  await notifyWsEvent(projectId, { type: "comment:deleted", threadId });
  return true;
}

export interface CreateReplyInput {
  projectId: string;
  threadId: string;
  content: string;
  author: CommentReply["author"];
  mentions?: CommentReply["mentions"];
}

export async function createReply(
  input: CreateReplyInput,
): Promise<{ thread: CommentThread; reply: CommentReply } | null> {
  const data = readCommentStore(input.projectId);
  const thread = data.threads.find((t) => t.id === input.threadId);
  if (!thread) return null;

  const reply: CommentReply = {
    id: generateId("rep"),
    content: input.content,
    author: input.author,
    mentions: input.mentions,
    createdAt: Date.now(),
  };

  thread.replies.push(reply);
  thread.updatedAt = Date.now();
  writeCommentStore(input.projectId, data);
  await notifyWsEvent(input.projectId, {
    type: "comment:replied",
    threadId: thread.id,
    reply,
  });

  return { thread, reply };
}

export async function deleteReply(
  projectId: string,
  threadId: string,
  replyId: string,
): Promise<boolean> {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return false;

  const index = thread.replies.findIndex((r) => r.id === replyId);
  if (index === -1) return false;

  thread.replies.splice(index, 1);
  thread.updatedAt = Date.now();
  writeCommentStore(projectId, data);
  return true;
}

/**
 * 获取所有待 AI 处理的评论（aiTaskStatus = "pending"）
 */
export function getPendingAiComments(projectId: string): CommentThread[] {
  const { threads } = readCommentStore(projectId);
  return threads
    .filter((t) => t.aiTaskStatus === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 通知 agent-service 有新 @AI 任务入队
 */
async function enqueueAiTask(
  projectId: string,
  threadId: string,
): Promise<void> {
  const token = getInternalApiToken();
  try {
    await fetch(`${getServerAgentServiceUrl()}/internal/comments/ai-task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Internal-Token": token } : {}),
      },
      body: JSON.stringify({ projectId, threadId }),
    });
  } catch {
    // agent-service 不可用时不阻塞评论创建
  }
}
