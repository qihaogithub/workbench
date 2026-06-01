import {
  AgentStream,
  type StreamEvent,
  type ImageAttachment,
} from "@opencode-workbench/agent-client";
import { parseToolCallFromEvent } from "../utils/chat-stream-utils";
import type { ToolUpdateEvent } from "../utils/chat-stream-utils";
import { buildStaticSystemPrompt, buildDynamicContextPrefix } from "@/lib/agent/system-prompt";

// v3.2: 静态 system prompt 缓存在 module 顶部
const STATIC_SYSTEM_PROMPT = buildStaticSystemPrompt();

/**
 * 异步获取 L3 上下文前缀（通过服务端 API 避免客户端打包 fs）
 * 失败时返回空字符串（仍会发，但会让 AI 不知道页面列表）
 */
async function fetchDynamicContextPrefix(workingDir: string): Promise<string> {
  try {
    const response = await fetch(
      `/api/agent/workspace-context?workingDir=${encodeURIComponent(workingDir)}`,
      { method: "GET" }
    );
    if (!response.ok) {
      console.warn(
        "[StreamService] workspace-context API 响应非 OK:",
        response.status,
        response.statusText
      );
      return "";
    }
    const json = await response.json();
    if (!json?.success || !json?.data) {
      console.warn("[StreamService] workspace-context 返回失败:", json);
      return "";
    }
    const l3 = buildDynamicContextPrefix(json.data);
    console.log(
      "[StreamService] L3 prefix fetched, length:",
      l3.length,
      "pageCount:",
      json.data.pageCount
    );
    return l3;
  } catch (error) {
    console.warn("[StreamService] fetchDynamicContextPrefix 失败:", error);
    return "";
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
  };
}

export interface FileOperation {
  method: string;
  path: string;
  content?: string;
}

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
  onFileOperation?: (operation: FileOperation) => void;
  onFinish?: (result: StreamResult) => void;
  onError?: (error: { message: string; code?: string }) => void;
  onConnectionError?: () => void;
}

export class StreamService {
  private stream: AgentStream | null = null;
  private currentSessionId: string = "";
  private handlers: StreamEventHandlers = {};
  private connectionEstablished = false;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private static readonly KEEPALIVE_INTERVAL_MS = 25000; // 每25秒发送一次ping

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
  ): Promise<void> {
    if (!this.stream) {
      throw new Error("Stream not connected");
    }

    // v3.2: 异步获取 L3 上下文（通过服务端 API）→ 拼到 user content 前面
    // L3 走 user message 前缀（不进 system prompt），L2 + L4 走 systemPrompt 字段
    let finalContent = message;
    if (workingDir) {
      // 重试一次：首次失败时常见原因是 dev server 刚启动 / API 路由首次编译
      let l3 = await fetchDynamicContextPrefix(workingDir);
      if (!l3) {
        await new Promise((r) => setTimeout(r, 200));
        l3 = await fetchDynamicContextPrefix(workingDir);
      }
      if (l3) {
        finalContent = `${l3}${message}`;
      } else {
        console.warn(
          "[StreamService] L3 上下文两次获取均失败，AI 将无法感知工作空间状态"
        );
      }
    }

    this.stream.send(finalContent, `msg-${Date.now()}`, {
      stream: true,
      workingDir,
      images,
      systemPrompt: STATIC_SYSTEM_PROMPT,
    } as any);
  }

  sendPermissionResponse(permissionId: string, optionId: string): void {
    const ws = (this.stream as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "permission_response",
          permissionId,
          optionId,
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

  close(): void {
    this.stopKeepalive();
    if (this.stream) {
      this.stream.close();
      this.stream = null;
      this.currentSessionId = "";
      this.connectionEstablished = false;
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

  private setupEventHandlers(): void {
    if (!this.stream) return;

    const streamId = this.currentSessionId;

    this.stream.on("stream", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      this.connectionEstablished = true;
      if (event.content) {
        this.handlers.onStream?.(event.content);
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
        error: event.error,
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

    this.stream.on("file_operation", (event: StreamEvent) => {
      if (this.currentSessionId !== streamId) return;
      if (event.fileOperation) {
        this.handlers.onFileOperation?.(event.fileOperation as FileOperation);
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
      this.handlers.onFinish?.(result);
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
        });
        this.close();
        return;
      }

      this.handlers.onError?.({
        message: errorMessage,
        code: event.error?.code,
      });
    });
  }
}
