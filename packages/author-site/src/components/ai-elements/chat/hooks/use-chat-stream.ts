"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/components/ai-elements";
import type {
  StreamEvent,
  FileAttachment,
  ImageAttachment,
} from "@workbench/agent-client";
import { normalizeAiError } from "@workbench/shared";
import {
  MissingTransactionalDeleteToolsError,
  StreamService,
  type PermissionRequest,
  type UserChoiceRequest,
  type UserChoiceResponse,
} from "../services/stream-service";
import type { PlanItem, PlanItemStatus, PlanState } from "../chat-plan";
import {
  updateTextPart,
  addThoughtPart,
  addToolPart,
  updateToolPart,
} from "../utils/chat-stream-utils";
import {
  processFileChanges,
  extractCodeAndSchemaUpdates,
  type FileChangeEntry,
} from "../utils/chat-file-utils";
import {
  persistMessages,
  updateSessionTitle,
  fetchSessionFiles,
} from "../services/message-service";
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "@/lib/agent/active-view-context";

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

const MAX_CONTEXT_HISTORY_MESSAGES = 8;

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

interface SendMessageRunOptions {
  source?: "user" | "system_auto_repair" | "visual_property";
  displayMessage?: NonNullable<ChatMessage["autoRepair"]>;
  visualPropertyDisplayMessage?: NonNullable<ChatMessage["visualProperty"]>;
}

interface StartMessageRunOptions {
  appendDisplayMessage?: boolean;
  displayMessageId?: string;
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

function buildAttachmentParts(
  images?: ImageAttachment[],
  files?: FileAttachment[],
): NonNullable<ChatMessage["parts"]> {
  return [
    ...(images?.map((img) => ({
      type: "image" as const,
      url: `data:${img.mimeType};base64,${img.data}`,
    })) || []),
    ...(files?.map((file) => ({
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

interface UseChatStreamOptions {
  sessionId: string;
  agentSessionId: string;
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
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  setIsStreaming: (value: boolean) => void;
  setStreamContent: (updater: string | ((prev: string) => string)) => void;
  currentMessageRef: React.MutableRefObject<ChatMessage>;
  setCurrentMessage: (
    updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
  ) => void;
  onModelsEvent?: (event: StreamEvent) => void;
  onModelStateError?: () => void;
  selectedModelId?: string;
  onDiagnosticEvent?: (event: {
    name: string;
    traceId?: string;
    level?: "info" | "warn" | "error";
    details?: Record<string, unknown>;
  }) => void;
  beforeSend?: () => Promise<void> | void;
  externalStreamServiceRef?: React.MutableRefObject<StreamService | null>;
}

export function useChatStream(options: UseChatStreamOptions) {
  const {
    sessionId,
    agentSessionId,
    workingDir,
    projectId,
    demoId,
    activeViewContext,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
    messagesRef,
    setMessages,
    setIsStreaming,
    setStreamContent,
    currentMessageRef,
    setCurrentMessage,
    onModelsEvent,
    onModelStateError,
    selectedModelId,
    onDiagnosticEvent,
    beforeSend,
    externalStreamServiceRef,
  } = options;

  // 页面隐藏时兜底持久化（比 beforeunload 更可靠）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (throttlePersistTimerRef.current) {
          clearTimeout(throttlePersistTimerRef.current);
          throttlePersistTimerRef.current = null;
        }
        void persistMessages(
          sessionId,
          messagesRef.current.filter((m) => !m.queueStatus),
        ).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionId, messagesRef]);

  const [plan, setPlan] = useState<PlanState>(EMPTY_PLAN);
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
  const activeRunDedupeKeyRef = useRef<string | null>(null);
  const busyRetryAttemptedRef = useRef(false);
  const drainQueueRef = useRef<() => void>(() => {});
  const previousSessionIdRef = useRef(sessionId);
  const lastPersistAtRef = useRef<number>(0);
  const throttlePersistTimerRef = useRef<NodeJS.Timeout | null>(null);

  const throttledPersistRef = useRef<() => void>(() => {});
  throttledPersistRef.current = () => {
    const now = Date.now();
    if (now - lastPersistAtRef.current < 5000) {
      if (!throttlePersistTimerRef.current) {
        throttlePersistTimerRef.current = setTimeout(() => {
          throttlePersistTimerRef.current = null;
          lastPersistAtRef.current = Date.now();
          void persistMessages(
            sessionId,
            messagesRef.current.filter((m) => !m.queueStatus),
          ).catch(() => {});
        }, 5000);
      }
      return;
    }
    lastPersistAtRef.current = now;
    void persistMessages(
      sessionId,
      messagesRef.current.filter((m) => !m.queueStatus),
    ).catch(() => {});
  };

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

  // 清理流 + 组件卸载时持久化
  useEffect(() => {
    return () => {
      activeRunRef.current = false;
      activeRunDedupeKeyRef.current = null;
      queuedMessagesRef.current = [];
      streamServiceRef.current?.close();
      stopSilenceTracking();
      if (throttlePersistTimerRef.current) {
        clearTimeout(throttlePersistTimerRef.current);
        throttlePersistTimerRef.current = null;
      }
      // 组件卸载时持久化当前消息，确保切换页面后对话可恢复
      void persistMessages(
        sessionId,
        messagesRef.current.filter((m) => !m.queueStatus),
      ).catch(() => {});
    };
  }, [sessionId, messagesRef, stopSilenceTracking]);

  // 会话切换时关闭旧流
  useEffect(() => {
    if (previousSessionIdRef.current !== sessionId) {
      // 切换前对旧 session 的消息做一次持久化
      const oldSessionId = previousSessionIdRef.current;
      if (oldSessionId) {
        void persistMessages(
          oldSessionId,
          messagesRef.current.filter((m) => !m.queueStatus),
        ).catch(() => {});
      }
      // 清理旧 session 的节流定时器
      if (throttlePersistTimerRef.current) {
        clearTimeout(throttlePersistTimerRef.current);
        throttlePersistTimerRef.current = null;
      }
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

  const completeRunAndDrain = useCallback(() => {
    activeRunRef.current = false;
    activeRunDedupeKeyRef.current = null;
    setIsStreaming(false);
    setTimeout(() => {
      drainQueueRef.current();
    }, 0);
  }, [setIsStreaming]);

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

      const source = runOptions?.source ?? "user";
      const trimmedMessage = userMessage.trim();
      const traceId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isSystemAutoRepair = source === "system_auto_repair";
      const isVisualProperty = source === "visual_property";
      const conversationHistoryPrefix = buildConversationHistoryPrefix(
        messagesRef.current,
      );
      const outboundMessage = conversationHistoryPrefix
        ? `${conversationHistoryPrefix}${userMessage}`
        : userMessage;
      activeRunDedupeKeyRef.current = isSystemAutoRepair
        ? createSystemAutoRepairDedupeKey(
            runOptions?.displayMessage?.title || DEFAULT_AUTO_REPAIR_TITLE,
            trimmedMessage,
          )
        : null;
      const isFirstUserMessage =
        !isSystemAutoRepair &&
        messagesRef.current.every((message) => message.role !== "user");
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

      // 用户消息加入 state 后立即持久化（fire-and-forget）
      void persistMessages(
        sessionId,
        messagesRef.current.filter((m) => !m.queueStatus),
      ).catch(() => {});

      let beforeSendFailed = false;

      try {
        const assistantMessageId = `assistant-${Date.now()}`;
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

        try {
          await beforeSend?.();
        } catch (error) {
          beforeSendFailed = true;
          throw error;
        }

        const streamService = new StreamService();
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
              parts: updateTextPart(
                prev.parts || [],
                content,
                accumulatedContent,
              ),
            }));
            // 流式回复过程中节流持久化中间状态
            throttledPersistRef.current();
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
            // 知识库文档创建后通知前端刷新
            const details = update.details as { knowledgeDocumentCreated?: boolean } | undefined;
            if (details?.knowledgeDocumentCreated) {
              window.dispatchEvent(new Event("knowledge-updated"));
            }
          },

          onPermission: (request) => {
            if (request.toolCall.approvalKind === "plan_approval") {
              stopSilenceTracking();
              const currentMsg = currentMessageRef.current;
              if (hasVisibleAssistantContent(currentMsg)) {
                setMessages((prev) =>
                  appendMessageBeforeQueued(prev, {
                    id: currentMsg.id || `assistant-${Date.now()}`,
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

          onFinish: async (result) => {
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
              const assistantMessage: ChatMessage = {
                id: currentMsg.id || assistantMessageId,
                role: "assistant",
                content:
                  accumulatedContent ||
                  result.content ||
                  (hasStructuredParts ? "" : "抱歉，我没有收到有效的回复。"),
                parts: currentMsg.parts,
              };

              const messagesWithAutoRepairStatus = updateAutoRepairStatus(
                messagesRef.current,
                autoRepairMessageId,
                "completed",
              );
              const updatedMessages = appendMessageBeforeQueued(
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

              // 先清理节流定时器，避免冗余并发写入
              if (throttlePersistTimerRef.current) {
                clearTimeout(throttlePersistTimerRef.current);
                throttlePersistTimerRef.current = null;
              }
              await persistMessages(
                sessionId,
                updatedMessages.filter((message) => !message.queueStatus),
              );
              if (!isSystemAutoRepair) {
                await updateSessionTitle(
                  sessionId,
                  userMessage,
                  isFirstUserMessage,
                );
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
            stopSilenceTracking();
            const normalized = normalizeAiError("WebSocket connection error", {
              fallbackCode: "AGENT_CONNECTION_ERROR",
            });
            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: normalized.userMessage,
            };
            setMessages((prev) => [
              ...appendMessageBeforeQueued(
                updateAutoRepairStatus(prev, autoRepairMessageId, "failed"),
                errorMessage,
              ),
            ]);
            completeRunAndDrain();
          },

          onError: (error) => {
            streamService.stopKeepalive();
            // P5 Layer 3: auto-retry once on AGENT_BUSY
            if (
              error.code === "AGENT_BUSY" &&
              !busyRetryAttemptedRef.current
            ) {
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
                  id: currentMsg.id || `assistant-${Date.now()}`,
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
                  id: `error-${Date.now()}`,
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
            completeRunAndDrain();
          },
        });

        await streamService.waitForConnection(stream);

        // 等待 L3 / capabilities 拼装完成再发送，确保能力缺失能被当前流程捕获
        if (projectId) {
          if (files?.length) {
            await streamService.sendMessage(
              outboundMessage,
              workingDir,
              images,
              demoId,
              activeViewContext,
              selectedModelId,
              projectId,
              files,
            );
          } else {
            await streamService.sendMessage(
              outboundMessage,
              workingDir,
              images,
              demoId,
              activeViewContext,
              selectedModelId,
              projectId,
            );
          }
        } else {
          if (files?.length) {
            await streamService.sendMessage(
              outboundMessage,
              workingDir,
              images,
              demoId,
              activeViewContext,
              selectedModelId,
              undefined,
              files,
            );
          } else {
            await streamService.sendMessage(
              outboundMessage,
              workingDir,
              images,
              demoId,
              activeViewContext,
              selectedModelId,
            );
          }
        }
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
            id: `error-${Date.now()}`,
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
            id: `error-${Date.now()}`,
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

        console.warn("WebSocket 失败，使用非流式模式:", error);

        if (isBulkPageDeletionRequest(userMessage)) {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
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
          const { getAgentClient } = await import("@/lib/agent-client");
          const agentClient = getAgentClient();

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
            id: `assistant-${Date.now()}`,
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

          await persistMessages(
            sessionId,
            httpUpdatedMessages.filter((message) => !message.queueStatus),
          );

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
            id: `error-${Date.now()}`,
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
        pendingPermissionRequest?.toolCall.approvalKind === "plan_approval"
      ) {
        streamServiceRef.current?.sendPermissionResponse(
          pendingPermissionRequest.toolCall.toolCallId,
          "reject_once",
        );
        streamServiceRef.current?.close();
        stopSilenceTracking();
        setPendingPermissionRequest(null);
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
                  parts: buildAttachmentParts(images, files),
                },
        ]);
        return;
      }

      void startMessageRun(trimmedMessage, images, files, runOptions);
    },
    [
      agentSessionId,
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
          pendingPermissionRequest.toolCall.approvalKind === "plan_approval"
        ) {
          activeRunRef.current = true;
          setIsStreaming(true);
          startSilenceTracking();
        }
      }
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
    (streamContent: string, currentMessage: ChatMessage) => {
      streamServiceRef.current?.close();
      stopSilenceTracking();
      setPlan(EMPTY_PLAN);
      if (
        streamContent ||
        (currentMessage.parts && currentMessage.parts.length > 0)
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: streamContent || "已取消",
            parts: currentMessage.parts,
          },
        ]);
        setStreamContent("");
      }
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
      completeRunAndDrain();
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
    (targetAssistantId: string) => {
      const msgs = messagesRef.current;
      const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
      if (targetIndex < 1) {
        const currentAssistantId = currentMessageRef.current?.id;
        if (currentAssistantId !== targetAssistantId) return;

        const userMsg = msgs
          .slice()
          .reverse()
          .find((m) => m.role === "user");
        if (!userMsg) return;

        streamServiceRef.current?.close();
        stopSilenceTracking();
        activeRunRef.current = false;
        setIsStreaming(false);
        setStreamContent("");
        setCurrentMessage({
          role: "assistant",
          content: "",
          parts: [],
        });

        const imageParts =
          userMsg.parts?.filter((p) => p.type === "image") || [];
        const images: ImageAttachment[] | undefined =
          imageParts.length > 0
            ? imageParts
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
                .filter((img): img is ImageAttachment => img !== undefined)
            : undefined;

        handleSend(userMsg.content, images);
        return;
      }

      const userMsg = msgs
        .slice(0, targetIndex)
        .reverse()
        .find((m) => m.role === "user");
      if (!userMsg) return;

      const truncated = msgs.slice(0, targetIndex);
      setMessages(truncated);
      void persistMessages(
        sessionId,
        truncated.filter((m) => !m.queueStatus),
      ).catch(() => {});

      const imageParts = userMsg.parts?.filter((p) => p.type === "image") || [];
      const images: ImageAttachment[] | undefined =
        imageParts.length > 0
          ? imageParts
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
              .filter((img): img is ImageAttachment => img !== undefined)
          : undefined;

      handleSend(userMsg.content, images);
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
      setMessages(truncated);
      await persistMessages(sessionId, truncated);
    },
    [messagesRef, setMessages, sessionId, agentSessionId],
  );

  const handleEditResend = useCallback(
    (targetMessageId: string, newContent: string) => {
      if (!newContent.trim()) return;

      const msgs = messagesRef.current;
      const msgIndex = msgs.findIndex((m) => m.id === targetMessageId);
      if (msgIndex < 0) return;

      const truncated = msgs.slice(0, msgIndex);
      setMessages(truncated);
      void persistMessages(
        sessionId,
        truncated.filter((m) => !m.queueStatus),
      ).catch(() => {});

      const msg = msgs[msgIndex];
      const imageParts = msg.parts?.filter((p) => p.type === "image") || [];
      const images: ImageAttachment[] | undefined =
        imageParts.length > 0
          ? imageParts
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
              .filter((img): img is ImageAttachment => img !== undefined)
          : undefined;

      handleSend(newContent, images);
    },
    [messagesRef, setMessages, sessionId, handleSend],
  );

  return {
    plan,
    setPlan,
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
