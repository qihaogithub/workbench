import {
  AgentStream,
  type StreamEvent,
} from "@opencode-workbench/agent-client";
import { parseToolCallFromEvent } from "../utils/chat-stream-utils";
import type { ToolUpdateEvent } from "../utils/chat-stream-utils";

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

  sendMessage(message: string, workingDir?: string): void {
    if (!this.stream) {
      throw new Error("Stream not connected");
    }
    this.stream.send(message, `msg-${Date.now()}`, {
      stream: true,
      workingDir,
    });
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
    if (this.stream) {
      this.stream.close();
      this.stream = null;
      this.currentSessionId = "";
      this.connectionEstablished = false;
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

      if (!this.connectionEstablished) {
        this.handlers.onConnectionError?.();
        this.close();
        return;
      }

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

      this.handlers.onError?.({
        message:
          event.error?.message ||
          "WebSocket 连接失败，请检查 Agent Service 是否运行",
      });
    });
  }
}
