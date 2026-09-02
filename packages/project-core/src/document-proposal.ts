import crypto from "node:crypto";

import type { KnowledgeItemMeta, KnowledgeManifest } from "./internal-types.js";

import { normalizeWorkspaceResourcePath } from "./workspace-resource-registry.js";

/** The only allow-list used by document proposal producers and consumers. */
export type ManagedDocumentKind =
  | "knowledge"
  | "memory"
  | "convention"
  | "page-convention";

export type DocumentProposalOperationIntent = "create" | "replace" | "delete" | "rename" | "metadata";

export interface ManagedDocumentPath {
  kind: ManagedDocumentKind;
  resourcePath: string;
  /** A knowledge item id is resolved from the authoritative manifest, never
   * accepted from a UI request. */
  resourceId?: string;
}

export interface DocumentProposalDiffHunk {
  id: string;
  baseStart: number;
  baseLines: number;
  proposedStart: number;
  proposedLines: number;
  lines: Array<{ type: "context" | "added" | "removed"; content: string }>;
}

export interface DocumentProposalTarget {
  kind: ManagedDocumentKind;
  resourcePath: string;
  resourceId?: string;
  baseHash: string | null;
  proposedHash: string | null;
  operationIntent: DocumentProposalOperationIntent;
  /** Private references only. Full contents must not be copied into logs. */
  baseSnapshotRef: string | null;
  proposedSnapshotRef: string | null;
  diff: { unified: string; hunks: DocumentProposalDiffHunk[]; additions: number; deletions: number };
}

export type DocumentProposalStatus =
  | "prepared"
  | "awaiting_approval"
  | "rejected"
  | "expired"
  | "conflict"
  | "applying"
  | "failed_before_commit"
  | "committed"
  | "finalization_failed"
  | "applied";

export interface DocumentEditProposal {
  proposalId: string;
  projectId: string;
  workspaceId: string;
  source: "chat" | "comment";
  sourceRef: string;
  status: DocumentProposalStatus;
  baseRevision: number;
  baseRootHash: string;
  proposalVersion: number;
  createdAt: number;
  expiresAt: number;
  targets: DocumentProposalTarget[];
  summary: { targetCount: number; additions: number; deletions: number };
  approval?: { actorId: string; approvedAt: number; idempotencyKey: string };
  receipt?: { mutationId: string; revision: number; rootHash: string; committedAt: number };
  finalization?: { status: "pending" | "failed" | "completed"; updatedAt: number; errorCode?: string };
}

export function classifyManagedDocumentPath(resourcePath: string): ManagedDocumentPath | null {
  const normalized = normalizeWorkspaceResourcePath(resourcePath.replace(/^\.\//, ""));
  if (!normalized) return null;
  if (/^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(normalized)) {
    return { kind: "knowledge", resourcePath: normalized };
  }
  if (normalized === "memory.md") return { kind: "memory", resourcePath: normalized };
  if (normalized === "convention.md") return { kind: "convention", resourcePath: normalized };
  if (/^demos\/[^/]+\/convention\.md$/.test(normalized)) {
    return { kind: "page-convention", resourcePath: normalized };
  }
  return null;
}

/** Resolve the stable knowledge resource id from the manifest held in the
 * frozen Authority snapshot. A supplied id is deliberately not an input. */
export function resolveManagedDocumentPath(
  resourcePath: string,
  manifest?: Pick<KnowledgeManifest, "items"> | null,
): ManagedDocumentPath | null {
  const target = classifyManagedDocumentPath(resourcePath);
  if (!target || target.kind !== "knowledge") return target;
  const fileName = target.resourcePath.slice("knowledge/".length);
  const item = manifest?.items.find((candidate: KnowledgeItemMeta) => candidate.fileName === fileName);
  return item ? { ...target, resourceId: item.id } : target;
}

export function isManagedDocumentOperation(
  operation: DocumentProposalOperationIntent,
  target: ManagedDocumentPath,
): boolean {
  if (target.kind !== "knowledge") return operation === "replace" || operation === "create" || operation === "delete";
  return true;
}

export function hashDocumentProposalContent(content: string | null): string | null {
  return content === null ? null : crypto.createHash("sha256").update(content).digest("hex");
}
