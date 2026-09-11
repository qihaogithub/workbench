import crypto from "node:crypto";
import {
  canonicalInventoryJson,
  isInventoryGeneratedSemantic,
  INVENTORY_GENERATION_LEASE_MS,
  INVENTORY_GENERATION_MAX_ATTEMPTS,
} from "./shared-runtime.js";
import type {
  InventoryEntry,
  InventoryEvidenceRef,
  InventoryGeneratedSemantic,
  InventoryGenerationErrorCode,
} from "@workbench/shared";
import type { InventoryGenerationJob, SqliteInventoryCatalog } from "./inventory-catalog.js";

const MAX_EVIDENCE_BYTES = 8 * 1024;
const MAX_TOTAL_EVIDENCE_BYTES = 24 * 1024;

export interface InventoryEvidenceProvider {
  read(reference: InventoryEvidenceRef, job: InventoryGenerationJob): Promise<string | null>;
}

export interface InventorySummaryDraft {
  summary: string;
}

/**
 * The model adapter receives bounded, explicitly untrusted evidence. It may
 * return only the fixed draft shape; hashes, timestamps and evidence refs are
 * assigned by this service after the model returns.
 */
export interface InventorySummaryGenerator {
  generate?: (input: {
    entry: Pick<InventoryEntry, "canonicalUri" | "resourceType" | "native" | "human">;
    evidence: Array<{ reference: InventoryEvidenceRef; content: string }>;
    job: InventoryGenerationJob;
  }) => Promise<InventorySummaryDraft>;
  /** Agent-service path: evidence is resolved inside the protected executor. */
  generateJob?: (input: {
    entry: Pick<InventoryEntry, "canonicalUri" | "resourceType" | "native" | "human">;
    job: InventoryGenerationJob;
  }) => Promise<InventorySummaryDraft>;
}

export interface InventoryGenerationRunResult {
  claimed: number;
  ready: number;
  failed: number;
  retried: number;
  stale: number;
  recovered: number;
}

export interface InventoryGenerationRunOptions {
  limit?: number;
  owner?: string;
  now?: number;
  leaseMs?: number;
  maxAttempts?: number;
  random?: () => number;
}

export async function runInventoryGeneration(
  catalog: SqliteInventoryCatalog,
  provider: InventoryEvidenceProvider | null,
  generator: InventorySummaryGenerator,
  options: InventoryGenerationRunOptions = {},
): Promise<InventoryGenerationRunResult> {
  const now = options.now ?? Date.now();
  const recovered = catalog.recoverExpiredGenerationJobs(now, options.maxAttempts ?? INVENTORY_GENERATION_MAX_ATTEMPTS);
  const jobs = catalog.claimGenerationJobs(options.limit ?? 8, {
    owner: options.owner,
    leaseMs: options.leaseMs ?? INVENTORY_GENERATION_LEASE_MS,
    now,
  });
  const result: InventoryGenerationRunResult = {
    claimed: jobs.length,
    ready: 0,
    failed: 0,
    retried: 0,
    stale: 0,
    recovered: recovered.recovered,
  };
  for (const job of jobs) {
    try {
      const snapshot = catalog.activeSnapshot(job.projectId);
      const entry = snapshot?.entries.find((candidate) => candidate.canonicalUri === job.canonicalUri);
      if (!entry || entry.sourceState !== "active") {
        catalog.markGenerationSuperseded(job.taskKey);
        result.stale++;
        continue;
      }
      const entryInput = {
        canonicalUri: entry.canonicalUri,
        resourceType: entry.resourceType,
        native: entry.native,
        human: entry.human,
      } as const;
      let draft: InventorySummaryDraft;
      if (generator.generateJob) {
        draft = await generator.generateJob({ entry: entryInput, job });
      } else if (provider && generator.generate) {
        draft = await generator.generate({ entry: entryInput, evidence: await readEvidence(provider, job), job });
      } else {
        throw generationError("INTERNAL_ERROR", "生成执行器未配置");
      }
      const generated = buildGeneratedSemantic(draft, job);
      if (!isInventoryGeneratedSemantic(generated)) {
        throw generationError("INVALID_OUTPUT", "固定清单输出格式无效");
      }
      const commit = catalog.completeGenerationJob({ job, generated });
      if (commit === "applied" || commit === "duplicate") result.ready++;
      else result.stale++;
    } catch (error) {
      const classified = classifyGenerationError(error);
      const retryable = classified.code === "AGENT_UNAVAILABLE"
        || classified.code === "AUTHORITY_UNAVAILABLE"
        || classified.code === "MODEL_UNAVAILABLE"
        || classified.code === "RATE_LIMITED"
        || classified.code === "TIMEOUT"
        || classified.code === "INTERNAL_ERROR";
      const failure = catalog.failGenerationJob({
        job,
        errorCode: classified.code,
        error: classified.message,
        retryable,
        maxAttempts: options.maxAttempts ?? INVENTORY_GENERATION_MAX_ATTEMPTS,
        availableAt: retryable ? computeRetryAt(job.attempts, Date.now(), options.random) : undefined,
      });
      if (failure === "retry_scheduled") result.retried++;
      else if (failure === "failed") result.failed++;
      else result.stale++;
    }
  }
  if (recovered.failed > 0) result.failed += recovered.failed;
  return result;
}

async function readEvidence(
  provider: InventoryEvidenceProvider,
  job: InventoryGenerationJob,
): Promise<Array<{ reference: InventoryEvidenceRef; content: string }>> {
  const evidence: Array<{ reference: InventoryEvidenceRef; content: string }> = [];
  let total = 0;
  for (const reference of job.evidenceRefs.slice(0, 8)) {
    const raw = await provider.read(reference, job);
    if (raw === null) throw generationError("INVALID_EVIDENCE", "清单证据不可用");
    const content = truncateUtf8(raw, MAX_EVIDENCE_BYTES);
    total += Buffer.byteLength(content, "utf8");
    if (total > MAX_TOTAL_EVIDENCE_BYTES) throw generationError("REQUEST_TOO_LARGE", "清单证据超出大小限制");
    evidence.push({ reference, content });
  }
  return evidence;
}

function buildGeneratedSemantic(draft: InventorySummaryDraft, job: InventoryGenerationJob): InventoryGeneratedSemantic {
  const summary = typeof draft.summary === "string" ? draft.summary.trim().slice(0, 4_000) : "";
  if (!summary) throw generationError("INVALID_OUTPUT", "清单摘要不能为空");
  const contentHash = crypto.createHash("sha256").update(canonicalInventoryJson({
    summary,
    sourceFingerprint: job.sourceFingerprint,
    generatorVersion: job.generatorVersion,
  })).digest("hex");
  return {
    summary,
    sourceFingerprint: job.sourceFingerprint,
    contentHash,
    generatorVersion: job.generatorVersion,
    generatedAt: new Date().toISOString(),
    evidenceRefs: job.evidenceRefs,
  };
}

function classifyGenerationError(error: unknown): { code: InventoryGenerationErrorCode; message: string } {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && isGenerationErrorCode(code)) {
      return { code, message: "生成依赖暂时不可用" };
    }
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message.startsWith("INVENTORY_")) {
      const code = message.slice("INVENTORY_".length);
      if (isGenerationErrorCode(code)) return { code, message };
    }
    if (/timeout|aborted/i.test(message)) return { code: "TIMEOUT", message: "生成请求超时" };
    if (/429|rate.?limit|quota/i.test(message)) return { code: "RATE_LIMITED", message: "模型服务限流" };
    if (/ECONNREFUSED|ENOTFOUND|fetch failed|unavailable/i.test(message)) return { code: "AGENT_UNAVAILABLE", message: "生成服务暂时不可用" };
  }
  return { code: "INTERNAL_ERROR", message: "清单生成失败" };
}

function isGenerationErrorCode(value: string): value is InventoryGenerationErrorCode {
  return [
    "AGENT_UNAVAILABLE", "AUTHORITY_UNAVAILABLE", "STALE_EVIDENCE", "INVALID_EVIDENCE",
    "INVALID_OUTPUT", "MODEL_UNAVAILABLE", "RATE_LIMITED", "TIMEOUT", "REQUEST_TOO_LARGE", "INTERNAL_ERROR",
  ].includes(value);
}

function generationError(code: InventoryGenerationErrorCode, message: string): Error & { code: InventoryGenerationErrorCode } {
  const error = new Error(`INVENTORY_${code}`) as Error & { code: InventoryGenerationErrorCode };
  error.code = code;
  error.message = message;
  return error;
}

function computeRetryAt(attempt: number, now: number, random = Math.random): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return now + base + Math.floor(random() * Math.max(1, Math.floor(base * 0.25)));
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = value.slice(0, maxBytes);
  while (result && Buffer.byteLength(result, "utf8") > maxBytes) result = result.slice(0, -1);
  return result;
}
