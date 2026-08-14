export type CheckpointRole = "user" | "assistant";

export interface CheckpointMessage {
  id: string;
  role: CheckpointRole;
  content: string;
}

export interface ConversationCheckpoint {
  version: number;
  messages: CheckpointMessage[];
  updatedAt: number;
}

export type CheckpointResyncResult =
  | { ok: true; checkpoint: ConversationCheckpoint; source: "checkpoint" | "fallback" }
  | { ok: false; code: "CHECKPOINT_VERSION_CONFLICT" | "CHECKPOINT_ANCHOR_REQUIRED" | "CHECKPOINT_ANCHOR_NOT_FOUND" | "CHECKPOINT_FALLBACK_INVALID" };

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 48_000;

/** 移除前端为旧版服务端重放临时注入的历史，checkpoint 只保存真实用户输入。 */
export function stripInjectedConversationHistory(content: string): string {
  const marker = "[历史结束]";
  const markerIndex = content.lastIndexOf(marker);
  return markerIndex === -1 ? content : content.slice(markerIndex + marker.length).trimStart();
}

export function isCanonicalCheckpointEnabled(): boolean {
  return process.env.PI_AGENT_CANONICAL_CHECKPOINTS_ENABLED === "true";
}

function normalizeMessage(value: unknown, index: number): CheckpointMessage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CheckpointMessage>;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  if (typeof raw.content !== "string" || raw.content.trim().length === 0) return null;
  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : `fallback-${index}`;
  return {
    id,
    role: raw.role,
    content: raw.content.trim().slice(0, MAX_MESSAGE_CHARS),
  };
}

function limitMessages(messages: CheckpointMessage[]): CheckpointMessage[] {
  const newestFirst: CheckpointMessage[] = [];
  let totalChars = 0;
  for (const message of [...messages].reverse()) {
    if (newestFirst.length >= MAX_MESSAGES) break;
    if (totalChars + message.content.length > MAX_TOTAL_CHARS) break;
    newestFirst.push(message);
    totalChars += message.content.length;
  }
  return newestFirst.reverse();
}

export class ConversationCheckpointStore {
  private checkpoints = new Map<string, ConversationCheckpoint>();

  get(sessionId: string): ConversationCheckpoint | undefined {
    const checkpoint = this.checkpoints.get(sessionId);
    return checkpoint
      ? { ...checkpoint, messages: checkpoint.messages.map((message) => ({ ...message })) }
      : undefined;
  }

  recordTurn(
    sessionId: string,
    user: CheckpointMessage,
    assistant: CheckpointMessage,
  ): ConversationCheckpoint {
    const current = this.checkpoints.get(sessionId);
    const messages = limitMessages([...(current?.messages ?? []), user, assistant]);
    const checkpoint: ConversationCheckpoint = {
      version: (current?.version ?? 0) + 1,
      messages,
      updatedAt: Date.now(),
    };
    this.checkpoints.set(sessionId, checkpoint);
    return this.get(sessionId)!;
  }

  resolveResync(
    sessionId: string,
    input: {
      expectedVersion?: number;
      truncateAfterMessageId?: string;
      fallbackMessages?: unknown;
    },
  ): CheckpointResyncResult {
    const current = this.checkpoints.get(sessionId);
    if (current) {
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== current.version
      ) {
        return { ok: false, code: "CHECKPOINT_VERSION_CONFLICT" };
      }
      if (!input.truncateAfterMessageId) {
        return { ok: false, code: "CHECKPOINT_ANCHOR_REQUIRED" };
      }
      const anchorIndex = current.messages.findIndex(
        (message) => message.id === input.truncateAfterMessageId,
      );
      if (anchorIndex < 0) return { ok: false, code: "CHECKPOINT_ANCHOR_NOT_FOUND" };
      return {
        ok: true,
        checkpoint: {
          version: current.version + 1,
          messages: current.messages.slice(0, anchorIndex + 1),
          updatedAt: Date.now(),
        },
        source: "checkpoint",
      };
    }

    if (!Array.isArray(input.fallbackMessages)) {
      return { ok: false, code: "CHECKPOINT_FALLBACK_INVALID" };
    }
    const messages = input.fallbackMessages
      .map((message, index) => normalizeMessage(message, index))
      .filter((message): message is CheckpointMessage => Boolean(message));
    if (messages.length !== input.fallbackMessages.length) {
      return { ok: false, code: "CHECKPOINT_FALLBACK_INVALID" };
    }
    return {
      ok: true,
      checkpoint: { version: 1, messages: limitMessages(messages), updatedAt: Date.now() },
      source: "fallback",
    };
  }

  commit(sessionId: string, checkpoint: ConversationCheckpoint): ConversationCheckpoint {
    const committed = {
      ...checkpoint,
      messages: limitMessages(checkpoint.messages),
      updatedAt: Date.now(),
    };
    this.checkpoints.set(sessionId, committed);
    return this.get(sessionId)!;
  }

  clear(sessionId: string): void {
    this.checkpoints.delete(sessionId);
  }
}

let instance: ConversationCheckpointStore | null = null;

export function getConversationCheckpointStore(): ConversationCheckpointStore {
  if (!instance) instance = new ConversationCheckpointStore();
  return instance;
}
