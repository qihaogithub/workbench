import crypto from "node:crypto";
import {
  canonicalInventoryJson,
  isInventoryGeneratedSemantic,
} from "./shared-runtime.js";
import type {
  InventoryEntry,
  InventoryEvidenceRef,
  InventoryGeneratedSemantic,
} from "@workbench/shared";
import type { InventoryGenerationJob, SqliteInventoryCatalog } from "./inventory-catalog.js";

const MAX_EVIDENCE_BYTES = 8 * 1024;
const MAX_TOTAL_EVIDENCE_BYTES = 24 * 1024;

export interface InventoryEvidenceProvider {
  read(reference: InventoryEvidenceRef): Promise<string | null>;
}

export interface InventorySummaryDraft {
  summary: string;
}

/**
 * The model adapter receives bounded, explicitly untrusted evidence.  It may
 * return only the fixed draft shape; hashes, timestamps and evidence refs are
 * assigned by this service after the model returns.
 */
export interface InventorySummaryGenerator {
  generate(input: {
    entry: Pick<InventoryEntry, "canonicalUri" | "resourceType" | "native" | "human">;
    evidence: Array<{ reference: InventoryEvidenceRef; content: string }>;
  }): Promise<InventorySummaryDraft>;
}

export interface InventoryGenerationRunResult {
  claimed: number;
  ready: number;
  failed: number;
  stale: number;
}

export async function runInventoryGeneration(
  catalog: SqliteInventoryCatalog,
  projectId: string,
  provider: InventoryEvidenceProvider,
  generator: InventorySummaryGenerator,
  limit = 8,
): Promise<InventoryGenerationRunResult> {
  const jobs = catalog.claimGenerationJobs(projectId, limit);
  const result: InventoryGenerationRunResult = { claimed: jobs.length, ready: 0, failed: 0, stale: 0 };
  for (const job of jobs) {
    try {
      const snapshot = catalog.activeSnapshot(projectId);
      const entry = snapshot?.entries.find((candidate) => candidate.canonicalUri === job.canonicalUri);
      if (!entry || entry.sourceState !== "active") {
        catalog.markGenerationSuperseded(job.taskKey);
        result.stale++;
        continue;
      }
      const evidence = await readEvidence(provider, job.evidenceRefs);
      const draft = await generator.generate({
        entry: { canonicalUri: entry.canonicalUri, resourceType: entry.resourceType, native: entry.native, human: entry.human },
        evidence,
      });
      const generated = buildGeneratedSemantic(draft, job);
      if (!isInventoryGeneratedSemantic(generated)) throw new Error("INVENTORY_GENERATOR_INVALID_OUTPUT");
      if (!catalog.applyAnnotation({ projectId, canonicalUri: job.canonicalUri, sourceFingerprint: job.sourceFingerprint, generated })) {
        catalog.markGenerationSuperseded(job.taskKey);
        result.stale++;
      } else {
        result.ready++;
      }
    } catch (error) {
      catalog.markGenerationFailed({ projectId, canonicalUri: job.canonicalUri, sourceFingerprint: job.sourceFingerprint, error: classifyGenerationError(error) });
      result.failed++;
    }
  }
  return result;
}

async function readEvidence(
  provider: InventoryEvidenceProvider,
  references: InventoryEvidenceRef[],
): Promise<Array<{ reference: InventoryEvidenceRef; content: string }>> {
  const evidence: Array<{ reference: InventoryEvidenceRef; content: string }> = [];
  let total = 0;
  for (const reference of references.slice(0, 8)) {
    const raw = await provider.read(reference);
    if (raw === null) continue;
    const content = truncateUtf8(raw, MAX_EVIDENCE_BYTES);
    total += Buffer.byteLength(content, "utf8");
    if (total > MAX_TOTAL_EVIDENCE_BYTES) break;
    evidence.push({ reference, content });
  }
  return evidence;
}

function buildGeneratedSemantic(draft: InventorySummaryDraft, job: InventoryGenerationJob): InventoryGeneratedSemantic {
  const summary = typeof draft.summary === "string" ? draft.summary.trim().slice(0, 4_000) : "";
  const contentHash = crypto.createHash("sha256").update(canonicalInventoryJson({ summary, sourceFingerprint: job.sourceFingerprint, generatorVersion: job.generatorVersion })).digest("hex");
  return {
    summary,
    sourceFingerprint: job.sourceFingerprint,
    contentHash,
    generatorVersion: job.generatorVersion,
    generatedAt: new Date().toISOString(),
    evidenceRefs: job.evidenceRefs,
  };
}

function classifyGenerationError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("INVENTORY_")) return error.message;
  return "INVENTORY_GENERATOR_FAILED";
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = value.slice(0, maxBytes);
  while (result && Buffer.byteLength(result, "utf8") > maxBytes) result = result.slice(0, -1);
  return result;
}
