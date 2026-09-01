import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  DocumentEditProposal,
  DocumentProposalDiffHunk,
  DocumentProposalStatus,
  DocumentProposalTarget,
} from "./document-proposal.js";
import { hashDocumentProposalContent } from "./document-proposal.js";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";

const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set<DocumentProposalStatus>([
  "rejected", "expired", "conflict", "failed_before_commit", "finalization_failed", "applied",
]);

export interface DocumentProposalDiff {
  unified: string;
  hunks: DocumentProposalDiffHunk[];
  additions: number;
  deletions: number;
}

export interface DocumentProposalTargetInput extends Omit<DocumentProposalTarget, "baseHash" | "proposedHash" | "baseSnapshotRef" | "proposedSnapshotRef" | "diff"> {
  baseContent: string | null;
  proposedContent: string | null;
}

export interface CreateDocumentProposalInput extends Omit<DocumentEditProposal, "proposalId" | "createdAt" | "proposalVersion" | "targets" | "summary" | "status"> {
  proposalId?: string;
  createdAt?: number;
  status?: Extract<DocumentProposalStatus, "prepared" | "awaiting_approval">;
  targets: readonly DocumentProposalTargetInput[];
}

export interface DocumentProposalStoreOptions {
  dataDir: string;
  now?: () => number;
  idFactory?: () => string;
  snapshotRetentionMs?: number;
}

export interface DocumentProposalListFilter {
  projectId?: string;
  workspaceId?: string;
  status?: DocumentProposalStatus | readonly DocumentProposalStatus[];
}

export interface DocumentProposalActor {
  id: string;
  name?: string;
}

export interface DocumentProposalTransition {
  proposal: DocumentEditProposal;
  actor?: DocumentProposalActor;
  idempotencyKey?: string;
}

/** Durable, content-free recovery record. The aggregate remains the source of
 * truth; this queue makes unfinished finalization discoverable after restart. */
export interface DocumentProposalFinalizationOutboxRecord {
  proposalId: string;
  projectId: string;
  workspaceId: string;
  mutationId: string;
  status: "pending" | "failed" | "completed";
  attempts: number;
  updatedAt: number;
  lastErrorCode?: string;
}

export interface DocumentProposalAuditEvent {
  occurredAt: number;
  proposalId: string;
  projectId: string;
  workspaceId: string;
  action: "created" | "approved" | "rejected" | "expired" | "committed" | "conflict" | "finalization_completed" | "finalization_failed";
  actorId?: string;
  mutationId?: string;
  errorCode?: string;
}

export class DocumentProposalStoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DocumentProposalStoreError";
  }
}

function normalizeText(content: string): string {
  return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function lines(content: string | null): string[] {
  if (content === null || content === "") return [];
  const result = normalizeText(content).split("\n");
  if (result[result.length - 1] === "") result.pop();
  return result;
}

type DiffLine = { type: "context" | "added" | "removed"; content: string };

/** A deterministic, line-oriented diff. It intentionally treats all input as text. */
export function buildDocumentProposalDiff(
  resourcePath: string,
  baseContent: string | null,
  proposedContent: string | null,
  contextLines = 3,
): DocumentProposalDiff {
  const before = lines(baseContent);
  const after = lines(proposedContent);
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const operations: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      operations.push({ type: "context", content: before[i] }); i += 1; j += 1;
    } else if (j < after.length && (i === before.length || table[i][j + 1] >= table[i + 1][j])) {
      operations.push({ type: "added", content: after[j] }); j += 1;
    } else {
      operations.push({ type: "removed", content: before[i] }); i += 1;
    }
  }

  const changed = operations.reduce<number[]>((indices, operation, index) => operation.type === "context" ? indices : [...indices, index], []);
  const hunks: DocumentProposalDiffHunk[] = [];
  if (changed.length) {
    let start = changed[0];
    let end = changed[0];
    const flush = () => {
      const from = Math.max(0, start - contextLines);
      const to = Math.min(operations.length, end + contextLines + 1);
      const selected = operations.slice(from, to);
      let baseStart = 1; let proposedStart = 1;
      for (const op of operations.slice(0, from)) {
        if (op.type !== "added") baseStart += 1;
        if (op.type !== "removed") proposedStart += 1;
      }
      const hunkBaseStart = baseStart;
      const hunkProposedStart = proposedStart;
      const baseLines = selected.filter((op) => op.type !== "added").length;
      const proposedLines = selected.filter((op) => op.type !== "removed").length;
      const fingerprint = `${resourcePath}\0${hunkBaseStart}\0${baseLines}\0${hunkProposedStart}\0${proposedLines}\0${selected.map((op) => `${op.type[0]}${op.content}`).join("\n")}`;
      hunks.push({
        id: crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 16),
        baseStart: hunkBaseStart, baseLines, proposedStart: hunkProposedStart, proposedLines,
        lines: selected,
      });
    };
    for (let index = 1; index < changed.length; index += 1) {
      if (changed[index] - end > contextLines * 2 + 1) { flush(); start = changed[index]; }
      end = changed[index];
    }
    flush();
  }
  const additions = operations.filter((op) => op.type === "added").length;
  const deletions = operations.filter((op) => op.type === "removed").length;
  const unified = [
    `--- ${resourcePath}`,
    `+++ ${resourcePath}`,
    ...hunks.flatMap((hunk) => {
      const range = (start: number, count: number) => count === 1 ? `${start}` : `${start},${count}`;
      return [`@@ -${range(hunk.baseStart, hunk.baseLines)} +${range(hunk.proposedStart, hunk.proposedLines)} @@`, ...hunk.lines.map((line) => `${line.type === "context" ? " " : line.type === "added" ? "+" : "-"}${line.content}`)];
    }),
  ].join("\n");
  return { unified, hunks, additions, deletions };
}

export const createDocumentProposalDiff = buildDocumentProposalDiff;

function safeId(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,190}$/.test(value)) throw new DocumentProposalStoreError("INVALID_ID", `Invalid ${label}`);
  return value;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export class DocumentProposalStore {
  private readonly root: string;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly retentionMs: number;

  constructor(options: DocumentProposalStoreOptions) {
    this.root = path.join(options.dataDir, ".project-admin", "document-proposals");
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => `proposal_${crypto.randomUUID()}`);
    this.retentionMs = options.snapshotRetentionMs ?? DEFAULT_RETENTION_MS;
  }

  create(input: CreateDocumentProposalInput): DocumentEditProposal {
    const proposalId = safeId(input.proposalId ?? this.idFactory(), "proposal id");
    if (!input.targets.length) throw new DocumentProposalStoreError("EMPTY_PROPOSAL", "A proposal must contain at least one target");
    const createdAt = input.createdAt ?? this.now();
    const proposalDir = this.proposalDir(proposalId);
    if (fs.existsSync(proposalDir)) throw new DocumentProposalStoreError("PROPOSAL_EXISTS", "Proposal already exists");
    const targets: DocumentProposalTarget[] = input.targets.map((target, index) => {
      const base = target.baseContent === null ? null : normalizeText(target.baseContent);
      const proposed = target.proposedContent === null ? null : normalizeText(target.proposedContent);
      const diff = buildDocumentProposalDiff(target.resourcePath, base, proposed);
      return {
        kind: target.kind, resourcePath: target.resourcePath, resourceId: target.resourceId,
        baseHash: hashDocumentProposalContent(base), proposedHash: hashDocumentProposalContent(proposed),
        operationIntent: target.operationIntent,
        baseSnapshotRef: base === null ? null : this.snapshotRef(proposalId, index, "base"),
        proposedSnapshotRef: proposed === null ? null : this.snapshotRef(proposalId, index, "proposed"),
        diff,
      };
    });
    const proposal: DocumentEditProposal = {
      proposalId, projectId: input.projectId, workspaceId: input.workspaceId, source: input.source, sourceRef: input.sourceRef,
      status: input.status ?? "awaiting_approval", baseRevision: input.baseRevision, baseRootHash: input.baseRootHash,
      proposalVersion: 1, createdAt, expiresAt: input.expiresAt, targets,
      summary: { targetCount: targets.length, additions: targets.reduce((n, t) => n + t.diff.additions, 0), deletions: targets.reduce((n, t) => n + t.diff.deletions, 0) },
    };
    fs.mkdirSync(path.join(proposalDir, "snapshots"), { recursive: true });
    for (let index = 0; index < input.targets.length; index += 1) {
      const target = input.targets[index];
      for (const side of ["base", "proposed"] as const) {
        const content = side === "base" ? target.baseContent : target.proposedContent;
        if (content !== null) this.writeAtomic(this.snapshotPath(proposalId, index, side), normalizeText(content));
      }
    }
    this.writeAtomic(this.proposalPath(proposalId), `${JSON.stringify(proposal, null, 2)}\n`);
    this.appendAudit({ occurredAt: createdAt, proposalId, projectId: proposal.projectId, workspaceId: proposal.workspaceId, action: "created" });
    return clone(proposal);
  }

  createProposal(input: CreateDocumentProposalInput): DocumentEditProposal { return this.create(input); }

  get(proposalId: string): DocumentEditProposal | null {
    const value = this.read(proposalId);
    return value ? clone(value) : null;
  }

  getProposal(proposalId: string): DocumentEditProposal | null { return this.get(proposalId); }

  list(filter: DocumentProposalListFilter = {}): DocumentEditProposal[] {
    if (!fs.existsSync(this.root)) return [];
    const statuses = filter.status === undefined ? null : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    const proposals = fs.readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.read(entry.name))
      .filter((proposal): proposal is DocumentEditProposal => Boolean(proposal));
    return proposals
      .filter((proposal) => (!filter.projectId || proposal.projectId === filter.projectId) && (!filter.workspaceId || proposal.workspaceId === filter.workspaceId) && (!statuses || statuses.has(proposal.status)))
      .sort((a, b) => a.createdAt - b.createdAt || a.proposalId.localeCompare(b.proposalId))
      .map(clone);
  }

  listProposals(filter?: DocumentProposalListFilter): DocumentEditProposal[] { return this.list(filter); }

  approve(proposalId: string, expectedProposalVersion: number, actor?: DocumentProposalActor, idempotencyKey?: string): DocumentProposalTransition {
    const existing = this.require(proposalId);
    if (existing.status === "applying" && existing.approval?.idempotencyKey === idempotencyKey) {
      return { proposal: existing, actor, idempotencyKey };
    }
    if (existing.status === "committed" || existing.status === "applied" || existing.status === "finalization_failed") {
      if (existing.approval?.idempotencyKey === idempotencyKey) return { proposal: existing, actor, idempotencyKey };
    }
    return this.transition(proposalId, "applying", expectedProposalVersion, actor, idempotencyKey);
  }

  reject(proposalId: string, expectedProposalVersion: number, actor?: DocumentProposalActor, idempotencyKey?: string): DocumentProposalTransition {
    return this.transition(proposalId, "rejected", expectedProposalVersion, actor, idempotencyKey);
  }

  expire(proposalId: string, expectedProposalVersion?: number): DocumentProposalTransition {
    const proposal = this.require(proposalId);
    if (expectedProposalVersion !== undefined && proposal.proposalVersion !== expectedProposalVersion) throw new DocumentProposalStoreError("PROPOSAL_VERSION_CONFLICT", "Proposal version is stale");
    if (proposal.status !== "expired") {
      if (TERMINAL_STATUSES.has(proposal.status)) return { proposal: clone(proposal) };
      return this.transition(proposalId, "expired", proposal.proposalVersion);
    }
    return { proposal: clone(proposal) };
  }

  cleanExpiredSnapshots(now = this.now()): string[] {
    if (!fs.existsSync(this.root)) return [];
    const removed: string[] = [];
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const proposal = this.read(entry.name);
      if (!proposal) continue;
      const due = proposal.expiresAt <= now || (TERMINAL_STATUSES.has(proposal.status) && proposal.createdAt + this.retentionMs <= now);
      if (!due) continue;
      const snapshots = path.join(this.proposalDir(proposal.proposalId), "snapshots");
      if (fs.existsSync(snapshots)) { fs.rmSync(snapshots, { recursive: true, force: true }); removed.push(proposal.proposalId); }
    }
    return removed;
  }

  readSnapshot(proposalId: string, snapshotRef: string | null): string | null {
    if (!snapshotRef) return null;
    const clean = snapshotRef.replace(/^\/+/, "");
    if (!/^snapshots\/\d+\/(base|proposed)\.md$/.test(clean)) throw new DocumentProposalStoreError("INVALID_SNAPSHOT_REF", "Invalid snapshot reference");
    const target = path.resolve(this.proposalDir(safeId(proposalId, "proposal id")), clean);
    if (!target.startsWith(`${path.resolve(this.proposalDir(proposalId))}${path.sep}`) || !fs.existsSync(target)) return null;
    return fs.readFileSync(target, "utf8");
  }

  /** Persist the authoritative Workspace receipt before any best-effort finalization.
   * This creates the recovery boundary: a retry can recognize an already committed
   * proposal and only resume finalization. */
  recordCommitted(proposalId: string, receipt: WorkspaceMutationReceipt): DocumentEditProposal {
    const proposal = this.require(proposalId);
    if ((proposal.status === "committed" || proposal.status === "applied") && proposal.receipt?.mutationId === receipt.mutationId) return proposal;
    if (proposal.status !== "applying") throw new DocumentProposalStoreError("INVALID_PROPOSAL_STATUS", "Proposal is not applying");
    const next: DocumentEditProposal = {
      ...proposal,
      status: "committed",
      proposalVersion: proposal.proposalVersion + 1,
      receipt: { mutationId: receipt.mutationId, revision: receipt.revision, rootHash: receipt.rootHash, committedAt: receipt.committedAt },
      finalization: { status: "pending", updatedAt: this.now() },
    };
    this.writeAtomic(this.proposalPath(proposalId), `${JSON.stringify(next, null, 2)}\n`);
    this.writeFinalizationOutbox({
      proposalId: next.proposalId, projectId: next.projectId, workspaceId: next.workspaceId,
      mutationId: receipt.mutationId, status: "pending", attempts: 0, updatedAt: this.now(),
    });
    this.appendAudit({ occurredAt: this.now(), proposalId: next.proposalId, projectId: next.projectId, workspaceId: next.workspaceId, action: "committed", actorId: next.approval?.actorId, mutationId: receipt.mutationId });
    return clone(next);
  }

  recordFinalization(proposalId: string, result: "completed" | "failed", errorCode?: string): DocumentEditProposal {
    const proposal = this.require(proposalId);
    const receipt = proposal.receipt;
    if (!receipt) throw new DocumentProposalStoreError("MISSING_COMMIT_RECEIPT", "Proposal has not been committed");
    const next: DocumentEditProposal = {
      ...proposal,
      status: result === "completed" ? "applied" : "finalization_failed",
      proposalVersion: proposal.proposalVersion + 1,
      finalization: { status: result, updatedAt: this.now(), ...(errorCode ? { errorCode } : {}) },
    };
    this.writeAtomic(this.proposalPath(proposalId), `${JSON.stringify(next, null, 2)}\n`);
    const outbox = this.readFinalizationOutbox(proposalId);
    if (outbox) this.writeFinalizationOutbox({
      ...outbox,
      status: result,
      attempts: outbox.attempts + 1,
      updatedAt: this.now(),
      ...(result === "failed" && errorCode ? { lastErrorCode: errorCode } : {}),
    });
    this.appendAudit({ occurredAt: this.now(), proposalId: next.proposalId, projectId: next.projectId, workspaceId: next.workspaceId, action: result === "completed" ? "finalization_completed" : "finalization_failed", actorId: next.approval?.actorId, mutationId: receipt.mutationId, ...(errorCode ? { errorCode } : {}) });
    return clone(next);
  }

  listPendingFinalizations(projectId?: string): DocumentProposalFinalizationOutboxRecord[] {
    const outboxDir = this.finalizationOutboxDir();
    if (!fs.existsSync(outboxDir)) return [];
    return fs.readdirSync(outboxDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => this.readFinalizationOutbox(entry.name.slice(0, -5)))
      .filter((record): record is DocumentProposalFinalizationOutboxRecord => Boolean(record))
      .filter((record) => record.status !== "completed" && (!projectId || record.projectId === projectId))
      .sort((a, b) => a.updatedAt - b.updatedAt || a.proposalId.localeCompare(b.proposalId))
      .map(clone);
  }

  recordConflict(proposalId: string): DocumentEditProposal {
    const proposal = this.require(proposalId);
    if (proposal.status === "conflict") return proposal;
    if (proposal.status !== "applying") throw new DocumentProposalStoreError("INVALID_PROPOSAL_STATUS", "Proposal is not applying");
    const next: DocumentEditProposal = { ...proposal, status: "conflict", proposalVersion: proposal.proposalVersion + 1 };
    this.writeAtomic(this.proposalPath(proposalId), `${JSON.stringify(next, null, 2)}\n`);
    this.appendAudit({ occurredAt: this.now(), proposalId: next.proposalId, projectId: next.projectId, workspaceId: next.workspaceId, action: "conflict", actorId: next.approval?.actorId });
    return clone(next);
  }

  private transition(proposalId: string, status: DocumentProposalStatus, expected: number, actor?: DocumentProposalActor, idempotencyKey?: string): DocumentProposalTransition {
    const proposal = this.require(proposalId);
    if (proposal.proposalVersion !== expected) throw new DocumentProposalStoreError("PROPOSAL_VERSION_CONFLICT", "Proposal version is stale");
    if (status === "applying" && !["prepared", "awaiting_approval"].includes(proposal.status)) throw new DocumentProposalStoreError("INVALID_PROPOSAL_STATUS", "Proposal is not awaiting approval");
    if (status === "applying" && proposal.expiresAt <= this.now()) throw new DocumentProposalStoreError("PROPOSAL_EXPIRED", "Proposal has expired");
    if (status === "rejected" && !["prepared", "awaiting_approval"].includes(proposal.status)) throw new DocumentProposalStoreError("INVALID_PROPOSAL_STATUS", "Proposal is not awaiting approval");
    if (status === "expired" && proposal.expiresAt > this.now()) throw new DocumentProposalStoreError("PROPOSAL_NOT_EXPIRED", "Proposal has not expired");
    const next: DocumentEditProposal = {
      ...proposal,
      status,
      proposalVersion: proposal.proposalVersion + 1,
      ...(status === "applying" && actor && idempotencyKey
        ? { approval: { actorId: actor.id, approvedAt: this.now(), idempotencyKey } }
        : {}),
    };
    this.writeAtomic(this.proposalPath(proposalId), `${JSON.stringify(next, null, 2)}\n`);
    if (status === "applying" || status === "rejected" || status === "expired") {
      this.appendAudit({ occurredAt: this.now(), proposalId: next.proposalId, projectId: next.projectId, workspaceId: next.workspaceId, action: status === "applying" ? "approved" : status, actorId: actor?.id });
    }
    return { proposal: clone(next), actor, idempotencyKey };
  }

  private require(id: string): DocumentEditProposal { const proposal = this.get(id); if (!proposal) throw new DocumentProposalStoreError("PROPOSAL_NOT_FOUND", "Proposal not found"); return proposal; }
  private read(id: string): DocumentEditProposal | null { safeId(id, "proposal id"); const file = this.proposalPath(id); if (!fs.existsSync(file)) return null; try { return JSON.parse(fs.readFileSync(file, "utf8")) as DocumentEditProposal; } catch { throw new DocumentProposalStoreError("CORRUPT_PROPOSAL", "Proposal aggregate is corrupted"); } }
  private proposalDir(id: string): string { return path.join(this.root, safeId(id, "proposal id")); }
  private proposalPath(id: string): string { return path.join(this.proposalDir(id), "proposal.json"); }
  private finalizationOutboxDir(): string { return path.join(this.root, "finalization-outbox"); }
  private auditDir(): string { return path.join(this.root, "audit"); }
  private finalizationOutboxPath(id: string): string { return path.join(this.finalizationOutboxDir(), `${safeId(id, "proposal id")}.json`); }
  private readFinalizationOutbox(id: string): DocumentProposalFinalizationOutboxRecord | null {
    const file = this.finalizationOutboxPath(id);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, "utf8")) as DocumentProposalFinalizationOutboxRecord; }
    catch { throw new DocumentProposalStoreError("CORRUPT_FINALIZATION_OUTBOX", "Finalization outbox record is corrupted"); }
  }
  private writeFinalizationOutbox(record: DocumentProposalFinalizationOutboxRecord): void { this.writeAtomic(this.finalizationOutboxPath(record.proposalId), `${JSON.stringify(record, null, 2)}\n`); }
  private appendAudit(event: DocumentProposalAuditEvent): void {
    const day = new Date(event.occurredAt).toISOString().slice(0, 10);
    const file = path.join(this.auditDir(), `${day}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  private snapshotRef(id: string, index: number, side: "base" | "proposed"): string { return `snapshots/${index}/${side}.md`; }
  private snapshotPath(id: string, index: number, side: "base" | "proposed"): string { return path.join(this.proposalDir(id), "snapshots", String(index), `${side}.md`); }
  private writeAtomic(file: string, content: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 }); fs.renameSync(temporary, file); }
}

export function isDocumentProposalHash(value: string | null): boolean { return value === null || SHA256.test(value); }
