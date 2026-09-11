export interface LedgerContextSummary {
  schemaVersion: number;
  summaryVersion: number;
  sourceRevision: number;
  coveredThroughSequence: number;
  summaryText: string;
  tailMessages: Array<{ role: "user" | "assistant"; content: string }>;
  summaryHash: string;
  createdAt: number;
}

export interface LedgerRunStartAck {
  conversationId: string; runId: string; messageId: string; assistantMessageId: string;
  conversationRevision: number; historyBaseRevision: number; historyBeforeRun: unknown[];
  currentUserMessage: unknown;
  contextSummary?: LedgerContextSummary;
}
export interface LedgerRunTerminalAck {
  conversationId: string; runId: string; messageId: string; assistantMessageId: string;
  status: string; conversationRevision: number; assistantMessage: unknown | null;
}
export interface LedgerTraceEventInput {
  occurredAt: number;
  source: "model" | "tool" | "subagent" | "system";
  eventType: string;
  title: string;
  status?: string;
  toolName?: string;
  toolCallId?: string;
  durationMs?: number;
  errorCode?: string;
  summary?: string;
  metrics?: Record<string, unknown>;
  files?: Array<{ path: string; action: "created" | "modified" | "deleted" }>;
}
export interface LedgerTerminalInput {
  conversationId: string; runId: string; messageId: string; assistantMessageId: string;
  ownerUserId: string; projectId: string; status: "completed" | "failed" | "cancelled" | "interrupted";
  content?: string; displayParts?: unknown[]; errorCode?: string;
  usage?: Record<string, unknown>; summary?: Record<string, unknown>; traceId?: string;
  traceEvents?: LedgerTraceEventInput[];
  contextSummary?: {
    schemaVersion: 1;
    reason: "preflight" | "overflow_recovery";
    summaryText: string;
    tailMessages: Array<{ role: "user" | "assistant"; content: string }>;
    sourceRevision: number;
    coveredThroughSequence: number;
  };
}

/** Small, fail-closed client for the author-site conversation authority. */
export class ConversationLedgerClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { baseUrl?: string; token?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.AUTHOR_SITE_URL ?? "").replace(/\/$/, "");
    this.token = options.token ?? process.env.INTERNAL_API_TOKEN ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  async startRun(input: {
    conversationId: string; runId: string; messageId: string; assistantMessageId: string;
    ownerUserId: string; projectId: string; agentSessionId: string; modelProvider?: string;
    modelId?: string; traceId?: string;
  }): Promise<LedgerRunStartAck> {
    this.assertEnabled();
    return this.post<LedgerRunStartAck>(`/api/internal/conversations/${encodeURIComponent(input.conversationId)}/runs/${encodeURIComponent(input.runId)}/start`, input);
  }

  async commitTerminal(input: LedgerTerminalInput): Promise<LedgerRunTerminalAck> {
    this.assertEnabled();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.post<LedgerRunTerminalAck>(`/api/internal/conversations/${encodeURIComponent(input.conversationId)}/runs/${encodeURIComponent(input.runId)}/terminal`, input);
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async reconcileInterrupted(startedBefore: number): Promise<{ interrupted: number }> {
    this.assertEnabled();
    return this.post<{ interrupted: number }>(
      "/api/internal/conversations/runs/reconcile-interrupted",
      { startedBefore },
    );
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error("Conversation ledger is not configured (AUTHOR_SITE_URL / INTERNAL_API_TOKEN)");
    }
  }

  private async post<T>(pathname: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": this.token },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { message?: string } } | null;
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error?.message || `Conversation ledger request failed (${response.status})`);
    }
    return payload.data as T;
  }
}

let singleton: ConversationLedgerClient | undefined;
export function getConversationLedgerClient(): ConversationLedgerClient {
  return singleton ??= new ConversationLedgerClient();
}
