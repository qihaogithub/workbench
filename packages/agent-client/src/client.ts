import type {
  AgentMode,
  AgentResult,
  AgentInfo,
  SessionListResponse,
  FileChange,
  FilesResponse,
  WorkspaceInfo,
  UpdateWorkspaceOptions,
  SendMessageOptions,
  ApiResponse,
  RunSummary,
  ConversationProjection,
  ConversationRecord,
  MessageAcceptedAck,
} from "./types";

import type {
  ObservePreviewInput,
  PreviewObservationCapability,
  PreviewObservationResult,
  PreviewRenderIdentity,
} from "./preview-observation-types";

export interface PreviewRegistration {
  identity: PreviewRenderIdentity;
  capabilities?: PreviewObservationCapability[];
}

export type PreviewObservationHandler = ((
  input: ObservePreviewInput,
) => PreviewObservationResult | Promise<PreviewObservationResult>) & {
  /** Optional provider used to re-register an already-mounted preview on reconnect. */
  getPreviewRegistration?: () => PreviewRegistration | null;
};

export interface AgentClientConfig {
  baseUrl: string;
  apiKey?: string;
  /** Host serving the public conversation ledger (defaults to the current browser origin). */
  conversationBaseUrl?: string;
  /** 行为模式，默认 "workbench"；viewer-readonly 会随请求/连接透传给 agent-service */
  mode?: AgentMode;
}

export type AgentClientRequestErrorKind =
  | "network"
  | "http"
  | "response"
  | "server";

/** 上传请求的传输层错误，供 UI 区分网络/CORS、HTTP 和无效响应。 */
export class AgentClientRequestError extends Error {
  readonly name = "AgentClientRequestError";

  constructor(
    message: string,
    readonly kind: AgentClientRequestErrorKind,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class AgentClient {
  private baseUrl: string;
  private apiKey?: string;
  private mode: AgentMode;
  private conversationBaseUrl: string;

  constructor(config: AgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.mode = config.mode ?? "workbench";
    this.conversationBaseUrl = (
      config.conversationBaseUrl ??
      (typeof window !== "undefined" ? window.location.origin : this.baseUrl)
    ).replace(/\/+$/, "");
  }

  getMode(): AgentMode {
    return this.mode;
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

  private async requestConversation<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.conversationBaseUrl}${path}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options?.headers,
        },
      });
    } catch (error) {
      throw new ConversationHttpError(
        0,
        "NETWORK_ERROR",
        error instanceof Error ? error.message : "Conversation request failed",
        true,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const body = payload as
        | { error?: { code?: string; message?: string } }
        | undefined;
      throw new ConversationHttpError(
        response.status,
        body?.error?.code || `HTTP_${response.status}`,
        body?.error?.message ||
          `Conversation request failed (${response.status})`,
      );
    }
    if (!payload || typeof payload !== "object") {
      throw new ConversationHttpError(
        response.status,
        "INVALID_RESPONSE",
        "Invalid conversation response",
      );
    }
    const envelope = payload as {
      success?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
    };
    if (envelope.success === false || !("data" in envelope)) {
      throw new ConversationHttpError(
        response.status,
        envelope.error?.code || "INVALID_RESPONSE",
        envelope.error?.message || "Invalid conversation response",
      );
    }
    return envelope.data as T;
  }

  async listConversations(projectId: string): Promise<ConversationRecord[]> {
    const data = await this.requestConversation<ConversationRecord[]>(
      `/api/conversations?projectId=${encodeURIComponent(projectId)}`,
    );
    return Array.isArray(data) ? data : [];
  }

  async loadConversation(
    conversationId: string,
    afterSequence = 0,
  ): Promise<ConversationProjection> {
    const query =
      afterSequence > 0
        ? `?afterSequence=${encodeURIComponent(String(afterSequence))}`
        : "";
    return this.requestConversation<ConversationProjection>(
      `/api/conversations/${encodeURIComponent(conversationId)}${query}`,
    );
  }

  async loadMessages(
    conversationId: string,
    afterSequence = 0,
  ): Promise<ConversationProjection> {
    const query =
      afterSequence > 0
        ? `?afterSequence=${encodeURIComponent(String(afterSequence))}`
        : "";
    return this.requestConversation<ConversationProjection>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
    );
  }

  async submitMessageCommand(input: {
    conversationId: string;
    clientMessageId: string;
    content: string;
    displayParts?: unknown[];
    attachmentIds?: string[];
    expectedRevision?: number;
    kind?: string;
  }): Promise<MessageAcceptedAck> {
    return this.requestConversation<MessageAcceptedAck>(
      `/api/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          clientMessageId: input.clientMessageId,
          content: input.content,
          displayParts: input.displayParts,
          attachmentIds: input.attachmentIds,
          expectedRevision: input.expectedRevision,
          kind: input.kind,
        }),
      },
    );
  }

  async cancelRun(conversationId: string, runId: string): Promise<unknown> {
    return this.requestConversation(
      `/api/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" },
    );
  }

  async retryRun(
    conversationId: string,
    userMessageId: string,
  ): Promise<MessageAcceptedAck> {
    return this.requestConversation<MessageAcceptedAck>(
      `/api/conversations/${encodeURIComponent(conversationId)}/retry`,
      { method: "POST", body: JSON.stringify({ userMessageId }) },
    );
  }

  async supersede(input: {
    conversationId: string;
    afterMessageId: string | null;
    expectedRevision: number;
  }): Promise<ConversationProjection> {
    return this.requestConversation<ConversationProjection>(
      `/api/conversations/${encodeURIComponent(input.conversationId)}/supersede`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<ConversationRecord> {
    return this.requestConversation<ConversationRecord>(
      `/api/conversations/${encodeURIComponent(conversationId)}/title`,
      { method: "PATCH", body: JSON.stringify({ title }) },
    );
  }

  async exportConversation(
    conversationId: string,
  ): Promise<ConversationProjection & { exportedAt: string }> {
    return this.requestConversation<
      ConversationProjection & { exportedAt: string }
    >(`/api/conversations/${encodeURIComponent(conversationId)}/export`);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.requestConversation<null>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    );
  }

  async sendMessage(
    sessionId: string,
    content: string,
    options?: {
      demoId?: string;
      projectId?: string;
      workingDir?: string;
      customWorkspace?: boolean;
      model?: string;
      options?: SendMessageOptions;
      images?: import("./types").ImageAttachment[];
      files?: import("./types").FileAttachment[];
    },
  ): Promise<ApiResponse<AgentResult>> {
    return this.request<AgentResult>(`/api/agent/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({
        content,
        mode: options?.options?.mode ?? this.mode,
        viewerContext: options?.options?.viewerContext,
        projectId: options?.projectId,
        demoId: options?.demoId,
        workingDir: options?.workingDir,
        customWorkspace: options?.customWorkspace,
        model: options?.model || options?.options?.model,
        images: options?.images,
        files: options?.files,
        projectRules: options?.options?.projectRules,
        options: options?.options,
      }),
    });
  }

  async generateConversationTitle(
    sessionId: string,
    options: { content: string; model?: string },
  ): Promise<ApiResponse<{ title: string }>> {
    return this.request<{ title: string }>(
      `/api/agent/${encodeURIComponent(sessionId)}/title`,
      {
        method: "POST",
        body: JSON.stringify({
          content: options.content,
          model: options.model,
        }),
      },
    );
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

  async uploadAttachment(
    sessionId: string,
    projectId: string,
    file: File,
  ): Promise<ApiResponse<import("./types").FileAttachment>> {
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    const url = new URL(
      `${this.baseUrl}/api/agent/${encodeURIComponent(sessionId)}/attachments`,
    );
    url.searchParams.set("projectId", projectId);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: formData,
      });
    } catch {
      throw new AgentClientRequestError(
        "附件上传请求无法连接 AI 服务",
        "network",
      );
    }

    let payload: ApiResponse<import("./types").FileAttachment>;
    try {
      payload = (await response.json()) as ApiResponse<
        import("./types").FileAttachment
      >;
    } catch {
      throw new AgentClientRequestError(
        "AI 服务返回了无效的附件上传响应",
        "response",
        response.status,
      );
    }

    if (!payload.success) {
      if (response.status >= 500) {
        throw new AgentClientRequestError(
          payload.error.message,
          "http",
          response.status,
          payload.error.code,
        );
      }
      throw new AgentClientRequestError(
        payload.error.message,
        "server",
        response.status,
        payload.error.code,
      );
    }

    if (!response.ok) {
      throw new AgentClientRequestError(
        `附件上传失败（HTTP ${response.status}）`,
        "http",
        response.status,
      );
    }

    return payload;
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

  async getToolCapabilities(): Promise<ApiResponse<ToolCapabilities>> {
    return this.request<ToolCapabilities>("/api/tools/capabilities");
  }

  stream(sessionId: string): AgentStream {
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    const query = this.mode === "viewer-readonly" ? `?mode=${this.mode}` : "";
    return new AgentStream(
      `${wsUrl}/api/agent/${sessionId}/stream${query}`,
      this.mode,
    );
  }
}

export class ConversationHttpError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "ConversationHttpError";
    this.retryable =
      retryable ?? (status === 408 || status === 429 || status >= 500);
  }
}

export interface StreamEvent {
  type:
    | "stream"
    | "thought"
    | "plan"
    | "tool_call"
    | "tool_call_update"
    | "error"
    | "finish"
    | "pong"
    | "status"
    | "context_compacted"
    | "run_summary"
    | "permission_request"
    | "user_choice_request"
    | "models"
    | "preview_observe_request";
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
  parameters?: Record<string, unknown>;
  result?: unknown;
  details?: unknown;
  durationMs?: number;
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
      summary?: string;
      planId?: string;
      approvalKind?: "delete" | "plan_approval" | "config_visibility";
      editable?: boolean;
      initialContent?: string;
    };
  };
  userChoiceRequest?: {
    requestId: string;
    sessionId: string;
    question: string;
    description?: string;
    options: Array<{
      optionId: string;
      label: string;
      value?: string;
      description?: string;
    }>;
    allowCustom: boolean;
  };
  models?: Array<{
    id: string;
    label: string;
  }>;
  currentModelId?: string;
  canSwitch?: boolean;
  contextCompaction?: {
    reason: "preflight" | "overflow_recovery";
    tokensBefore: number;
    contextWindow: number;
    durationMs: number;
  };
  runSummary?: RunSummary;
  checkpointVersion?: number;
  /** Canonical conversation identity echoed by agent-service events. */
  conversationId?: string;
  messageId?: string;
  runId?: string;
  assistantMessageId?: string;
  conversationRevision?: number;
  previewRequestId?: string;
  previewObservation?: ObservePreviewInput;
  previewRegistration?: PreviewRegistration;
  previewResult?: PreviewObservationResult;
}

export interface ToolCapabilities {
  toolVersion: number;
  toolNames: string[];
  checkpointEnabled?: boolean;
}

export class AgentStream {
  private ws: WebSocket | null = null;
  private url: string;
  private mode: import("./types").AgentMode;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventHandlers: Map<string, Set<(event: StreamEvent) => void>> =
    new Map();
  private autoReconnect = true;
  private previewObservationHandler: PreviewObservationHandler | null = null;

  constructor(url: string, mode: import("./types").AgentMode = "workbench") {
    this.url = url;
    this.mode = mode;
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      const registration =
        this.previewObservationHandler?.getPreviewRegistration?.();
      if (registration) this.registerPreview(registration);
      this.emit("status", { type: "status", status: "connected" });
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.type === "preview_observe_request") {
          const requestId = data.previewRequestId;
          const input = data.previewObservation;
          const handler = this.previewObservationHandler;
          if (!requestId || !input || !handler) return;
          Promise.resolve(handler(input))
            .then((result) => {
              // The observation response is the authoritative snapshot for
              // this connection. Register it before sending the response so
              // the service can bind subsequent requests to the same render
              // identity, including after a reconnect or preview rebuild.
              if (result.identity) {
                this.registerPreview({
                  identity: result.identity,
                  capabilities: result.capabilities,
                });
              } else if (result.availability === "stale") {
                // A stale response intentionally omits the old identity. Pull
                // the handler's latest snapshot before a model retry so the
                // next Broker request is bound to the current render instead
                // of repeatedly replaying the identity that just raced.
                const latestRegistration = handler.getPreviewRegistration?.();
                if (latestRegistration)
                  this.registerPreview(latestRegistration);
              }
              this.sendPreviewObservationResult(requestId, result);
            })
            .catch((error) => {
              this.sendPreviewObservationResult(requestId, {
                availability: "unavailable",
                readiness: "partial",
                capabilities: [],
                assertions: [],
                assertionStatus: "not-requested",
                evidence: { kind: "runtime-structure", precision: "layout" },
                reasons: [
                  error instanceof Error
                    ? error.message.slice(0, 256)
                    : "preview-observation-failed",
                ],
              });
            });
          return;
        }
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
        mode: options?.mode ?? this.mode,
        viewerContext: options?.viewerContext,
        workingDir: options?.workingDir,
        projectId: options?.projectId,
        demoId: options?.demoId,
        referencedProjects: options?.referencedProjects,
        model: options?.model,
        images: options?.images,
        files: options?.files,
        projectRules: options?.projectRules,
        options: {
          ...options,
          conversation: {
            ...options?.conversation,
            conversationId:
              options?.conversationId || options?.conversation?.conversationId,
            messageId: options?.messageId || id,
            runId: options?.runId || undefined,
            assistantMessageId:
              options?.assistantMessageId ||
              options?.conversation?.assistantMessageId,
            conversationRevision:
              options?.conversationRevision ??
              options?.conversation?.conversationRevision,
          },
        },
        conversationId: options?.conversationId,
        messageId: options?.messageId || id,
        runId: options?.runId,
        assistantMessageId:
          options?.assistantMessageId ||
          options?.conversation?.assistantMessageId,
        conversationRevision: options?.conversationRevision,
        expectedRevision: options?.expectedRevision,
      }),
    );
  }

  /** WebSocket 是否处于可发送状态 */
  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 发送浏览器 console 辅助帧；不进入 Agent 对话流。 */
  sendConsoleData(
    entries: Array<{ level: string; args: string; timestamp: number }>,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "console_data", entries }));
  }

  /** Register the preview instance owned by this browser connection. */
  registerPreview(registration: PreviewRegistration): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "preview_register", registration }));
  }

  unregisterPreview(previewInstanceId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "preview_unregister",
        ...(previewInstanceId ? { previewInstanceId } : {}),
      }),
    );
  }

  setPreviewObservationHandler(
    handler: PreviewObservationHandler | null,
  ): void {
    this.previewObservationHandler = handler;
    const registration = handler?.getPreviewRegistration?.();
    if (registration) this.registerPreview(registration);
  }

  sendPreviewObservationResult(
    requestId: string,
    result: PreviewObservationResult,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "preview_observe_result",
        requestId,
        result,
      }),
    );
  }

  sendPermissionResponse(
    permissionId: string,
    optionId: string,
    responseContent?: string,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "permission_response",
        permissionId,
        optionId,
        responseContent,
      }),
    );
  }

  sendUserChoiceResponse(
    requestId: string,
    choice:
      | { type: "option"; optionId: string }
      | { type: "custom"; text: string }
      | { type: "cancel" },
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ type: "user_choice_response", requestId, choice }),
    );
  }

  sendModelChange(modelId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "set_model", modelId }));
  }

  /** 请求可用模型列表；响应通过 "models" 事件返回 */
  requestModels(options?: {
    workingDir?: string;
    projectId?: string;
    demoId?: string;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit("error", {
        type: "error",
        error: { code: "NOT_CONNECTED", message: "WebSocket is not connected" },
      });
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "get_models",
        mode: this.mode,
        workingDir: options?.workingDir,
        projectId: options?.projectId,
        demoId: options?.demoId,
      }),
    );
  }

  /** 切换当前会话模型；确认通过 "models" 事件返回 */
  setModel(modelId: string, id?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: "set_model",
        id,
        modelId,
      }),
    );
  }

  cancel(messageId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: "cancel",
        ...(messageId ? { id: messageId } : {}),
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
