import {
  AgentStream,
  type AgentMode,
  type FileAttachment,
  type StreamEvent,
  type ImageAttachment,
  type RunSummary,
  type ViewerContext,
  type PreviewObservationHandler,
  type PreviewRegistration,
} from "@workbench/agent-client";
import { parseToolCallFromEvent } from "../utils/chat-stream-utils";
import type { ToolUpdateEvent } from "../utils/chat-stream-utils";
import {
  getAuthorContextIntegration,
  getConfiguredAgentClient,
} from "../../config";
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "../../lib/active-view-context";

export interface ToolCapabilities {
  toolVersion: number;
  toolNames: string[];
  checkpointEnabled?: boolean;
}

export class MissingTransactionalDeleteToolsError extends Error {
  constructor() {
    super(
      "Agent Service 版本过旧或当前会话未加载事务化删除工具。请重启 agent-service 并刷新创作端页面后再试。",
    );
    this.name = "MissingTransactionalDeleteToolsError";
  }
}

function extractRawUserMessage(message: string): string {
  const marker = "[历史结束]";
  const idx = message.lastIndexOf(marker);
  if (idx === -1) return message;
  return message.slice(idx + marker.length).trimStart();
}

function isBulkPageDeletionRequest(message: string): boolean {
  return (
    /删|删除|清理/.test(message) &&
    /页面|页/.test(message) &&
    /所有|全部|批量|这些|那些|多个|副本|不需要|冗余/.test(message)
  );
}

function hasTransactionalDeleteTools(
  capabilities: ToolCapabilities | null,
): boolean {
  const tools = new Set(capabilities?.toolNames || []);
  return tools.has("previewDeletePages") && tools.has("executeDeletePagePlan");
}

async function fetchToolCapabilities(): Promise<ToolCapabilities | null> {
  try {
    const response = await getConfiguredAgentClient().getToolCapabilities();
    if (!response.success || !response.data) {
      console.warn("[StreamService] getToolCapabilities 返回失败:", response);
      return null;
    }
    return response.data;
  } catch (error) {
    console.warn("[StreamService] getToolCapabilities 失败:", error);
    return null;
  }
}

export interface PermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
  }>;
  toolCall: {
    toolCallId: string;
    title?: string;
    kind?: string;
    summary?: string;
    planId?: string;
    approvalKind?: "delete" | "plan_approval" | "config_visibility";
    editable?: boolean;
    initialContent?: string;
  };
}

export interface UserChoiceOption {
  optionId: string;
  label: string;
  value?: string;
  description?: string;
}

export interface UserChoiceRequest {
  requestId: string;
  sessionId: string;
  question: string;
  description?: string;
  options: UserChoiceOption[];
  allowCustom: boolean;
}

export type UserChoiceResponse =
  | {
      type: "option";
      optionId: string;
    }
  | {
      type: "custom";
      text: string;
    }
  | {
      type: "cancel";
    };

export interface StreamResult {
  content?: string;
  files?: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }>;
  metadata?: { runSummary?: RunSummary; checkpointVersion?: number };
}

export interface StreamEventHandlers {
  onStream?: (content: string) => void;
  onThought?: (content: string) => void;
  onPlan?: (content: string) => void;
  onContextCompacted?: () => void;
  onRunSummary?: (runSummary: RunSummary) => void;
  onModels?: (event: StreamEvent) => void;
  onToolCall?: (toolCall: ReturnType<typeof parseToolCallFromEvent>) => void;
  onToolUpdate?: (update: ToolUpdateEvent) => void;
  onPermission?: (request: PermissionRequest) => void;
  onUserChoice?: (request: UserChoiceRequest) => void;
  onFinish?: (result: StreamResult) => void;
  onError?: (error: {
    message: string;
    code?: string;
    files?: Array<{
      path: string;
      action: "created" | "modified" | "deleted";
      content?: string;
    }>;
  }) => void;
  onConnectionError?: () => void;
}

export class StreamService {
  private stream: AgentStream | null = null;
  private currentSessionId: string = "";
  private handlers: StreamEventHandlers = {};
  private connectionEstablished = false;
  private finishDelivered = false;
  private messageInFlight = false;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private hasInjectedMemory = false;
  private readonly mode: AgentMode;
  private previewObservationHandler: PreviewObservationHandler | null;
  private static readonly KEEPALIVE_INTERVAL_MS = 25000;
  private static readonly RECONNECT_GRACE_MS = 10000; // 断连后等待重连的最大时间

  constructor(options?: {
    mode?: AgentMode;
    previewObservationHandler?: PreviewObservationHandler | null;
  }) {
    this.mode = options?.mode ?? "workbench";
    this.previewObservationHandler = options?.previewObservationHandler ?? null;
  }

  get isActive(): boolean {
    return this.stream !== null;
  }

  get sessionId(): string {
    return this.currentSessionId;
  }

  async connect(
    agentSessionId: string,
    sessionId: string,
  ): Promise<AgentStream> {
    this.currentSessionId = sessionId;
    this.connectionEstablished = false;
    this.finishDelivered = false;
    this.messageInFlight = false;

    const agentClient = getConfiguredAgentClient();
    const stream = agentClient.stream(agentSessionId);
    this.stream = stream;
    stream.setPreviewObservationHandler(this.previewObservationHandler);

    this.setupEventHandlers();
    return stream;
  }

  setHandlers(handlers: StreamEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  setPreviewObservationHandler(
    handler: PreviewObservationHandler | null,
  ): void {
    this.previewObservationHandler = handler;
    this.stream?.setPreviewObservationHandler(handler);
  }

  /** Register the currently rendered preview on the active AgentStream. */
  registerPreview(registration: PreviewRegistration): void {
    this.stream?.registerPreview(registration);
  }

  async waitForConnection(stream: AgentStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket 连接超时"));
      }, 3000);

      const checkConnection = () => {
        if (stream.isOpen()) {
          clearTimeout(timeout);
          stream.off("status", onStatus);
          this.connectionEstablished = true;
          resolve();
        }
      };

      const onStatus = (event: StreamEvent) => {
        if (event.status === "connected") {
          checkConnection();
        }
      };

      stream.on("status", onStatus);
      setTimeout(checkConnection, 50);
    });
  }

  async sendMessage(
    message: string,
    workingDir?: string,
    images?: ImageAttachment[],
    demoId?: string,
    activeViewContext?: ActiveViewContext,
    modelId?: string,
    projectId?: string,
    files?: FileAttachment[],
    viewerContext?: ViewerContext,
    referencedProjects?: Array<{ projectId: string; label?: string }>,
    conversation?: {
      conversationId: string;
      messageId: string;
      runId: string;
      assistantMessageId: string;
      conversationRevision: number;
    },
  ): Promise<void> {
    if (!this.stream) {
      throw new Error("Stream not connected");
    }

    // Refresh the identity immediately before every run. This covers a
    // preview that mounted before StreamService or after a reconnect, so the
    // Broker has an identity to compare before the first observation request.
    const registration =
      this.previewObservationHandler?.getPreviewRegistration?.();
    if (registration) this.stream.registerPreview(registration);

    // viewer-readonly：系统提示词、只读上下文均由 agent-service 服务端注入，
    // 客户端只透传原始问题与浏览端上下文
    if (this.mode === "viewer-readonly") {
      this.messageInFlight = true;
      this.stream.send(
        message,
        conversation?.messageId ?? `msg-${Date.now()}`,
        {
          stream: true,
          projectId,
          demoId,
          referencedProjects,
          model: modelId,
          images,
          viewerContext,
          conversation,
        },
      );
      return;
    }

    const toolCapabilities = await fetchToolCapabilities();
    const rawUserMessage = extractRawUserMessage(message);
    if (
      isBulkPageDeletionRequest(rawUserMessage) &&
      !hasTransactionalDeleteTools(toolCapabilities)
    ) {
      throw new MissingTransactionalDeleteToolsError();
    }
    const authorContext = getAuthorContextIntegration();
    let projectRules = authorContext?.buildStaticSystemPrompt({
      toolNames: toolCapabilities?.toolNames || [],
    });

    // v3.2: 异步获取 L3 上下文 + L4 记忆（通过宿主注入的 API）→ 拼到 user content 前面
    // L3 走 user message 前缀；L2 + L5 作为项目规则交给服务端安全骨架封装。
    // L4 记忆仅在首条消息注入
    // 公约注入 L2 system prompt 末尾
    const activeViewPrefix = buildActiveViewContextPrefix(activeViewContext);
    let finalContent = activeViewPrefix
      ? `${activeViewPrefix}${message}`
      : message;
    const hasDemoId = typeof demoId === "string" && demoId.length > 0;
    if (workingDir && authorContext) {
      // 重试一次：首次失败时常见原因是 dev server 刚启动 / API 路由首次编译
      let ctx = await authorContext.fetchContextPrefix(
        workingDir,
        hasDemoId ? demoId : undefined,
        projectId,
        this.currentSessionId,
        rawUserMessage,
      );
      if (!ctx.l3 && !ctx.memoryPrefix && !ctx.knowledgePrefix) {
        await new Promise((r) => setTimeout(r, 200));
        ctx = await authorContext.fetchContextPrefix(
          workingDir,
          hasDemoId ? demoId : undefined,
          projectId,
          this.currentSessionId,
          rawUserMessage,
        );
      }
      if (ctx.l3) {
        // 知识库索引：每条消息都注入（与 L3 同频，因为知识库可能被用户更新）
        const knowledgePrefix = ctx.knowledgePrefix || "";
        // L4 记忆：仅首条消息注入
        const memoryPrefix =
          !this.hasInjectedMemory && ctx.memoryPrefix ? ctx.memoryPrefix : "";
        if (memoryPrefix) {
          this.hasInjectedMemory = true;
        }
        finalContent = `${ctx.l3}${knowledgePrefix}${memoryPrefix}${activeViewPrefix}${message}`;
      } else {
        console.warn(
          "[StreamService] L3 上下文两次获取均失败，AI 将无法感知工作空间状态",
        );
      }
      // 公约注入 L2 system prompt 末尾
      const conventionSuffix = [ctx.conventionPrefix, ctx.pageConventionPrefix]
        .filter(Boolean)
        .join("");
      if (conventionSuffix && projectRules) {
        projectRules = `${projectRules}${conventionSuffix}`;
      }
    }

    this.messageInFlight = true;
    this.stream.send(
      finalContent,
      conversation?.messageId ?? `msg-${Date.now()}`,
      {
        stream: true,
        workingDir,
        projectId,
        demoId,
        referencedProjects,
        model: modelId,
        images,
        files,
        projectRules,
        conversation,
        conversationId: conversation?.conversationId,
        messageId: conversation?.messageId,
        runId: conversation?.runId,
        assistantMessageId: conversation?.assistantMessageId,
        conversationRevision: conversation?.conversationRevision,
      },
    );
  }

  sendPermissionResponse(
    permissionId: string,
    optionId: string,
    responseContent?: string,
  ): void {
    this.stream?.sendPermissionResponse(
      permissionId,
      optionId,
      responseContent,
    );
  }

  sendUserChoiceResponse(requestId: string, choice: UserChoiceResponse): void {
    this.stream?.sendUserChoiceResponse(requestId, choice);
  }

  sendModelChange(modelId: string): void {
    this.stream?.sendModelChange(modelId);
  }

  requestModels(workingDir?: string): void {
    this.stream?.requestModels({ workingDir });
  }

  forwardConsoleEntries(
    entries: Array<{ level: string; args: string; timestamp: number }>,
  ): void {
    this.stream?.sendConsoleData(entries);
  }

  close(): void {
    this.stopKeepalive();
    this.clearReconnectTimer();
    if (this.stream) {
      // P5 Layer 1: send cancel frame before closing if a message is in flight
      if (this.messageInFlight && this.stream.isOpen()) {
        try {
          this.stream.cancel();
        } catch {
          // WebSocket may close between the check and send; ignore
        }
      }
      this.stream.close();
      this.stream = null;
      this.currentSessionId = "";
      this.connectionEstablished = false;
      this.finishDelivered = false;
      this.messageInFlight = false;
      this.hasInjectedMemory = false;
    }
  }

  startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.stream) {
        this.stream.ping();
      }
    }, StreamService.KEEPALIVE_INTERVAL_MS);
  }

  stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  isConnectionEstablished(): boolean {
    return this.connectionEstablished;
  }

  private deliverFinish(result: StreamResult): void {
    if (this.finishDelivered) return;
    this.finishDelivered = true;
    this.messageInFlight = false;
    this.handlers.onFinish?.(result);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setupEventHandlers(): void {
    if (!this.stream) return;

    const streamId = this.currentSessionId;

    this.stream.on("stream", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      this.connectionEstablished = true;
      if (event.content) {
        this.handlers.onStream?.(event.content);
      }
      if (event.done) {
        this.deliverFinish({
          content: event.content,
          files: event.files,
        });
        this.close();
      }
    });

    this.stream.on("status", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (
        event.status === "processing" ||
        event.status === "awaiting_approval"
      ) {
        this.connectionEstablished = true;
        this.messageInFlight = true;
        this.clearReconnectTimer();
        return;
      }
      if (event.status === "connected") {
        this.connectionEstablished = true;
        this.clearReconnectTimer();
        return;
      }
      if (event.status === "ready") {
        return;
      }
      // AgentStream 内置自动重连：断连后 N 秒内重连成功则静默恢复，超时则报错
      if (event.status === "disconnected" && this.messageInFlight) {
        this.stopKeepalive();
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (
            this.currentSessionId !== streamId ||
            this.finishDelivered ||
            !this.messageInFlight
          ) {
            return;
          }
          this.handlers.onError?.({
            message: "WebSocket 连接中断且重连超时，请重试。",
            code: "TRANSPORT_DISCONNECTED",
          });
        }, StreamService.RECONNECT_GRACE_MS);
      }
    });

    this.stream.on("thought", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (event.content) {
        this.handlers.onThought?.(event.content);
      }
    });

    this.stream.on("plan", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (event.content) {
        this.handlers.onPlan?.(event.content);
      }
    });

    this.stream.on("context_compacted", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      this.connectionEstablished = true;
      this.handlers.onContextCompacted?.();
    });

    this.stream.on("run_summary", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId || !event.runSummary) return;
      this.handlers.onRunSummary?.(event.runSummary);
    });

    this.stream.on("models", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      this.handlers.onModels?.(event);
    });

    this.stream.on("tool_call", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      const toolCall = parseToolCallFromEvent(event);
      this.handlers.onToolCall?.(toolCall);
    });

    this.stream.on("tool_call_update", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      const update: ToolUpdateEvent = {
        toolCallId: event.toolCallId || "",
        toolCallStatus: event.toolCallStatus,
        content: event.content,
        result: event.result,
        details: event.details,
        durationMs: event.durationMs,
        error: event.error,
        timestamp: event.timestamp,
      };
      this.handlers.onToolUpdate?.(update);
    });

    this.stream.on("permission_request", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (event.permissionRequest) {
        this.handlers.onPermission?.(
          event.permissionRequest as PermissionRequest,
        );
      }
    });

    this.stream.on("user_choice_request", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (event.userChoiceRequest) {
        this.handlers.onUserChoice?.(
          event.userChoiceRequest as UserChoiceRequest,
        );
      }
    });

    this.stream.on("finish", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) {
        this.stream?.close();
        return;
      }
      const metadata = {
        ...(event.metadata as { runSummary?: RunSummary } | undefined),
        ...(event.checkpointVersion === undefined
          ? {}
          : { checkpointVersion: event.checkpointVersion }),
      };
      const result: StreamResult = {
        content: event.content,
        files: event.files,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      this.deliverFinish(result);
      this.close();
    });

    this.stream.on("error", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;

      const isModelError =
        event.error?.code === "SESSION_NOT_FOUND" ||
        event.error?.code === "GET_MODELS_ERROR";
      if (isModelError) {
        this.handlers.onError?.({
          message: event.error?.message || "Model error",
          code: event.error?.code,
          files: event.files,
        });
        this.close();
        return;
      }

      // 无论 connectionEstablished 状态如何，都传播错误
      const errorMessage =
        event.error?.message ||
        "WebSocket 连接失败，请检查 Agent Service 是否运行";

      if (!this.connectionEstablished) {
        // 只交付带服务端错误码的终态回调；同时触发连接回调会让上层追加两条错误消息。
        this.handlers.onError?.({
          message: errorMessage,
          code: event.error?.code,
          files: event.files,
        });
        this.close();
        return;
      }

      this.handlers.onError?.({
        message: errorMessage,
        code: event.error?.code,
        files: event.files,
      });
      this.close();
    });
  }
}
