import type {
  AgentResult,
  AgentInfo,
  SessionListResponse,
  FileChange,
  FileChangeInfo,
  FilesResponse,
  WorkspaceInfo,
  UpdateWorkspaceOptions,
  SendMessageOptions,
  ApiResponse,
  AgentType,
} from "./types";

export interface AgentClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class AgentClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: AgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async sendMessage(
    sessionId: string,
    content: string,
    options?: {
      demoId?: string;
      workingDir?: string;
      customWorkspace?: boolean;
      options?: SendMessageOptions;
      images?: import("./types").ImageAttachment[];
    },
  ): Promise<ApiResponse<AgentResult>> {
    return this.request<AgentResult>(`/api/agent/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({
        content,
        demoId: options?.demoId,
        workingDir: options?.workingDir,
        customWorkspace: options?.customWorkspace,
        images: options?.images,
        options: options?.options,
      }),
    });
  }

  async getSession(sessionId: string): Promise<ApiResponse<AgentInfo>> {
    return this.request<AgentInfo>(`/api/agent/${sessionId}`);
  }

  async destroySession(
    sessionId: string,
  ): Promise<ApiResponse<{ sessionId: string; destroyed: boolean }>> {
    return this.request<{ sessionId: string; destroyed: boolean }>(
      `/api/agent/${sessionId}`,
      {
        method: "DELETE",
      },
    );
  }

  async getFiles(
    sessionId: string,
    includeContent = false,
  ): Promise<ApiResponse<FilesResponse>> {
    const query = includeContent ? "?includeContent=true" : "";
    return this.request<FilesResponse>(`/api/agent/${sessionId}/files${query}`);
  }

  async listSessions(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<SessionListResponse>> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));

    const queryString = query.toString();
    return this.request<SessionListResponse>(
      `/api/sessions${queryString ? `?${queryString}` : ""}`,
    );
  }

  async rollback(
    sessionId: string,
    files?: string[],
  ): Promise<
    ApiResponse<{ sessionId: string; rolledBack: string[]; failed?: string[] }>
  > {
    return this.request<{
      sessionId: string;
      rolledBack: string[];
      failed?: string[];
    }>(`/api/agent/${sessionId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  }

  async getWorkspace(sessionId: string): Promise<ApiResponse<WorkspaceInfo>> {
    return this.request<WorkspaceInfo>(`/api/agent/${sessionId}/workspace`);
  }

  async updateWorkspace(
    sessionId: string,
    options: UpdateWorkspaceOptions,
  ): Promise<ApiResponse<WorkspaceInfo>> {
    return this.request<WorkspaceInfo>(`/api/agent/${sessionId}/workspace`, {
      method: "PUT",
      body: JSON.stringify(options),
    });
  }

  async stageFiles(
    sessionId: string,
    files: string[],
  ): Promise<ApiResponse<{ sessionId: string; staged: string[] }>> {
    return this.request<{ sessionId: string; staged: string[] }>(
      `/api/agent/${sessionId}/files/stage`,
      {
        method: "POST",
        body: JSON.stringify({ files }),
      },
    );
  }

  async discardFiles(
    sessionId: string,
    files: Array<{ path: string; operation: "create" | "modify" | "delete" }>,
  ): Promise<ApiResponse<{ sessionId: string; discarded: string[] }>> {
    return this.request<{ sessionId: string; discarded: string[] }>(
      `/api/agent/${sessionId}/files/discard`,
      {
        method: "POST",
        body: JSON.stringify({ files }),
      },
    );
  }

  async health(): Promise<
    ApiResponse<{
      status: string;
      timestamp: string;
      uptime: number;
      agents: number;
    }>
  > {
    return this.request<{
      status: string;
      timestamp: string;
      uptime: number;
      agents: number;
    }>("/health");
  }

  stream(sessionId: string): AgentStream {
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    return new AgentStream(`${wsUrl}/api/agent/${sessionId}/stream`);
  }
}

export interface StreamEvent {
  type:
    | "stream"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "error"
    | "finish"
    | "pong"
    | "status"
    | "permission_request"
    | "file_operation"
    | "models";
  id?: string;
  content?: string;
  done?: boolean;
  error?: { code: string; message: string };
  files?: FileChange[];
  metadata?: Record<string, unknown>;
  timestamp?: number;
  status?: string;
  toolCallId?: string;
  title?: string;
  kind?: "read" | "edit" | "execute";
  toolCallStatus?: "pending" | "in_progress" | "completed" | "failed";
  permissionRequest?: {
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
  };
  fileOperation?: {
    method: string;
    path: string;
    content?: string;
  };
  models?: Array<{
    id: string;
    label: string;
  }>;
  currentModelId?: string;
  canSwitch?: boolean;
}

export class AgentStream {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventHandlers: Map<string, Set<(event: StreamEvent) => void>> =
    new Map();
  private autoReconnect = true;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit("status", { type: "status", status: "connected" });
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch {
        this.emit("error", {
          type: "error",
          error: { code: "PARSE_ERROR", message: "Failed to parse message" },
        });
      }
    };

    this.ws.onclose = () => {
      this.emit("status", { type: "status", status: "disconnected" });

      if (
        this.autoReconnect &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        setTimeout(
          () => this.connect(),
          this.reconnectDelay * this.reconnectAttempts,
        );
      }
    };

    this.ws.onerror = () => {
      this.emit("error", {
        type: "error",
        error: {
          code: "CONNECTION_ERROR",
          message: "WebSocket connection error",
        },
      });
    };
  }

  send(content: string, id?: string, options?: SendMessageOptions): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit("error", {
        type: "error",
        error: { code: "NOT_CONNECTED", message: "WebSocket is not connected" },
      });
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "message",
        id: id || `msg-${Date.now()}`,
        content,
        workingDir: options?.workingDir,
        images: options?.images,
        options,
      }),
    );
  }

  cancel(messageId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: "cancel",
        id: messageId,
      }),
    );
  }

  ping(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: "ping",
        timestamp: Date.now(),
      }),
    );
  }

  on(event: string, handler: (event: StreamEvent) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: (event: StreamEvent) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  close(): void {
    this.autoReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  private emit(event: string, data: StreamEvent): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data));
  }
}
