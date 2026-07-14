import {
  AgentStream,
  type FileAttachment,
  type StreamEvent,
  type ImageAttachment,
} from "@workbench/agent-client";
import { parseToolCallFromEvent } from "../utils/chat-stream-utils";
import type { ToolUpdateEvent } from "../utils/chat-stream-utils";
import {
  buildStaticSystemPrompt,
  buildDynamicContextPrefix,
  buildMemoryPrefix,
  buildKnowledgeIndexPrefix,
} from "@/lib/agent/system-prompt";
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "@/lib/agent/active-view-context";

export interface ToolCapabilities {
  toolVersion: number;
  toolNames: string[];
}

export class MissingTransactionalDeleteToolsError extends Error {
  constructor() {
    super(
      "Agent Service 版本过旧或当前会话未加载事务化删除工具。请重启 agent-service 并刷新创作端页面后再试。",
    );
    this.name = "MissingTransactionalDeleteToolsError";
  }
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
    const { getAgentClient } = await import("@/lib/agent-client");
    const response = await getAgentClient().getToolCapabilities();
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

/**
 * 异步获取 L3 上下文前缀和 L4 记忆内容（通过服务端 API 避免客户端打包 fs）
 * 失败时返回空字符串（仍会发，但会让 AI 不知道页面列表/记忆）
 */
async function fetchContextPrefix(
  workingDir: string,
): Promise<{
  l3: string;
  memory: string | null;
  knowledgeIndex: string | null;
}> {
  try {
    const response = await fetch(
      `/api/agent/workspace-context?workingDir=${encodeURIComponent(workingDir)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      console.warn(
        "[StreamService] workspace-context API 响应非 OK:",
        response.status,
        response.statusText,
      );
      return { l3: "", memory: null, knowledgeIndex: null };
    }
    const json = await response.json();
    if (!json?.success || !json?.data) {
      console.warn("[StreamService] workspace-context 返回失败:", json);
      return { l3: "", memory: null, knowledgeIndex: null };
    }
    const l3 = buildDynamicContextPrefix(json.data);
    const memory = json.data.memoryContent
      ? buildMemoryPrefix(json.data.memoryContent)
      : null;
    const knowledgeIndex = json.data.knowledgeIndex || null;
    return { l3, memory, knowledgeIndex };
  } catch (error) {
    console.warn("[StreamService] fetchContextPrefix 失败:", error);
    return { l3: "", memory: null, knowledgeIndex: null };
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
    approvalKind?: "delete" | "plan_approval";
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
}

export interface StreamEventHandlers {
  onStream?: (content: string) => void;
  onThought?: (content: string) => void;
  onPlan?: (content: string) => void;
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
  private readyFallbackTimer: NodeJS.Timeout | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private hasInjectedMemory = false;
  private static readonly KEEPALIVE_INTERVAL_MS = 25000; // 每25秒发送一次ping
  private static readonly READY_FINISH_FALLBACK_DELAY_MS = 1000;

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
    this.clearReadyFallbackTimer();

    const { getAgentClient } = await import("@/lib/agent-client");
    const agentClient = getAgentClient();
    const stream = agentClient.stream(agentSessionId);
    this.stream = stream;

    this.setupEventHandlers();
    return stream;
  }

  setHandlers(handlers: StreamEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  async waitForConnection(stream: AgentStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket 连接超时"));
      }, 3000);

      const checkConnection = () => {
        const ws = (stream as any).ws;
        if (ws?.readyState === WebSocket.OPEN) {
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
  ): Promise<void> {
    if (!this.stream) {
      throw new Error("Stream not connected");
    }

    const toolCapabilities = await fetchToolCapabilities();
    if (
      isBulkPageDeletionRequest(message) &&
      !hasTransactionalDeleteTools(toolCapabilities)
    ) {
      throw new MissingTransactionalDeleteToolsError();
    }
    const systemPrompt = buildStaticSystemPrompt({
      toolNames: toolCapabilities?.toolNames || [],
    });

    // v3.2: 异步获取 L3 上下文 + L4 记忆（通过服务端 API）→ 拼到 user content 前面
    // L3 走 user message 前缀（不进 system prompt），L2 + L5 走 systemPrompt 字段
    // L4 记忆仅在首条消息注入
    const activeViewPrefix = buildActiveViewContextPrefix(activeViewContext);
    let finalContent = activeViewPrefix
      ? `${activeViewPrefix}${message}`
      : message;
    if (workingDir) {
      // 重试一次：首次失败时常见原因是 dev server 刚启动 / API 路由首次编译
      let ctx = await fetchContextPrefix(workingDir);
      if (!ctx.l3 && !ctx.memory && !ctx.knowledgeIndex) {
        await new Promise((r) => setTimeout(r, 200));
        ctx = await fetchContextPrefix(workingDir);
      }
      if (ctx.l3) {
        // 知识库索引：每条消息都注入（与 L3 同频，因为知识库可能被用户更新）
        const knowledgePrefix = ctx.knowledgeIndex
          ? buildKnowledgeIndexPrefix(ctx.knowledgeIndex)
          : "";
        // L4 记忆：仅首条消息注入
        const memoryPrefix =
          !this.hasInjectedMemory && ctx.memory ? ctx.memory : "";
        if (memoryPrefix) {
          this.hasInjectedMemory = true;
        }
        finalContent = `${ctx.l3}${knowledgePrefix}${memoryPrefix}${activeViewPrefix}${message}`;
      } else {
        console.warn(
          "[StreamService] L3 上下文两次获取均失败，AI 将无法感知工作空间状态",
        );
      }
    }

    this.messageInFlight = true;
    this.stream.send(finalContent, `msg-${Date.now()}`, {
      stream: true,
      workingDir,
      projectId,
      demoId,
      model: modelId,
      images,
      files,
      systemPrompt,
    } as any);
  }

  sendPermissionResponse(
    permissionId: string,
    optionId: string,
    responseContent?: string,
  ): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "permission_response",
          permissionId,
          optionId,
          responseContent,
        }),
      );
    }
  }

  sendUserChoiceResponse(requestId: string, choice: UserChoiceResponse): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "user_choice_response",
          requestId,
          choice,
        }),
      );
    }
  }

  sendModelChange(modelId: string): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_model", modelId }));
    }
  }

  requestModels(workingDir?: string): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "get_models", workingDir }));
    }
  }

  forwardConsoleEntries(
    entries: Array<{ level: string; args: string; timestamp: number }>,
  ): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "console_data", entries }));
    }
  }

  close(): void {
    this.stopKeepalive();
    if (this.stream) {
      // P5 Layer 1: send cancel frame before closing if a message is in flight
      const ws = (this.stream as any)?.ws;
      if (this.messageInFlight && ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "cancel" }));
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
      this.clearReadyFallbackTimer();
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
    this.clearReadyFallbackTimer();
    this.handlers.onFinish?.(result);
  }

  private clearReadyFallbackTimer(): void {
    if (!this.readyFallbackTimer) return;
    clearTimeout(this.readyFallbackTimer);
    this.readyFallbackTimer = null;
  }

  private scheduleReadyFinishFallback(streamId: string): void {
    if (
      this.finishDelivered ||
      !this.messageInFlight ||
      this.readyFallbackTimer
    ) {
      return;
    }
    this.readyFallbackTimer = setTimeout(() => {
      this.readyFallbackTimer = null;
      if (
        this.currentSessionId !== streamId ||
        this.finishDelivered ||
        !this.messageInFlight
      ) {
        return;
      }
      this.deliverFinish({ content: "" });
      this.close();
    }, StreamService.READY_FINISH_FALLBACK_DELAY_MS);
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
      if (event.status === "processing") {
        this.connectionEstablished = true;
        this.messageInFlight = true;
        this.clearReadyFallbackTimer();
        return;
      }
      if (event.status === "ready") {
        this.scheduleReadyFinishFallback(streamId);
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
      const result: StreamResult = {
        content: event.content,
        files: event.files,
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
        return;
      }

      // 无论 connectionEstablished 状态如何，都传播错误
      const errorMessage =
        event.error?.message ||
        "WebSocket 连接失败，请检查 Agent Service 是否运行";

      if (!this.connectionEstablished) {
        // 连接未建立时，同时触发 onConnectionError 和 onError
        this.handlers.onConnectionError?.();
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
    });
  }
}
