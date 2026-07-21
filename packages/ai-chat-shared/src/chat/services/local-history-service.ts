import type { ChatMessage } from "../../message";

export interface LocalChatSession {
  sessionId: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_PREFIX = "workbench:viewer-ai-history:";
const MAX_SESSIONS_PER_PROJECT = 30;

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts?.filter(
      (part) => part.type !== "image" || !part.url.startsWith("data:"),
    ),
    images: message.images?.filter((image) => !image.url.startsWith("data:")),
  }));
}

function isLocalChatSession(value: unknown): value is LocalChatSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalChatSession>;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    Array.isArray(candidate.messages)
  );
}

export function readLocalChatSessions(
  projectId: string,
  storage: Storage = window.localStorage,
): LocalChatSession[] {
  try {
    const raw = storage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isLocalChatSession)
      .filter((session) => session.projectId === projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS_PER_PROJECT);
  } catch {
    return [];
  }
}

export function writeLocalChatSession(
  session: LocalChatSession,
  storage: Storage = window.localStorage,
): void {
  const nextSession = {
    ...session,
    messages: sanitizeMessages(session.messages),
  };
  const sessions = readLocalChatSessions(session.projectId, storage).filter(
    (item) => item.sessionId !== session.sessionId,
  );
  const next = [nextSession, ...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS_PER_PROJECT);
  try {
    storage.setItem(storageKey(session.projectId), JSON.stringify(next));
  } catch {
    // 图片数据已经剔除；若浏览器配额仍不足，保留最近十条会话。
    try {
      storage.setItem(storageKey(session.projectId), JSON.stringify(next.slice(0, 10)));
    } catch {
      // 隐私模式或被禁用的本地存储不应阻断当前聊天。
    }
  }
}

export function deleteLocalChatSession(
  projectId: string,
  sessionId: string,
  storage: Storage = window.localStorage,
): void {
  const next = readLocalChatSessions(projectId, storage).filter(
    (session) => session.sessionId !== sessionId,
  );
  try {
    storage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {
    // 本地存储不可用时仍允许用户继续当前会话。
  }
}

export function deriveLocalChatTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  return firstUserMessage?.content.trim().slice(0, 40) || "新对话";
}
