"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "../../message";
import type {
  AgentMode,
  StreamEvent,
  FileAttachment,
  ImageAttachment,
  MessageAcceptedAck,
  ViewerContext,
  PreviewObservationHandler,
} from "@workbench/agent-client";
import { normalizeAiError } from "@workbench/shared";
import { getConfiguredAgentClient } from "../../config";
import {
  MissingTransactionalDeleteToolsError,
  StreamService,
  type PermissionRequest,
  type UserChoiceRequest,
  type UserChoiceResponse,
} from "../services/stream-service";
import type { PlanItem, PlanItemStatus, PlanState } from "../chat-plan";
import {
  addThoughtPart,
  addToolPart,
  extractImageUrlsFromParts,
  updateTextPart,
  updateToolPart,
} from "../utils/chat-stream-utils";
import {
  processFileChanges,
  extractCodeAndSchemaUpdates,
  type FileChangeEntry,
} from "../utils/chat-file-utils";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";
import {
  updateSessionTitle,
  fetchSessionFiles,
} from "../services/message-service";
import {
  cancelConversationRun,
  flushConversationOutbox,
  submitConversationCommand,
} from "../services/conversation-outbox";
import {
  deriveConversationTitle,
  requestConversationTitle,
} from "../services/title-service";
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "../../lib/active-view-context";
import type { RunSummary } from "@workbench/agent-client";
import type { WorkspaceProjectionAck } from "@workbench/shared/contracts";

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

const MAX_CONTEXT_HISTORY_MESSAGES = 8;
const WORKSPACE_PROJECTION_ACK_EVENT = "workspace-projection-acknowledged";

export function mergeWorkspaceProjectionAck(
  summary: RunSummary,
  ack: WorkspaceProjectionAck,
): RunSummary {
  if (
    !summary.mutations.some((mutation) => mutation.revision === ack.revision)
  ) {
    return summary;
  }

  const status = ack.status === "applied" ? "applied" : "failed";
  const existingIndex = summary.projections.findIndex(
    (projection) =>
      projection.revision === ack.revision &&
      projection.surface === ack.surface,
  );
  if (
    existingIndex >= 0 &&
    summary.projections[existingIndex]?.status === status
  ) {
    return summary;
  }

  const projections = [...summary.projections];
  const nextProjection = {
    revision: ack.revision,
    surface: ack.surface,
    status,
  } as const;
  if (existingIndex >= 0) {
    projections[existingIndex] = nextProjection;
  } else {
    projections.push(nextProjection);
  }
  return { ...summary, projections };
}

function buildConversationHistoryPrefix(messages: ChatMessage[]): string {
  const history = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        !message.queueStatus &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_CONTEXT_HISTORY_MESSAGES);

  if (history.length === 0) return "";
  return [
    "[系统自动注入：以下是当前对话最近历史，供保持上下文使用。]",
    ...history.map((message) => {
      const speaker = message.role === "user" ? "用户" : "AI";
      return `${speaker}：${message.content.trim().slice(0, 2000)}`;
    }),
    "[历史结束]",
    "",
  ].join("\n");
}

const DEFAULT_AUTO_REPAIR_TITLE = "检测到预览异常，正在自动修复";

const EMPTY_PLAN: PlanState = {
  items: [],
  fallbackText: "",
};

const PLAN_STATUSES: PlanItemStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "failed",
];

function parsePlanContent(content: string): PlanState | null {
  try {
    const parsed = JSON.parse(content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;

    const items: PlanItem[] = [];
    for (const item of parsed.items) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { id?: unknown }).id !== "string" ||
        typeof (item as { title?: unknown }).title !== "string" ||
        typeof (item as { status?: unknown }).status !== "string"
      ) {
        return null;
      }

      const status = (item as { status: string }).status;
      if (!PLAN_STATUSES.includes(status as PlanItemStatus)) return null;

      items.push({
        id: (item as { id: string }).id,
        title: (item as { title: string }).title,
        status: status as PlanItemStatus,
      });
    }

    return { items, fallbackText: "" };
  } catch {
    return null;
  }
}

function addUserChoicePart(
  parts: NonNullable<ChatMessage["parts"]>,
  request: UserChoiceRequest,
): NonNullable<ChatMessage["parts"]> {
  if (
    parts.some(
      (part) =>
        part.type === "user_choice" && part.requestId === request.requestId,
    )
  ) {
    return parts;
  }
  return [
    ...parts,
    {
      type: "user_choice",
      requestId: request.requestId,
      question: request.question,
      description: request.description,
      options: request.options,
      allowCustom: request.allowCustom,
      status: "pending",
    },
  ];
}

function updateUserChoicePart(
  parts: NonNullable<ChatMessage["parts"]>,
  requestId: string,
  choice: UserChoiceResponse,
): NonNullable<ChatMessage["parts"]> {
  return parts.map((part) => {
    if (part.type !== "user_choice" || part.requestId !== requestId) {
      return part;
    }

    if (choice.type === "cancel") {
      return {
        ...part,
        status: "cancelled" as const,
        selected: undefined,
      };
    }

    if (choice.type === "custom") {
      return {
        ...part,
        status: "answered" as const,
        selected: {
          type: "custom" as const,
          text: choice.text,
        },
      };
    }

    const option = part.options.find(
      (item) => item.optionId === choice.optionId,
    );
    return {
      ...part,
      status: "answered" as const,
      selected: {
        type: "option" as const,
        optionId: choice.optionId,
        label: option?.label || choice.optionId,
        value: option?.value,
      },
    };
  });
}

function isBulkPageDeletionRequest(message: string): boolean {
  return (
    /删|删除|清理/.test(message) &&
    /页面|页/.test(message) &&
    /所有|全部|批量|这些|那些|多个|副本|不需要|冗余/.test(message)
  );
}

export interface SendMessageRunOptions {
  source?: "user" | "system_auto_repair" | "visual_property";
  displayMessage?: NonNullable<ChatMessage["autoRepair"]>;
  visualPropertyDisplayMessage?: NonNullable<ChatMessage["visualProperty"]>;
  inlineRefs?: NonNullable<ChatMessage["inlineRefs"]>;
}

/**
 * 从 inlineRefs 中提取被引用项目（project 类型 tag）。
 * 项目 tag id 形如 `proj-{projectId}-{timestamp}`，context 含 `项目ID: {projectId}`。
 */
export function extractReferencedProjects(
  inlineRefs?: NonNullable<ChatMessage["inlineRefs"]>,
): Array<{ projectId: string; label?: string }> {
  const result: Array<{ projectId: string; label?: string }> = [];
  const seen = new Set<string>();
  for (const tag of inlineRefs?.tags ?? []) {
    if (tag.type !== "project") continue;
    const projectId = extractProjectIdFromTag(tag);
    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    result.push({ projectId, label: tag.label });
  }
  return result;
}

function extractProjectIdFromTag(tag: {
  id?: string;
  label: string;
  context: string;
}): string | null {
  // context 优先：`项目ID: proj_xxx`
  const contextMatch = tag.context.match(/项目ID:\s*([A-Za-z0-9_-]+)/);
  if (contextMatch?.[1]) return contextMatch[1];
  // 回退：id 形如 `proj-{projectId}-{timestamp}`
  if (tag.id) {
    const idMatch = tag.id.match(/^proj-(proj_[A-Za-z0-9_-]+)/);
    if (idMatch?.[1]) return idMatch[1];
  }
  return null;
}

interface StartMessageRunOptions {
  appendDisplayMessage?: boolean;
  displayMessageId?: string;
  ledgerAck?: MessageAcceptedAck;
  skipBeforeSend?: boolean;
  skipUserMessageDisplay?: boolean;
}

interface QueuedChatMessage {
  queueId: string;
  content: string;
  images?: ImageAttachment[];
  files?: FileAttachment[];
  runOptions?: SendMessageRunOptions;
  createdAt: number;
  displayMessageId: string;
  dedupeKey?: string;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildAttachmentParts(
  images?: ImageAttachment[],
  files?: FileAttachment[],
): NonNullable<ChatMessage["parts"]> {
  return [
    ...(images?.map((img) => ({
      type: "image" as const,
      url: `data:${img.mimeType};base64,${img.data}`,
    })) || []),
    ...(files
      ?.filter((file) => !file.mimeType.startsWith("image/"))
      .map((file) => ({
        type: "file" as const,
        name: file.name,
        url: "",
        size: file.size,
        attachmentId: file.id,
        mimeType: file.mimeType,
        textExtracted: file.textExtracted,
      })) || []),
  ];
}

export function buildLedgerAttachmentParts(
  files?: FileAttachment[],
): NonNullable<ChatMessage["parts"]> {
  return (
    files?.map((file) => ({
      type: "file" as const,
      name: file.name,
      url: "",
      size: file.size,
      attachmentId: file.id,
      mimeType: file.mimeType,
      textExtracted: file.textExtracted,
    })) ?? []
  );
}

function extractImagesFromMessage(
  message: ChatMessage,
): ImageAttachment[] | undefined {
  const imageParts = message.parts?.filter((p) => p.type === "image") || [];
  if (imageParts.length === 0) return undefined;
  return imageParts
    .map((p) => {
      if (p.type !== "image") return undefined;
      const match = p.url.match(/^data:(.+);base64,(.+)$/);
      if (match) {
        return {
          mimeType: match[1],
          data: match[2],
          name: "image",
        } as ImageAttachment;
      }
      return undefined;
    })
    .filter((img): img is ImageAttachment => img !== undefined);
}

function getErrorDiagnosticDetails(
  error: unknown,
  fallbackMessage: string,
): {
  message: string;
  phase?: string;
  errorCode?: string;
  httpStatus?: number;
} {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const details: {
    message: string;
    phase?: string;
    errorCode?: string;
    httpStatus?: number;
  } = { message };
  if (error && typeof error === "object") {
    const candidate = error as {
      phase?: unknown;
      code?: unknown;
      status?: unknown;
    };
    if (typeof candidate.phase === "string") details.phase = candidate.phase;
    if (typeof candidate.code === "string") details.errorCode = candidate.code;
    if (typeof candidate.status === "number")
      details.httpStatus = candidate.status;
  }
  return details;
}

function createSystemAutoRepairDedupeKey(
  title: string,
  hiddenPrompt: string,
): string {
  return `system_auto_repair:${title}:${hiddenPrompt}`;
}

function updateAutoRepairStatus(
  messages: ChatMessage[],
  messageId: string | undefined,
  status: NonNullable<ChatMessage["autoRepair"]>["status"],
): ChatMessage[] {
  if (!messageId) return messages;

  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== messageId || !message.autoRepair) return message;
    changed = true;
    return {
      ...message,
      autoRepair: {
        ...message.autoRepair,
        status,
      },
    };
  });

  return changed ? nextMessages : messages;
}

function appendMessageBeforeQueued(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  const firstQueuedIndex = messages.findIndex((item) => item.queueStatus);
  if (firstQueuedIndex < 0) {
    return [...messages, message];
  }
  return [
    ...messages.slice(0, firstQueuedIndex),
    message,
    ...messages.slice(firstQueuedIndex),
  ];
}

function finalizeAssistantMessageBeforeQueued(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  const existingIndex = message.id
    ? messages.findIndex((item) => item.id === message.id)
    : -1;
  if (existingIndex < 0) {
    return appendMessageBeforeQueued(messages, message);
  }

  const existingMessage = messages[existingIndex];
  const mergedMessage: ChatMessage = {
    ...existingMessage,
    ...message,
    parts: [...(existingMessage.parts || []), ...(message.parts || [])],
  };

  return messages.map((item, index) =>
    index === existingIndex ? mergedMessage : item,
  );
}

function hasVisibleAssistantContent(message: ChatMessage): boolean {
  if (message.content?.trim()) return true;
  return Boolean(
    message.parts?.some((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.content.trim().length > 0;
      }
      return true;
    }),
  );
}

function hasToolCallId(message: ChatMessage, toolCallId: string): boolean {
  return Boolean(
    toolCallId &&
      message.parts?.some(
        (part) => part.type === "tool" && part.toolCallId === toolCallId,
      ),
  );
}

interface UseChatStreamOptions {
  sessionId: string;
  agentSessionId: string;
  /** 行为模式，默认 workbench；viewer-readonly 时上下文与系统提示词由服务端注入 */
  mode?: AgentMode;
  /** viewer-readonly 模式下随消息上报的浏览端上下文 */
  viewerContext?: ViewerContext;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
  activeViewContext?: ActiveViewContext;
  onCodeUpdate?: (code: string, source?: "ai-realtime" | "ai-finish") => void;
  onSchemaUpdate?: (
    schema: string,
    source?: "ai-realtime" | "ai-finish",
  ) => void;
  onFilesChange?: (
    files: Array<{
      path: string;
      action: "created" | "modified" | "deleted";
    }>,
  ) => void;
  onWorkspaceMutationCommitted?: (receipt: WorkspaceMutationReceipt) => void;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  /** 当前宿主展示的流状态；用于宿主兜底重置时同步释放本 Hook 的运行锁。 */
  isStreaming?: boolean;
  setIsStreaming: (value: boolean) => void;
  setStreamContent: (updater: string | ((prev: string) => string)) => void;
  currentMessageRef: React.MutableRefObject<ChatMessage>;
  setCurrentMessage: (
    updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
  ) => void;
  onModelsEvent?: (event: StreamEvent) => void;
  onModelStateError?: () => void;
  selectedModelId?: string;
  onSessionTitleChange?: (title: string) => void;
  onDiagnosticEvent?: (event: {
    name: string;
    traceId?: string;
    level?: "info" | "warn" | "error";
    details?: Record<string, unknown>;
  }) => void;
  beforeSend?: () => Promise<void> | void;
  externalStreamServiceRef?: React.MutableRefObject<StreamService | null>;
  previewObservationHandlerRef?: React.RefObject<PreviewObservationHandler | null>;
}

export function useChatStream(options: UseChatStreamOptions) {
  const {
    sessionId,
    agentSessionId,
    mode = "workbench",
    viewerContext,
    workingDir,
    projectId,
    demoId,
    activeViewContext,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
    onWorkspaceMutationCommitted,
    messagesRef,
    setMessages,
    isStreaming = false,
    setIsStreaming,
    setStreamContent,
    currentMessageRef,
    setCurrentMessage,
    onModelsEvent,
    onModelStateError,
    selectedModelId,
    onSessionTitleChange,
    onDiagnosticEvent,
    beforeSend,
    externalStreamServiceRef,
    previewObservationHandlerRef,
  } = options;

  const [plan, setPlan] = useState<PlanState>(EMPTY_PLAN);
  const [contextCompactionNotice, setContextCompactionNotice] = useState(false);
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [silenceSeconds, setSilenceSeconds] = useState<number | null>(null);

  const streamServiceRef = useRef<StreamService | null>(null);
  const streamSessionIdRef = useRef<string>("");
  const lastEventAtRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const memoryFilePathsRef = useRef<Set<string>>(new Set());
  const queuedMessagesRef = useRef<QueuedChatMessage[]>([]);
  const activeRunRef = useRef(false);
  const activeLedgerRunRef = useRef<{
    conversationId: string;
    runId: string;
  } | null>(null);
  const pendingPermissionRef = useRef<PermissionRequest | null>(null);
  const previousIsStreamingRef = useRef(isStreaming);
  const activeRunDedupeKeyRef = useRef<string | null>(null);
  const busyRetryAttemptedRef = useRef(false);
  const drainQueueRef = useRef<() => void>(() => {});
  const previousSessionIdRef = useRef(sessionId);
  const outboxRecoveryRef = useRef<{
    sessionId: string;
    promise: Promise<number>;
  } | null>(null);
  const currentRunSummaryRef = useRef<RunSummary | null>(null);
  const pendingProjectionAcksRef = useRef<WorkspaceProjectionAck[]>([]);
  const checkpointVersionRef = useRef<number | undefined>(undefined);
  const titleGenerationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !projectId) return;

    const handleProjectionAck = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          projectId?: string;
          sessionId?: string;
          ack?: WorkspaceProjectionAck;
        }>
      ).detail;
      if (
        detail?.projectId !== projectId ||
        detail.sessionId !== sessionId ||
        !detail.ack
      ) {
        return;
      }

      const ack = detail.ack;
      const currentSummary = currentRunSummaryRef.current;
      if (currentSummary) {
        currentRunSummaryRef.current = mergeWorkspaceProjectionAck(
          currentSummary,
          ack,
        );
      } else {
        pendingProjectionAcksRef.current = [
          ...pendingProjectionAcksRef.current.filter(
            (item) =>
              item.revision !== ack.revision || item.surface !== ack.surface,
          ),
          ack,
        ].slice(-32);
      }

      setMessages((previous) => {
        let changed = false;
        const next = previous.map((message) => {
          if (!message.runSummary) return message;
          const nextSummary = mergeWorkspaceProjectionAck(
            message.runSummary,
            ack,
          );
          if (nextSummary === message.runSummary) return message;
          changed = true;
          return { ...message, runSummary: nextSummary };
        });
        return changed ? next : previous;
      });
    };

    window.addEventListener(
      WORKSPACE_PROJECTION_ACK_EVENT,
      handleProjectionAck,
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_PROJECTION_ACK_EVENT,
        handleProjectionAck,
      );
    };
  }, [projectId, sessionId, setMessages]);

  useEffect(() => {
    titleGenerationKeyRef.current = null;
    return () => {
      titleGenerationKeyRef.current = null;
    };
  }, [agentSessionId, sessionId]);

  const recoverConversationOutbox = useCallback((): Promise<number> => {
    if (mode !== "workbench" || !sessionId) return Promise.resolve(0);
    if (outboxRecoveryRef.current?.sessionId === sessionId) {
      return outboxRecoveryRef.current.promise;
    }
    const client = getConfiguredAgentClient();
    const promise = flushConversationOutbox(client, sessionId).finally(() => {
      if (outboxRecoveryRef.current?.promise === promise) {
        outboxRecoveryRef.current = null;
      }
    });
    outboxRecoveryRef.current = { sessionId, promise };
    return promise;
  }, [mode, sessionId]);

  useEffect(() => {
    if (mode !== "workbench" || !sessionId) return;
    let disposed = false;
    const client = getConfiguredAgentClient();
    void recoverConversationOutbox()
      .then(async (recoveredCount) => {
        if (disposed || recoveredCount === 0) return;
        const projection = await client.loadConversation(sessionId);
        if (disposed) return;
        const canonicalMessages = projection.messages.map((message) => ({
          ...message,
          parts: message.displayParts,
        })) as ChatMessage[];
        const canonicalIds = new Set(
          canonicalMessages.flatMap((message) =>
            message.id ? [message.id] : [],
          ),
        );
        setMessages((current) => [
          ...canonicalMessages,
          ...current.filter(
            (message) => !message.id || !canonicalIds.has(message.id),
          ),
        ]);
      })
      .catch((error) => {
        if (!disposed) {
          console.warn("[ConversationLedger] outbox recovery failed", error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [mode, recoverConversationOutbox, sessionId, setMessages]);

  const startTitleGeneration = useCallback(
    (userMessage: string) => {
      const trimmedMessage = userMessage.trim();
      if (!trimmedMessage) return;

      const generationKey = `${sessionId}:${agentSessionId}:${trimmedMessage}`;
      if (titleGenerationKeyRef.current === generationKey) return;
      titleGenerationKeyRef.current = generationKey;

      const fallbackTitle = deriveConversationTitle(trimmedMessage);
      onSessionTitleChange?.(fallbackTitle);
      void updateSessionTitle(sessionId, fallbackTitle);

      void requestConversationTitle(
        agentSessionId,
        trimmedMessage,
        selectedModelId,
      ).then((title) => {
        if (!title || titleGenerationKeyRef.current !== generationKey) return;
        onSessionTitleChange?.(title);
        void updateSessionTitle(sessionId, title);
      });
    },
    [agentSessionId, onSessionTitleChange, selectedModelId, sessionId],
  );

  const SILENCE_THRESHOLD_MS = 30000;
  const SILENCE_TICK_MS = 1000;

  const stopSilenceTracking = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    lastEventAtRef.current = null;
    setSilenceSeconds(null);
  }, []);

  const startSilenceTracking = useCallback(() => {
    lastEventAtRef.current = Date.now();
    setSilenceSeconds(null);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = setInterval(() => {
      if (lastEventAtRef.current == null) return;
      const elapsed = Date.now() - lastEventAtRef.current;
      if (elapsed >= SILENCE_THRESHOLD_MS) {
        setSilenceSeconds(Math.floor(elapsed / 1000));
      } else {
        setSilenceSeconds(null);
      }
    }, SILENCE_TICK_MS);
  }, []);

  const markActivity = useCallback(() => {
    if (lastEventAtRef.current != null) {
      lastEventAtRef.current = Date.now();
    }
  }, []);

  // 对话账本按命令持久化；卸载只需要释放流和本地运行状态。
  useEffect(() => {
    return () => {
      activeRunRef.current = false;
      activeRunDedupeKeyRef.current = null;
      queuedMessagesRef.current = [];
      streamServiceRef.current?.close();
      stopSilenceTracking();
    };
  }, [stopSilenceTracking]);

  // 会话切换时关闭旧流
  useEffect(() => {
    if (previousSessionIdRef.current !== sessionId) {
      previousSessionIdRef.current = sessionId;
      queuedMessagesRef.current = [];
      activeRunRef.current = false;
      activeRunDedupeKeyRef.current = null;
    }

    if (
      streamServiceRef.current?.isActive &&
      streamSessionIdRef.current &&
      streamSessionIdRef.current !== sessionId
    ) {
      streamServiceRef.current.close();
      streamSessionIdRef.current = "";
      activeRunRef.current = false;
      activeRunDedupeKeyRef.current = null;
      queuedMessagesRef.current = [];
      stopSilenceTracking();
      setIsStreaming(false);
      setStreamContent("");
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
    }
  }, [
    sessionId,
    setIsStreaming,
    setStreamContent,
    setCurrentMessage,
    stopSilenceTracking,
  ]);

  const clearPendingPermission = useCallback(
    (errorMessage?: string) => {
      const pendingPermission = pendingPermissionRef.current;
      pendingPermissionRef.current = null;
      setPendingPermissionRequest(null);

      if (!pendingPermission || !errorMessage) return;
      const update = {
        toolCallId: pendingPermission.toolCall.toolCallId,
        toolCallStatus: "failed",
        error: { message: errorMessage },
      };
      setMessages((prev) => {
        if (
          !prev.some((message) => hasToolCallId(message, update.toolCallId))
        ) {
          return prev;
        }
        return prev.map((message) =>
          hasToolCallId(message, update.toolCallId)
            ? { ...message, parts: updateToolPart(message.parts || [], update) }
            : message,
        );
      });
    },
    [setMessages],
  );

  const completeRunAndDrain = useCallback(
    (permissionError?: string) => {
      clearPendingPermission(permissionError);
      activeRunRef.current = false;
      activeRunDedupeKeyRef.current = null;
      setIsStreaming(false);
      setTimeout(() => {
        drainQueueRef.current();
      }, 0);
    },
    [clearPendingPermission, setIsStreaming],
  );

  // 编辑页的状态探测会在 Agent 已不再处理时把受控 isStreaming 置为 false。
  // 这必须同时结束 Hook 内部的运行锁，否则已展示的等待消息永远不会被 drain。
  useEffect(() => {
    const transitionedToStopped =
      previousIsStreamingRef.current && !isStreaming;
    previousIsStreamingRef.current = isStreaming;
    if (
      !transitionedToStopped ||
      !activeRunRef.current ||
      pendingPermissionRef.current
    ) {
      return;
    }

    stopSilenceTracking();
    completeRunAndDrain("AI 运行已结束，未收到完整的工具结果。");
  }, [completeRunAndDrain, isStreaming, stopSilenceTracking]);

  const startMessageRun = useCallback(
    async (
      userMessage: string,
      images?: ImageAttachment[],
      files?: FileAttachment[],
      runOptions?: SendMessageRunOptions,
      startOptions: StartMessageRunOptions = {},
    ) => {
      if (!userMessage.trim() || !agentSessionId) return;
      activeRunRef.current = true;
      busyRetryAttemptedRef.current = false;
      currentRunSummaryRef.current = null;
      pendingProjectionAcksRef.current = [];

      const source = runOptions?.source ?? "user";
      setContextCompactionNotice(false);
      const trimmedMessage = userMessage.trim();
      const traceId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isSystemAutoRepair = source === "system_auto_repair";
      const isVisualProperty = source === "visual_property";
      const outboundMessage = userMessage;
      const referencedProjects = (() => {
        const refs = extractReferencedProjects(runOptions?.inlineRefs);
        return refs.length > 0 ? refs : undefined;
      })();
      activeRunDedupeKeyRef.current = isSystemAutoRepair
        ? createSystemAutoRepairDedupeKey(
            runOptions?.displayMessage?.title || DEFAULT_AUTO_REPAIR_TITLE,
            trimmedMessage,
          )
        : null;
      const isFirstUserMessage =
        !isSystemAutoRepair &&
        messagesRef.current.every(
          (message) =>
            message.role !== "user" ||
            message.queueStatus ||
            message.visualProperty ||
            message.kind === "auto_repair",
        );

      const autoRepairMessageId = isSystemAutoRepair
        ? startOptions.displayMessageId || createLocalId("auto-repair")
        : undefined;
      const displayMessageId =
        autoRepairMessageId ||
        startOptions.displayMessageId ||
        createLocalId("user");
      onDiagnosticEvent?.({
        name: "ai.message_send_started",
        traceId,
        details: {
          source,
          messageId: displayMessageId,
          agentSessionId,
          sessionId,
          demoId,
          messageLength: userMessage.trim().length,
          imageCount: images?.length ?? 0,
          fileCount: files?.length ?? 0,
          hasActiveViewContext: Boolean(activeViewContext),
          selectedModelId,
        },
      });

      if (!startOptions.skipUserMessageDisplay) {
        if (startOptions.appendDisplayMessage !== false) {
          setMessages((prev) => {
            const nextMessage: ChatMessage = isSystemAutoRepair
              ? {
                  id: autoRepairMessageId,
                  role: "system",
                  kind: "auto_repair",
                  content:
                    runOptions?.displayMessage?.title ||
                    DEFAULT_AUTO_REPAIR_TITLE,
                  autoRepair: {
                    status: "running",
                    title:
                      runOptions?.displayMessage?.title ||
                      DEFAULT_AUTO_REPAIR_TITLE,
                    summary:
                      runOptions?.displayMessage?.summary ||
                      "AI 将尝试恢复当前页面预览",
                    debugDetail: runOptions?.displayMessage?.debugDetail,
                    hiddenPrompt: trimmedMessage,
                  },
                }
              : isVisualProperty
                ? {
                    id: displayMessageId,
                    role: "user",
                    content: trimmedMessage,
                    visualProperty:
                      runOptions?.visualPropertyDisplayMessage ?? {
                        title: "可视化修改已发送给 AI",
                        summary: "AI 将根据当前选区和属性变更修改页面。",
                        hiddenPrompt: trimmedMessage,
                      },
                  }
                : {
                    id: displayMessageId,
                    role: "user",
                    content: trimmedMessage,
                    syncStatus: mode === "workbench" ? "pending" : undefined,
                    inlineRefs: runOptions?.inlineRefs,
                    parts: buildAttachmentParts(images, files),
                  };
            return [...prev, nextMessage];
          });
        } else if (startOptions.displayMessageId) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === startOptions.displayMessageId
                ? { ...message, queueStatus: undefined, queueId: undefined }
                : message,
            ),
          );
        }
      }

      let beforeSendFailed = false;
      let assistantMessageId = createLocalId("assistant");
      let acceptedLedgerAck: MessageAcceptedAck | null = null;

      try {
        memoryFilePathsRef.current.clear();
        setIsStreaming(true);
        setStreamContent("");
        setPlan(EMPTY_PLAN);
        setCurrentMessage({
          id: assistantMessageId,
          role: "assistant",
          content: "",
          parts: [],
        });

        if (!startOptions.skipBeforeSend) {
          try {
            await beforeSend?.();
          } catch (error) {
            beforeSendFailed = true;
            throw error;
          }
        }

        const ledgerAck =
          mode === "workbench"
            ? (startOptions.ledgerAck ??
              (await (async () => {
                const conversationClient = getConfiguredAgentClient();
                await recoverConversationOutbox();
                return submitConversationCommand(conversationClient, {
                  conversationId: sessionId,
                  clientMessageId: displayMessageId,
                  content: trimmedMessage,
                  displayParts: buildLedgerAttachmentParts(files),
                  attachmentIds: files?.map((file) => file.id),
                  kind: isSystemAutoRepair ? "auto_repair" : undefined,
                  createdAt: Date.now(),
                });
              })()))
            : null;
        acceptedLedgerAck = ledgerAck;
        if (ledgerAck) {
          assistantMessageId = ledgerAck.assistantMessageId;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === displayMessageId && message.role === "user"
                ? {
                    ...message,
                    id: ledgerAck.messageId,
                    syncStatus: "accepted",
                  }
                : message,
            ),
          );
          setCurrentMessage((prev) => ({
            ...prev,
            id: ledgerAck.assistantMessageId,
          }));
        }
        activeLedgerRunRef.current = ledgerAck
          ? { conversationId: ledgerAck.conversationId, runId: ledgerAck.runId }
          : null;

        // 工作区同步成功、消息即将交给 StreamService 时，才为首条真实用户消息启动标题生成。
        // 标题请求 fire-and-forget，不阻塞 WebSocket 连接和 AI 输出。
        if (isFirstUserMessage && !isVisualProperty) {
          // @引用消息的 content 包含供 Agent 使用的隐藏上下文；标题只使用用户实际输入文本。
          const titleSource =
            runOptions?.inlineRefs?.text?.trim() || trimmedMessage;
          startTitleGeneration(titleSource);
        }

        const streamService = new StreamService({
          mode,
          previewObservationHandler:
            previewObservationHandlerRef?.current ?? null,
        });
        streamServiceRef.current = streamService;
        if (externalStreamServiceRef) {
          externalStreamServiceRef.current = streamService;
        }

        const stream = await streamService.connect(agentSessionId, sessionId);
        streamSessionIdRef.current = sessionId;
        onDiagnosticEvent?.({
          name: "ai.websocket_connected",
          traceId,
          details: {
            agentSessionId,
            sessionId,
          },
        });

        let accumulatedContent = "";

        // ── Silence 计时器约定 ──
        // markActivity() 只在"实质性输出"事件上调用，用于重置前端 silence 计时器。
        // 必须与后端 activityEvents（backend-agent.ts）保持一致：
        //   ✅ onStream / onToolCall / onToolUpdate — 实质性模型输出
        //   ❌ onThought — 纯推理，不算活动（模型可能长时间 reasoning 导致卡住）
        // 前后端定义一致，才能保证 silence 提示与后端超时行为对齐。
        streamService.setHandlers({
          onStream: (content) => {
            markActivity();
            accumulatedContent += content;
            setStreamContent(accumulatedContent);
            setCurrentMessage((prev) => ({
              ...prev,
              content: accumulatedContent,
              parts: updateTextPart(prev.parts || [], content),
            }));
          },

          onThought: (content) => {
            // 注意：此处不调用 markActivity()，与后端超时判定保持一致——
            // thought/reasoning 事件不算"实质性活动"，silence 计时器持续累加，
            // 使前端能在模型长时间纯推理时正确触发黄色/红色超时警告。
            setCurrentMessage((prev) => ({
              ...prev,
              parts: addThoughtPart(prev.parts || [], content),
            }));
          },

          onPlan: (content) => {
            markActivity();
            const parsed = parsePlanContent(content);
            if (parsed) {
              setPlan(parsed);
            } else {
              setPlan((prev) => ({
                items: [],
                fallbackText: `${prev.fallbackText}${content}`,
              }));
            }
          },

          onContextCompacted: () => {
            markActivity();
            setContextCompactionNotice(true);
          },

          onModels: (event) => {
            onModelsEvent?.(event);
          },

          onToolCall: (toolCall) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: addToolPart(prev.parts || [], toolCall),
            }));
          },

          onToolUpdate: (update) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: updateToolPart(prev.parts || [], update),
            }));
            // 权限请求会将当前消息归档并清空流消息。终态更新不能只
            // 写入当前消息，必须按 toolCallId 找到已归档的那张工具卡。
            setMessages((prev) => {
              if (
                !prev.some((message) =>
                  hasToolCallId(message, update.toolCallId),
                )
              ) {
                return prev;
              }
              const next = prev.map((message) =>
                hasToolCallId(message, update.toolCallId)
                  ? {
                      ...message,
                      parts: updateToolPart(message.parts || [], update),
                    }
                  : message,
              );
              return next;
            });
            // 知识库文档创建后通知前端刷新
            const details = update.details as
              | { knowledgeDocumentCreated?: boolean }
              | undefined;
            if (details?.knowledgeDocumentCreated) {
              window.dispatchEvent(new Event("knowledge-updated"));
            }
            const proposalId = (
              update.details as { proposalId?: unknown } | undefined
            )?.proposalId;
            if (typeof proposalId === "string") {
              window.dispatchEvent(
                new CustomEvent("document-proposal-created", {
                  detail: { proposalId },
                }),
              );
            }
            const receipt = (
              update.details as { receipt?: unknown } | undefined
            )?.receipt;
            if (
              receipt &&
              typeof receipt === "object" &&
              (receipt as { committed?: unknown }).committed === true &&
              Array.isArray((receipt as { resources?: unknown }).resources)
            ) {
              onWorkspaceMutationCommitted?.(
                receipt as WorkspaceMutationReceipt,
              );
            }
          },

          onPermission: (request) => {
            if (
              request.toolCall.approvalKind === "plan_approval" ||
              request.toolCall.approvalKind === "config_visibility"
            ) {
              // 计划审批会有意隐藏流式状态；先写 ref，避免宿主状态同步 effect
              // 把仍在等待用户选择的运行误判为终态。
              pendingPermissionRef.current = request;
              stopSilenceTracking();
              const currentMsg = currentMessageRef.current;
              if (hasVisibleAssistantContent(currentMsg)) {
                setMessages((prev) =>
                  appendMessageBeforeQueued(prev, {
                    id: currentMsg.id || assistantMessageId,
                    role: "assistant",
                    content: currentMsg.content || accumulatedContent,
                    parts: currentMsg.parts,
                  }),
                );
              }
              setCurrentMessage(DEFAULT_CURRENT_MESSAGE);
              setStreamContent("");
              setIsStreaming(false);
            }
            setPendingPermissionRequest(request);
          },

          onUserChoice: (request) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: addUserChoicePart(prev.parts || [], request),
            }));
          },

          onRunSummary: (runSummary) => {
            currentRunSummaryRef.current =
              pendingProjectionAcksRef.current.reduce(
                (summary, ack) => mergeWorkspaceProjectionAck(summary, ack),
                runSummary,
              );
          },

          onFinish: async (result) => {
            activeLedgerRunRef.current = null;
            streamService.stopKeepalive();
            onDiagnosticEvent?.({
              name: "ai.stream_finish_event",
              traceId,
              details: {
                contentLength: result.content?.length ?? 0,
                fileCount: result.files?.length ?? 0,
              },
            });
            stopSilenceTracking();
            try {
              const currentMsg = currentMessageRef.current;
              const hasStructuredParts =
                currentMsg.parts !== undefined && currentMsg.parts.length > 0;
              const finalParts = extractImageUrlsFromParts(
                currentMsg.parts || [],
              );
              const finalRunSummary = pendingProjectionAcksRef.current.reduce(
                (summary, ack) =>
                  summary ? mergeWorkspaceProjectionAck(summary, ack) : summary,
                currentRunSummaryRef.current ??
                  result.metadata?.runSummary ??
                  null,
              );
              const assistantMessage: ChatMessage = {
                id: currentMsg.id || assistantMessageId,
                role: "assistant",
                content:
                  accumulatedContent ||
                  result.content ||
                  (hasStructuredParts ? "" : "抱歉，我没有收到有效的回复。"),
                parts: finalParts,
                runSummary: finalRunSummary ?? undefined,
              };

              const messagesWithAutoRepairStatus = updateAutoRepairStatus(
                messagesRef.current,
                autoRepairMessageId,
                "completed",
              );
              const updatedMessages = finalizeAssistantMessageBeforeQueued(
                messagesWithAutoRepairStatus,
                assistantMessage,
              );
              setMessages(updatedMessages);
              setCurrentMessage({
                role: "assistant",
                content: "",
                parts: [],
              });
              setStreamContent("");
              currentRunSummaryRef.current = null;
              pendingProjectionAcksRef.current = [];

              // 后备检查：如果 onToolUpdate 未正确触发 knowledge-updated 事件，
              // 在 onFinish 时遍历所有 tool parts 再检查一次
              const hasKnowledgeDoc = (currentMsg.parts || []).some(
                (p) =>
                  p.type === "tool" &&
                  (
                    p.details as
                      | {
                          knowledgeDocumentCreated?: boolean;
                        }
                      | undefined
                  )?.knowledgeDocumentCreated,
              );
              if (hasKnowledgeDoc) {
                window.dispatchEvent(new Event("knowledge-updated"));
              }

              const finalFiles = result.files ?? [];

              if (finalFiles.length > 0) {
                for (const f of finalFiles) {
                  if (f.path && f.path.endsWith(".md")) {
                    memoryFilePathsRef.current.add(f.path);
                  }
                }
                onFilesChange?.(finalFiles);
              }

              // 第三层后备：基于 result.files 检测知识文档路径
              // 不依赖 details.knowledgeDocumentCreated 标志，直接检查文件路径
              const hasKnowledgeFile = finalFiles.some(
                (f) =>
                  f.path &&
                  /^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(
                    f.path.replace(/^\.?\//, ""),
                  ),
              );
              if (hasKnowledgeFile) {
                window.dispatchEvent(new Event("knowledge-updated"));
              }

              // finish.files 是前端唯一的流式文件刷新来源；legacy 文件事件不再作为写入/刷新依据。
              const { codeUpdated, schemaUpdated } =
                finalFiles.length > 0
                  ? extractCodeAndSchemaUpdates(finalFiles, {
                      onCodeUpdate: (code) => onCodeUpdate?.(code, "ai-finish"),
                      onSchemaUpdate: (schema) =>
                        onSchemaUpdate?.(schema, "ai-finish"),
                    })
                  : { codeUpdated: false, schemaUpdated: false };

              if (!codeUpdated && !schemaUpdated) {
                const filesData = await fetchSessionFiles(sessionId, demoId);
                if (filesData) {
                  const { code, schema } = filesData;
                  if (code) onCodeUpdate?.(code, "ai-finish");
                  if (schema) onSchemaUpdate?.(schema, "ai-finish");

                  const fetchedFiles: FileChangeEntry[] = [];
                  if (code)
                    fetchedFiles.push({
                      path: "index.tsx",
                      action: "modified",
                      content: code,
                    });
                  if (schema)
                    fetchedFiles.push({
                      path: "config.schema.json",
                      action: "modified",
                      content: schema,
                    });
                  if (fetchedFiles.length > 0) onFilesChange?.(fetchedFiles);
                }
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "AI 完成收尾失败";
              console.warn(
                "[AIChat] stream finish finalization failed:",
                error,
              );
              onDiagnosticEvent?.({
                name: "ai.stream_finish_finalization_failed",
                traceId,
                level: "warn",
                details: { message },
              });
            } finally {
              completeRunAndDrain();
            }
          },

          onConnectionError: () => {
            // 连接未建立时的错误处理：重置状态并显示错误
            if (ledgerAck) {
              void cancelConversationRun(
                getConfiguredAgentClient(),
                ledgerAck.conversationId,
                ledgerAck.runId,
              ).catch((error) => {
                console.warn(
                  "[ConversationLedger] failed to cancel run after connection loss",
                  error,
                );
              });
            }
            activeLedgerRunRef.current = null;
            stopSilenceTracking();
            const normalized = normalizeAiError("WebSocket connection error", {
              fallbackCode: "AGENT_CONNECTION_ERROR",
            });
            const errorMessage: ChatMessage = {
              id: createLocalId("error"),
              role: "assistant",
              content: normalized.userMessage,
            };
            setMessages((prev) => [
              ...appendMessageBeforeQueued(
                updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
                errorMessage,
              ),
            ]);
            completeRunAndDrain(normalized.userMessage);
          },

          onError: (error) => {
            activeLedgerRunRef.current = null;
            streamService.stopKeepalive();
            // P5 Layer 3: auto-retry once on AGENT_BUSY
            if (error.code === "AGENT_BUSY" && !busyRetryAttemptedRef.current) {
              busyRetryAttemptedRef.current = true;
              streamService.close();
              completeRunAndDrain();
              setTimeout(() => {
                void startMessageRun(
                  trimmedMessage,
                  images,
                  files,
                  runOptions,
                  startOptions,
                );
              }, 200);
              return;
            }
            onDiagnosticEvent?.({
              name: "ai.stream_error",
              traceId,
              level: "error",
              details: {
                code: error.code,
                message: error.message,
                fileCount: error.files?.length ?? 0,
              },
            });
            const isModelError =
              error.code === "SESSION_NOT_FOUND" ||
              error.code === "GET_MODELS_ERROR";
            if (isModelError) {
              onModelStateError?.();
              completeRunAndDrain();
              return;
            }

            if (error.files && error.files.length > 0) {
              processFileChanges(error.files, {
                onCodeUpdate,
                onSchemaUpdate,
                onFilesChange,
              });
            }

            const normalizedMessage = normalizeAiError(error).userMessage;
            const currentMsg = currentMessageRef.current;
            const errorMessage: ChatMessage = hasVisibleAssistantContent(
              currentMsg,
            )
              ? {
                  id: currentMsg.id || createLocalId("assistant"),
                  role: "assistant",
                  content:
                    currentMsg.content ||
                    accumulatedContent ||
                    normalizedMessage,
                  parts: [
                    ...(currentMsg.parts || []),
                    {
                      type: "text",
                      content: `\n\n${normalizedMessage}`,
                    },
                  ],
                }
              : {
                  id: createLocalId("error"),
                  role: "assistant",
                  content: normalizedMessage,
                };
            setMessages((prev) => [
              ...appendMessageBeforeQueued(
                updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
                errorMessage,
              ),
            ]);
            setStreamContent("");
            setCurrentMessage(DEFAULT_CURRENT_MESSAGE);
            stopSilenceTracking();
            completeRunAndDrain(normalizedMessage);
          },
        });

        await streamService.waitForConnection(stream);

        // 等待 L3 / capabilities 拼装完成再发送，确保能力缺失能被当前流程捕获
        await streamService.sendMessage(
          outboundMessage,
          workingDir,
          images,
          demoId,
          activeViewContext,
          selectedModelId,
          projectId,
          files?.length ? files : undefined,
          viewerContext,
          referencedProjects,
          ledgerAck
            ? {
                conversationId: ledgerAck.conversationId,
                messageId: ledgerAck.messageId,
                runId: ledgerAck.runId,
                assistantMessageId: ledgerAck.assistantMessageId,
                conversationRevision: ledgerAck.conversationRevision,
              }
            : undefined,
        );
        onDiagnosticEvent?.({
          name: "ai.message_sent",
          traceId,
          details: {
            messageId: displayMessageId,
            mode: "websocket",
          },
        });
        streamService.startKeepalive();
        startSilenceTracking();
      } catch (error) {
        if (mode === "workbench" && !acceptedLedgerAck) {
          setMessages((current) =>
            current.map((message) =>
              message.id === displayMessageId && message.role === "user"
                ? { ...message, syncStatus: "failed" }
                : message,
            ),
          );
        }
        if (beforeSendFailed) {
          const diagnosticDetails = getErrorDiagnosticDetails(
            error,
            "同步工作区失败",
          );
          const normalized = normalizeAiError(error, {
            fallbackMessage: "发送前同步工作区失败，请保存或刷新后重试。",
          });
          onDiagnosticEvent?.({
            name: "ai.before_send_failed",
            traceId,
            level: "error",
            details: diagnosticDetails,
          });
          const errorMessage: ChatMessage = {
            id: createLocalId("error"),
            role: "assistant",
            content: normalized.userMessage,
          };
          setMessages((prev) => [
            ...appendMessageBeforeQueued(
              updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
              errorMessage,
            ),
          ]);
          setStreamContent("");
          stopSilenceTracking();
          completeRunAndDrain();
          return;
        }

        if (mode === "workbench" && acceptedLedgerAck) {
          try {
            await cancelConversationRun(
              getConfiguredAgentClient(),
              acceptedLedgerAck.conversationId,
              acceptedLedgerAck.runId,
            );
          } catch (cancelError) {
            console.warn(
              "[ConversationLedger] failed to cancel an ACKed run after delivery failure",
              cancelError,
            );
          }
        }

        onDiagnosticEvent?.({
          name: "ai.websocket_failed",
          traceId,
          level: "warn",
          details: {
            message: error instanceof Error ? error.message : "WebSocket 失败",
          },
        });
        if (error instanceof MissingTransactionalDeleteToolsError) {
          streamServiceRef.current?.close();
          const errorMessage: ChatMessage = {
            id: createLocalId("error"),
            role: "assistant",
            content: error.message,
          };
          setMessages((prev) => [
            ...appendMessageBeforeQueued(
              updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
              errorMessage,
            ),
          ]);
          setStreamContent("");
          stopSilenceTracking();
          completeRunAndDrain();
          return;
        }

        if (mode === "workbench") {
          const normalized = normalizeAiError(error, {
            fallbackMessage: "消息未能通过可靠对话通道执行，请重试。",
          });
          setMessages((prev) => [
            ...appendMessageBeforeQueued(
              updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
              {
                id: createLocalId("error"),
                role: "assistant",
                content: normalized.userMessage,
              },
            ),
          ]);
          setStreamContent("");
          stopSilenceTracking();
          streamServiceRef.current?.close();
          completeRunAndDrain();
          return;
        }

        console.warn("WebSocket 失败，使用非流式模式:", error);

        if (isBulkPageDeletionRequest(userMessage)) {
          const errorMessage: ChatMessage = {
            id: createLocalId("error"),
            role: "assistant",
            content:
              "当前无法建立安全的事务化删除通道。请确认 Agent Service 已重启并刷新页面后再试。",
          };
          setMessages((prev) => [
            ...appendMessageBeforeQueued(
              updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
              errorMessage,
            ),
          ]);
          setStreamContent("");
          stopSilenceTracking();
          streamServiceRef.current?.close();
          completeRunAndDrain();
          return;
        }

        try {
          const agentClient = getConfiguredAgentClient();

          const activeViewPrefix =
            buildActiveViewContextPrefix(activeViewContext);
          const content = activeViewPrefix
            ? `${activeViewPrefix}${outboundMessage}`
            : outboundMessage;

          const result = await agentClient.sendMessage(
            agentSessionId,
            content,
            {
              projectId,
              demoId,
              workingDir,
              model: selectedModelId,
              images,
              options: {
                stream: false,
                model: selectedModelId,
              },
            },
          );
          onDiagnosticEvent?.({
            name: "ai.message_sent",
            traceId,
            details: {
              messageId: displayMessageId,
              mode: "http_fallback",
            },
          });

          if (!result.success) {
            throw new Error(result.error?.message || "Agent 请求失败");
          }

          const aiReply =
            result.data?.content || "抱歉，我没有收到有效的回复。";

          const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: aiReply,
          };

          const httpUpdatedMessages = appendMessageBeforeQueued(
            updateAutoRepairStatus(
              messagesRef.current,
              autoRepairMessageId,
              "completed",
            ),
            assistantMessage,
          );
          setMessages(httpUpdatedMessages);

          if (result.data?.files && result.data.files.length > 0) {
            for (const f of result.data.files) {
              if (f.path && f.path.endsWith(".md")) {
                memoryFilePathsRef.current.add(f.path);
              }
            }
            onFilesChange?.(result.data.files);
            const { codeUpdated, schemaUpdated } = extractCodeAndSchemaUpdates(
              result.data.files,
              {
                onCodeUpdate,
                onSchemaUpdate,
              },
            );

            if (!codeUpdated || !schemaUpdated) {
              const filesData = await fetchSessionFiles(sessionId, demoId);
              if (filesData) {
                const { code, schema } = filesData;
                if (code && !codeUpdated) onCodeUpdate?.(code);
                if (schema && !schemaUpdated) onSchemaUpdate?.(schema);
              }
            }
          } else {
            const filesData = await fetchSessionFiles(sessionId, demoId);
            if (filesData) {
              const { code, schema } = filesData;
              if (code) onCodeUpdate?.(code);
              if (schema) onSchemaUpdate?.(schema);
            }
          }
        } catch (httpError) {
          const normalized = normalizeAiError(httpError);
          const errorMessage: ChatMessage = {
            id: createLocalId("error"),
            role: "assistant",
            content: normalized.userMessage,
          };
          setMessages((prev) => [
            ...appendMessageBeforeQueued(
              updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
              errorMessage,
            ),
          ]);
        } finally {
          stopSilenceTracking();
          streamServiceRef.current?.close();
          completeRunAndDrain();
        }
      }
    },
    [
      agentSessionId,
      sessionId,
      workingDir,
      projectId,
      demoId,
      activeViewContext,
      onCodeUpdate,
      onSchemaUpdate,
      onFilesChange,
      onWorkspaceMutationCommitted,
      setMessages,
      setIsStreaming,
      setStreamContent,
      setCurrentMessage,
      messagesRef,
      currentMessageRef,
      onModelsEvent,
      onModelStateError,
      selectedModelId,
      onDiagnosticEvent,
      beforeSend,
      markActivity,
      startSilenceTracking,
      stopSilenceTracking,
      completeRunAndDrain,
      startTitleGeneration,
      recoverConversationOutbox,
    ],
  );

  const drainQueue = useCallback(() => {
    if (activeRunRef.current || !agentSessionId) return;

    const [nextQueuedMessage, ...remainingMessages] = queuedMessagesRef.current;
    if (!nextQueuedMessage) return;

    queuedMessagesRef.current = remainingMessages;
    void startMessageRun(
      nextQueuedMessage.content,
      nextQueuedMessage.images,
      nextQueuedMessage.files,
      nextQueuedMessage.runOptions,
      {
        appendDisplayMessage: false,
        displayMessageId: nextQueuedMessage.displayMessageId,
      },
    );
  }, [agentSessionId, startMessageRun]);

  useEffect(() => {
    drainQueueRef.current = drainQueue;
  }, [drainQueue]);

  const handleSend = useCallback(
    (
      userMessage: string,
      images?: ImageAttachment[],
      runOptions?: SendMessageRunOptions,
      files?: FileAttachment[],
      startOptions?: StartMessageRunOptions,
    ) => {
      const trimmedMessage = userMessage.trim();
      if (!trimmedMessage || !agentSessionId) return;

      const source = runOptions?.source ?? "user";
      const isSystemAutoRepair = source === "system_auto_repair";
      const isVisualProperty = source === "visual_property";
      const dedupeKey = isSystemAutoRepair
        ? createSystemAutoRepairDedupeKey(
            runOptions?.displayMessage?.title || DEFAULT_AUTO_REPAIR_TITLE,
            trimmedMessage,
          )
        : undefined;
      if (
        dedupeKey &&
        (activeRunDedupeKeyRef.current === dedupeKey ||
          queuedMessagesRef.current.some(
            (message) => message.dedupeKey === dedupeKey,
          ))
      ) {
        return;
      }

      if (
        source === "user" &&
        (pendingPermissionRequest?.toolCall.approvalKind === "plan_approval" ||
          pendingPermissionRequest?.toolCall.approvalKind ===
            "config_visibility")
      ) {
        streamServiceRef.current?.sendPermissionResponse(
          pendingPermissionRequest.toolCall.toolCallId,
          "reject_once",
        );
        streamServiceRef.current?.close();
        stopSilenceTracking();
        clearPendingPermission("用户已开始新的对话。");
        activeRunRef.current = false;
        activeRunDedupeKeyRef.current = null;
        setIsStreaming(false);
      }

      if (activeRunRef.current) {
        const queueId = createLocalId("queued");
        const displayMessageId = createLocalId(
          isSystemAutoRepair ? "auto-repair" : "user",
        );
        queuedMessagesRef.current = [
          ...queuedMessagesRef.current,
          {
            queueId,
            content: trimmedMessage,
            images,
            files,
            runOptions,
            createdAt: Date.now(),
            displayMessageId,
            dedupeKey,
          },
        ];

        setMessages((prev) => [
          ...prev,
          isSystemAutoRepair
            ? {
                id: displayMessageId,
                role: "system",
                kind: "auto_repair",
                content:
                  runOptions?.displayMessage?.title ||
                  DEFAULT_AUTO_REPAIR_TITLE,
                queueId,
                queueStatus: "queued",
                autoRepair: {
                  status: "running",
                  title:
                    runOptions?.displayMessage?.title ||
                    DEFAULT_AUTO_REPAIR_TITLE,
                  summary:
                    runOptions?.displayMessage?.summary ||
                    "AI 将尝试恢复当前页面预览",
                  debugDetail: runOptions?.displayMessage?.debugDetail,
                  hiddenPrompt: trimmedMessage,
                },
              }
            : isVisualProperty
              ? {
                  id: displayMessageId,
                  role: "user",
                  content: trimmedMessage,
                  queueId,
                  queueStatus: "queued",
                  visualProperty: runOptions?.visualPropertyDisplayMessage ?? {
                    title: "可视化修改已发送给 AI",
                    summary: "AI 将根据当前选区和属性变更修改页面。",
                    hiddenPrompt: trimmedMessage,
                  },
                }
              : {
                  id: displayMessageId,
                  role: "user",
                  content: trimmedMessage,
                  queueId,
                  queueStatus: "queued",
                  inlineRefs: runOptions?.inlineRefs,
                  parts: buildAttachmentParts(images, files),
                },
        ]);
        return;
      }

      void startMessageRun(
        trimmedMessage,
        images,
        files,
        runOptions,
        startOptions,
      );
    },
    [
      agentSessionId,
      clearPendingPermission,
      pendingPermissionRequest,
      setIsStreaming,
      setMessages,
      startMessageRun,
      stopSilenceTracking,
    ],
  );

  const handleCancelQueuedMessage = useCallback(
    (queueId: string) => {
      queuedMessagesRef.current = queuedMessagesRef.current.filter(
        (message) => message.queueId !== queueId,
      );
      setMessages((prev) =>
        prev.filter((message) => message.queueId !== queueId),
      );
    },
    [setMessages],
  );

  const handlePermissionResponse = useCallback(
    (optionId: string, responseContent?: string) => {
      if (pendingPermissionRequest) {
        streamServiceRef.current?.sendPermissionResponse(
          pendingPermissionRequest.toolCall.toolCallId,
          optionId,
          responseContent,
        );
        if (
          pendingPermissionRequest.toolCall.approvalKind === "plan_approval" ||
          pendingPermissionRequest.toolCall.approvalKind === "config_visibility"
        ) {
          activeRunRef.current = true;
          setIsStreaming(true);
          startSilenceTracking();
        }
      }
      pendingPermissionRef.current = null;
      setPendingPermissionRequest(null);
    },
    [pendingPermissionRequest, setIsStreaming, startSilenceTracking],
  );

  const handlePermissionCancel = useCallback(() => {
    handlePermissionResponse("reject_once");
  }, [handlePermissionResponse]);

  const handleUserChoiceResponse = useCallback(
    (requestId: string, choice: UserChoiceResponse) => {
      const updateMessage = (message: ChatMessage): ChatMessage => {
        const parts = message.parts || [];
        if (
          !parts.some(
            (part) =>
              part.type === "user_choice" && part.requestId === requestId,
          )
        ) {
          return message;
        }
        return {
          ...message,
          parts: updateUserChoicePart(parts, requestId, choice),
        };
      };

      setCurrentMessage((prev) => updateMessage(prev));
      setMessages((prev) => prev.map((message) => updateMessage(message)));
      streamServiceRef.current?.sendUserChoiceResponse(requestId, choice);
    },
    [setCurrentMessage, setMessages],
  );

  const handleCancel = useCallback(
    (_streamContent: string, _currentMessage: ChatMessage) => {
      const activeLedgerRun = activeLedgerRunRef.current;
      if (activeLedgerRun) {
        void getConfiguredAgentClient()
          .cancelRun(activeLedgerRun.conversationId, activeLedgerRun.runId)
          .catch((error) => {
            console.warn(
              "[ConversationLedger] Failed to persist cancellation request:",
              error,
            );
          });
      }
      streamServiceRef.current?.close();
      stopSilenceTracking();
      setPlan(EMPTY_PLAN);
      setStreamContent("");
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
      completeRunAndDrain("用户已取消当前运行。");
      activeLedgerRunRef.current = null;
    },
    [
      setMessages,
      setStreamContent,
      setCurrentMessage,
      stopSilenceTracking,
      completeRunAndDrain,
    ],
  );

  const handleRegenerate = useCallback(
    async (targetAssistantId: string) => {
      const msgs = messagesRef.current;
      const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
      const currentAssistantMatches =
        targetIndex < 1 && currentMessageRef.current?.id === targetAssistantId;
      if (targetIndex < 1 && !currentAssistantMatches) return;
      const truncated = targetIndex >= 1 ? msgs.slice(0, targetIndex) : msgs;
      const userMsg = truncated
        .slice()
        .reverse()
        .find((m) => m.role === "user");
      if (!userMsg?.id) return;
      const images = extractImagesFromMessage(userMsg);

      if (userMsg.syncStatus === "failed") {
        const failedUserIndex = msgs.findIndex(
          (message) => message.id === userMsg.id,
        );
        setMessages(
          failedUserIndex >= 0 ? msgs.slice(0, failedUserIndex) : msgs,
        );
        handleSend(userMsg.content, images);
        return;
      }

      try {
        await beforeSend?.();
        const client = getConfiguredAgentClient();
        const current = await client.loadConversation(sessionId);
        await client.supersede({
          conversationId: sessionId,
          afterMessageId: userMsg.id,
          expectedRevision: current.conversation.revision,
        });
        const retryAck = await client.retryRun(sessionId, userMsg.id);
        streamServiceRef.current?.close();
        stopSilenceTracking();
        activeRunRef.current = false;
        setIsStreaming(false);
        setStreamContent("");
        setCurrentMessage(DEFAULT_CURRENT_MESSAGE);
        setMessages(truncated);
        handleSend(userMsg.content, images, undefined, undefined, {
          ledgerAck: retryAck,
          skipBeforeSend: true,
          skipUserMessageDisplay: true,
        });
      } catch (error) {
        console.error("[ConversationLedger] regenerate failed", error);
      }
    },
    [
      currentMessageRef,
      messagesRef,
      setCurrentMessage,
      setIsStreaming,
      setMessages,
      setStreamContent,
      sessionId,
      stopSilenceTracking,
      handleSend,
      beforeSend,
    ],
  );

  const handleRollback = useCallback(
    async (targetAssistantId: string) => {
      const msgs = messagesRef.current;
      const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
      if (targetIndex < 1) return;

      try {
        await fetch(`/api/agent/${agentSessionId}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistantMessageId: targetAssistantId }),
        });
      } catch (e) {
        console.warn("[Rollback] File rollback failed:", e);
      }

      const truncated = msgs.slice(0, targetIndex);
      const anchorMessageId = truncated.at(-1)?.id ?? null;
      try {
        const client = getConfiguredAgentClient();
        const current = await client.loadConversation(sessionId);
        await client.supersede({
          conversationId: sessionId,
          afterMessageId: anchorMessageId,
          expectedRevision: current.conversation.revision,
        });
        setMessages(truncated);
      } catch (error) {
        console.error("[ConversationLedger] rollback history failed", error);
      }
    },
    [messagesRef, setMessages, sessionId, agentSessionId],
  );

  const handleEditResend = useCallback(
    async (targetMessageId: string, newContent: string) => {
      if (!newContent.trim()) return;

      const msgs = messagesRef.current;
      const msgIndex = msgs.findIndex((m) => m.id === targetMessageId);
      if (msgIndex < 0) return;

      const truncated = msgs.slice(0, msgIndex);
      const msg = msgs[msgIndex];
      const images = extractImagesFromMessage(msg);

      try {
        await beforeSend?.();
        const client = getConfiguredAgentClient();
        const current = await client.loadConversation(sessionId);
        await client.supersede({
          conversationId: sessionId,
          afterMessageId: truncated.at(-1)?.id ?? null,
          expectedRevision: current.conversation.revision,
        });
        setMessages(truncated);
        handleSend(newContent, images, undefined, undefined, {
          skipBeforeSend: true,
        });
      } catch (error) {
        console.error("[ConversationLedger] edit and resend failed", error);
      }
    },
    [messagesRef, setMessages, sessionId, handleSend, beforeSend],
  );

  return {
    plan,
    setPlan,
    contextCompactionNotice,
    pendingPermissionRequest,
    silenceSeconds,
    memoryFilePathsRef,
    handleSend,
    handleCancel,
    handleRegenerate,
    handleRollback,
    handleEditResend,
    handleCancelQueuedMessage,
    handlePermissionResponse,
    handlePermissionCancel,
    handleUserChoiceResponse,
  };
}
