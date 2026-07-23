import type {
  KnowledgeSearchHit,
  KnowledgeSource,
} from "./sqlite-catalog.js";

export type { KnowledgeSearchHit, KnowledgeSource } from "./sqlite-catalog.js";

export interface KnowledgeServiceClientOptions {
  baseUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
}

export class KnowledgeServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;
  private readonly timeoutMs: number;

  constructor(options: KnowledgeServiceClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.KNOWLEDGE_SERVICE_URL ??
      "http://localhost:3203"
    ).replace(/\/+$/, "");
    this.internalToken =
      options.internalToken ?? process.env.INTERNAL_API_TOKEN ?? undefined;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async search(input: {
    query: string;
    currentProjectId?: string;
    limit?: number;
  }): Promise<KnowledgeSearchHit[]> {
    const response = await this.request("/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { hits?: KnowledgeSearchHit[] };
    };
    return payload.success && Array.isArray(payload.data?.hits)
      ? payload.data.hits
      : [];
  }

  async read(sourceRef: string): Promise<KnowledgeSource | null> {
    const response = await this.request("/api/knowledge/read", {
      method: "POST",
      body: JSON.stringify({ sourceRef }),
    });
    if (response.status === 404) return null;
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { source?: KnowledgeSource };
    };
    return payload.success && payload.data?.source
      ? payload.data.source
      : null;
  }

  async reconcile(): Promise<void> {
    await this.request("/api/knowledge/reconcile", {
      method: "POST",
      body: "{}",
    });
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(this.internalToken
            ? { authorization: `Bearer ${this.internalToken}` }
            : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`KNOWLEDGE_SERVICE_HTTP_${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
