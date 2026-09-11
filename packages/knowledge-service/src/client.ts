import type {
  KnowledgeSearchHit,
  KnowledgeSource,
} from "./sqlite-catalog.js";
import { getLocalhostUrl } from "@workbench/runtime-config/topology";
import type { InventoryQuery, InventoryQueryResult, InventorySnapshot } from "@workbench/shared";
import { PROJECT_INVENTORY_GENERATOR_VERSION } from "./shared-runtime.js";
import type { InventoryGenerationActivity } from "./inventory-catalog.js";

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
      getLocalhostUrl("local", "knowledge")
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

  async searchInventory(input: InventoryQuery & { projectId: string }): Promise<InventoryQueryResult> {
    const response = await this.request("/api/inventory/search", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as { success?: boolean; data?: InventoryQueryResult };
    return payload.success && payload.data
      ? payload.data
      : { entries: [], freshness: "unavailable", total: 0, nextCursor: null, truncated: false };
  }

  async getInventory(projectId: string, limit = 100): Promise<InventoryQueryResult> {
    return this.searchInventory({ projectId, limit });
  }

  async getInventorySnapshot(projectId: string): Promise<InventorySnapshot | null> {
    return (await this.getInventorySnapshotState(projectId)).snapshot;
  }

  async getInventorySnapshotState(projectId: string): Promise<{
    snapshot: InventorySnapshot | null;
    generationActivity: InventoryGenerationActivity;
  }> {
    const response = await this.request(`/api/inventory/snapshot?projectId=${encodeURIComponent(projectId)}`, { method: "GET" });
    if (response.status === 404) return { snapshot: null, generationActivity: "idle" };
    const payload = await response.json() as {
      success?: boolean;
      data?: { snapshot?: InventorySnapshot; generationActivity?: InventoryGenerationActivity } | InventorySnapshot;
    };
    if (!payload.success || !payload.data) return { snapshot: null, generationActivity: "idle" };
    if ("snapshot" in payload.data) {
      return {
        snapshot: payload.data.snapshot ?? null,
        generationActivity: payload.data.generationActivity ?? "idle",
      };
    }
    return { snapshot: payload.data as InventorySnapshot, generationActivity: "idle" };
  }

  async publishInventory(snapshot: InventorySnapshot): Promise<{ generationId: number }> {
    const response = await this.request("/api/inventory/publish", {
      method: "POST",
      body: JSON.stringify({ snapshot }),
    });
    const payload = (await response.json()) as { success?: boolean; data?: { generationId?: number } };
    if (!payload.success || typeof payload.data?.generationId !== "number") {
      throw new Error("INVENTORY_PUBLISH_FAILED");
    }
    return { generationId: payload.data.generationId };
  }

  async createInventoryJobs(
    input: {
      projectId: string;
      workspaceId: string;
      generationId: number;
      requests: unknown[];
      generatorVersion?: string;
    },
  ): Promise<number> {
    const response = await this.request("/api/inventory/jobs", {
      method: "POST",
      body: JSON.stringify({ ...input, generatorVersion: input.generatorVersion ?? PROJECT_INVENTORY_GENERATOR_VERSION }),
    });
    const payload = (await response.json()) as { success?: boolean; data?: { inserted?: number } };
    return payload.success && typeof payload.data?.inserted === "number" ? payload.data.inserted : 0;
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
