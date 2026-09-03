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
  CommentAiTaskAuthorization,
  CommentMention,
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
  resourceId?: string;
  configScope?: "project" | "page";
  fieldKey?: string;
  resolved?: boolean;
}

export function listComments(
  projectId: string,
  options: ListCommentsOptions = {},
): CommentThread[] {
  const { threads } = readCommentStore(projectId);
  let result = threads;
  if (options.configScope) {
    result = result.filter((t) =>
      t.target.kind === "config" &&
      t.target.scope === options.configScope &&
      (options.configScope === "page" || !t.target.pageId),
    );
    if (options.configScope === "page" && options.pageId) {
      result = result.filter((t) => t.target.kind === "config" && t.target.pageId === options.pageId);
    }
    if (options.fieldKey) {
      result = result.filter((t) => t.target.kind === "config" && t.target.fieldKey === options.fieldKey);
    }
  } else if (options.pageId) {
    result = result.filter((t) => t.target.kind === "page" && t.target.pageId === options.pageId);
  }
  if (options.resourceId) {
    result = result.filter((t) => t.target.kind === "document" && t.target.resourceId === options.resourceId);
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

/** Project the durable proposal outcome back to its originating comment task.
 * This does not grant write authority; it is purely a user-visible task state. */
export async function setDocumentProposalTaskStatus(
  projectId: string,
  proposalId: string,
  status: Extract<CommentAiTaskStatus, "awaiting_approval" | "done" | "failed">,
): Promise<void> {
  const data = readCommentStore(projectId);
  const affected = data.threads.filter((thread) => thread.documentProposalId === proposalId);
  if (!affected.length) return;
  const now = Date.now();
  for (const thread of affected) {
    thread.aiTaskStatus = status;
    thread.updatedAt = now;
  }
  writeCommentStore(projectId, data);
  await Promise.all(affected.map((thread) => notifyWsEvent(projectId, {
    type: "comment:ai-status", threadId: thread.id, aiTaskStatus: status,
  })));
}

export interface CreateCommentInput {
  projectId: string;
  target: CommentThread["target"];
  anchor?: CommentThread["anchor"];
  pin?: CommentThread["pin"];
  documentAnchor?: CommentThread["documentAnchor"];
  content: string;
  author: CommentThread["author"];
  mentions?: CommentThread["mentions"];
  aiTaskAuthorization?: CommentAiTaskAuthorization;
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
    target: input.target,
    anchor: input.anchor,
    pin: input.pin,
    documentAnchor: input.documentAnchor,
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
  if (hasAgentMention && input.aiTaskAuthorization) {
    data.aiTaskAuthorizations ??= {};
    data.aiTaskAuthorizations[thread.id] = input.aiTaskAuthorization;
  }
  writeCommentStore(input.projectId, data);
  await notifyWsEvent(input.projectId, {
    type: "comment:created",
    thread,
  });

  // @AI 提及 → 通知 agent-service 入队
  if (hasAgentMention) {
    await enqueueAiTask(input.projectId, thread.id, input.aiTaskAuthorization);
  }

  return thread;
}

export interface UpdateCommentInput {
  resolved?: boolean;
  content?: string;
  mentions?: CommentMention[];
  aiTaskStatus?: CommentAiTaskStatus;
  aiTaskAuthorization?: CommentAiTaskAuthorization;
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
  const hadAgentMention = thread.mentions?.some((mention) => mention.type === "agent") ?? false;
  if (updates.mentions !== undefined) {
    thread.mentions = updates.mentions;
  }
  if (updates.aiTaskStatus !== undefined) {
    thread.aiTaskStatus = updates.aiTaskStatus;
  }
  const hasAgentMention = thread.mentions?.some((mention) => mention.type === "agent") ?? false;
  const shouldEnqueueAgent = updates.mentions !== undefined && hasAgentMention && !hadAgentMention;
  if (shouldEnqueueAgent) {
    thread.aiTaskStatus = "pending";
    if (updates.aiTaskAuthorization) {
      data.aiTaskAuthorizations ??= {};
      data.aiTaskAuthorizations[threadId] = updates.aiTaskAuthorization;
    }
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
  await notifyWsEvent(projectId, { type: "comment:updated", thread });

  if (shouldEnqueueAgent) {
    await notifyWsEvent(projectId, { type: "comment:ai-status", threadId, aiTaskStatus: "pending" });
    await enqueueAiTask(projectId, threadId, updates.aiTaskAuthorization);
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
  if (data.aiTaskAuthorizations) delete data.aiTaskAuthorizations[threadId];
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
  aiTaskAuthorization?: CommentAiTaskAuthorization;
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

  // 回复 @AI → 重新入队该线程（pending），与建评论时 @AI 行为一致
  const hasAgentMention = input.mentions?.some((m) => m.type === "agent");
  if (hasAgentMention) {
    thread.aiTaskStatus = "pending";
    if (input.aiTaskAuthorization) {
      data.aiTaskAuthorizations ??= {};
      data.aiTaskAuthorizations[thread.id] = input.aiTaskAuthorization;
    }
  }

  writeCommentStore(input.projectId, data);
  await notifyWsEvent(input.projectId, {
    type: "comment:replied",
    threadId: thread.id,
    reply,
  });

  if (hasAgentMention) {
    await notifyWsEvent(input.projectId, {
      type: "comment:ai-status",
      threadId: thread.id,
      aiTaskStatus: "pending",
    });
    await enqueueAiTask(input.projectId, thread.id, input.aiTaskAuthorization);
  }

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
  // Reply deletion changes the complete thread shape. Broadcast the updated
  // thread so other author/viewer clients remove it without waiting for a
  // full refresh (the event type is already part of the comment protocol).
  await notifyWsEvent(projectId, { type: "comment:updated", thread });
  return true;
}

export async function updateReply(
  projectId: string,
  threadId: string,
  replyId: string,
  updates: { content: string; mentions?: CommentMention[]; aiTaskAuthorization?: CommentAiTaskAuthorization },
): Promise<{ thread: CommentThread; reply: CommentReply } | null> {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((candidate) => candidate.id === threadId);
  const reply = thread?.replies.find((candidate) => candidate.id === replyId);
  if (!thread || !reply) return null;

  const hadAgentMention = reply.mentions?.some((mention) => mention.type === "agent") ?? false;
  reply.content = updates.content;
  reply.mentions = updates.mentions;
  thread.updatedAt = Date.now();
  const hasAgentMention = reply.mentions?.some((mention) => mention.type === "agent") ?? false;
  if (hasAgentMention && !hadAgentMention) {
    thread.aiTaskStatus = "pending";
    if (updates.aiTaskAuthorization) {
      data.aiTaskAuthorizations ??= {};
      data.aiTaskAuthorizations[threadId] = updates.aiTaskAuthorization;
    }
  }
  writeCommentStore(projectId, data);
  await notifyWsEvent(projectId, { type: "comment:updated", thread });
  if (hasAgentMention && !hadAgentMention) {
    await notifyWsEvent(projectId, { type: "comment:ai-status", threadId, aiTaskStatus: "pending" });
    await enqueueAiTask(projectId, threadId, updates.aiTaskAuthorization);
  }
  return { thread, reply };
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
 * @AI 任务失败后重试：将线程状态置回 pending 并重新入队。
 * 供作者点击「重试」时调用。
 */
export async function retryAiTask(
  projectId: string,
  threadId: string,
  aiTaskAuthorization?: CommentAiTaskAuthorization,
): Promise<CommentThread | null> {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return null;
  if (thread.aiTaskStatus !== "failed") return thread;

  thread.aiTaskStatus = "pending";
  thread.updatedAt = Date.now();
  if (aiTaskAuthorization) {
    data.aiTaskAuthorizations ??= {};
    data.aiTaskAuthorizations[threadId] = aiTaskAuthorization;
  }
  writeCommentStore(projectId, data);

  await notifyWsEvent(projectId, {
    type: "comment:ai-status",
    threadId,
    aiTaskStatus: "pending",
  });
  await enqueueAiTask(projectId, threadId, aiTaskAuthorization);
  return thread;
}

/**
 * 通知 agent-service 有新 @AI 任务入队
 */
async function enqueueAiTask(
  projectId: string,
  threadId: string,
  authorization?: CommentAiTaskAuthorization,
): Promise<void> {
  const token = getInternalApiToken();
  try {
    await fetch(`${getServerAgentServiceUrl()}/internal/comments/ai-task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Internal-Token": token } : {}),
      },
      body: JSON.stringify({
        projectId,
        threadId,
        ...(authorization
          ? {
              userId: authorization.userId,
              role: authorization.role,
              expiresAt: authorization.expiresAt,
            }
          : {}),
      }),
    });
  } catch {
    // agent-service 不可用时不阻塞评论创建
  }
}
