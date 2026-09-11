import type { InventoryEntry } from "@workbench/shared";
import { getLocalhostUrl } from "@workbench/runtime-config/topology";
import type { InventoryGenerationJob } from "./inventory-catalog.js";

export interface InventoryAgentSummaryDraft {
  summary: string;
}

export interface InventoryAgentClientOptions {
  baseUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
}

export interface InventoryAgentGenerationInput {
  job: InventoryGenerationJob;
  entry: Pick<InventoryEntry, "canonicalUri" | "resourceType" | "native">;
}

export class InventoryAgentClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;
  private readonly timeoutMs: number;

  constructor(options: InventoryAgentClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl
      ?? process.env.AGENT_SERVICE_URL
      ?? getLocalhostUrl("local", "agent")
    ).replace(/\/+$/, "");
    this.internalToken = options.internalToken ?? process.env.INTERNAL_API_TOKEN?.trim();
    this.timeoutMs = options.timeoutMs ?? 25_000;
  }

  async generate(input: InventoryAgentGenerationInput): Promise<InventoryAgentSummaryDraft> {
    const response = await this.request("/internal/inventory/generate", {
      method: "POST",
      body: JSON.stringify({
        projectId: input.job.projectId,
        workspaceId: input.job.workspaceId,
        taskKey: input.job.taskKey,
        generationId: input.job.generationId,
        attemptId: input.job.attemptId,
        leaseToken: input.job.leaseToken,
        canonicalUri: input.entry.canonicalUri,
        sourceFingerprint: input.job.sourceFingerprint,
        generatorVersion: input.job.generatorVersion,
        resourceType: input.entry.resourceType,
        native: input.entry.native,
        evidenceRefs: input.job.evidenceRefs,
      }),
    });
    const payload = await response.json().catch(() => null) as {
      success?: boolean;
      data?: { summary?: unknown };
      error?: { code?: unknown };
    } | null;
    if (!response.ok || !payload?.success || typeof payload.data?.summary !== "string") {
      const code = typeof payload?.error?.code === "string"
        ? payload.error.code
        : response.status === 401
          ? "AGENT_UNAVAILABLE"
          : "MODEL_UNAVAILABLE";
      throw inventoryAgentError(code);
    }
    return { summary: payload.data.summary };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(this.internalToken ? { authorization: `Bearer ${this.internalToken}` } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw inventoryAgentError("TIMEOUT");
      }
      throw inventoryAgentError("AGENT_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function inventoryAgentError(code: string): Error {
  const error = new Error(`INVENTORY_${code}`);
  error.name = "InventoryAgentError";
  return error;
}
