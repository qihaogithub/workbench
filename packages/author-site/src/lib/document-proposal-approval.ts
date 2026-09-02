import crypto from "node:crypto";

import { DocumentProposalStore, ProjectAdminService, type DocumentEditProposal } from "@workbench/project-core";
import { classifyManagedDocumentPath, hashDocumentProposalContent } from "@workbench/project-core/document-proposal";
import type { WorkspaceMutationOperation, WorkspaceMutationReceipt } from "@workbench/shared/contracts";

import { getDataDir, findWorkspacePath } from "./fs-utils";
import { commitDocumentProposalMutation } from "./workspace-authority-client";

type KnowledgeManifestItem = { id: string; title: string; source: "system" | "user"; description: string; fileName: string; addedAt: string; updatedAt: string; sizeBytes?: number };

function deletedKnowledgeItem(store: DocumentProposalStore, proposal: DocumentEditProposal, resourceId: string): KnowledgeManifestItem | null {
  const manifest = proposal.targets.find((target) => target.resourcePath === "knowledge/manifest.json");
  if (!manifest) return null;
  const raw = requireSnapshot(store, proposal.proposalId, manifest.baseSnapshotRef);
  if (!raw) return null;
  try {
    const items = (JSON.parse(raw) as { items?: unknown }).items;
    return Array.isArray(items) ? (items.find((item): item is KnowledgeManifestItem => typeof item === "object" && item !== null && (item as { id?: unknown }).id === resourceId) ?? null) : null;
  } catch { return null; }
}

function requireSnapshot(store: DocumentProposalStore, proposalId: string, ref: string | null): string | null {
  const content = store.readSnapshot(proposalId, ref);
  if (ref !== null && content === null) throw new Error("PROPOSAL_SNAPSHOT_MISSING");
  return content;
}

/** The only compilation point from a frozen proposal to strict Authority ops.
 * Browser-supplied paths, contents, hashes, and operations are never accepted. */
export function compileDocumentProposalMutation(input: {
  proposal: DocumentEditProposal;
  store: DocumentProposalStore;
  sessionId: string;
}): { mutationId: string; projectId: string; workspaceId: string; sessionId: string; baseRevision: number; actor: "author-site"; reason: "document_proposal_apply"; operations: WorkspaceMutationOperation[] } {
  const operations: WorkspaceMutationOperation[] = [];
  for (const target of input.proposal.targets) {
    const isManifest = target.resourcePath === "knowledge/manifest.json" && target.operationIntent === "metadata";
    if (!isManifest && !classifyManagedDocumentPath(target.resourcePath)) throw new Error("INVALID_PROPOSAL_TARGET");
    const base = requireSnapshot(input.store, input.proposal.proposalId, target.baseSnapshotRef);
    const proposed = requireSnapshot(input.store, input.proposal.proposalId, target.proposedSnapshotRef);
    if (target.resourcePath === "knowledge/manifest.json" || target.kind === "knowledge" || target.kind === "memory" || target.kind === "convention" || target.kind === "page-convention") {
      if (proposed === null) {
        if (base === null || !target.baseHash) throw new Error("INVALID_PROPOSAL_TARGET");
        operations.push({ type: "delete_path", path: target.resourcePath, expectedHash: target.baseHash });
      } else {
        const computedBaseHash = hashDocumentProposalContent(base);
        if (computedBaseHash !== target.baseHash || hashDocumentProposalContent(proposed) !== target.proposedHash) throw new Error("PROPOSAL_INTEGRITY_ERROR");
        operations.push({
          type: "put_text",
          path: target.resourcePath,
          content: proposed,
          ...(base === null ? { expectedAbsent: true } : { expectedHash: target.baseHash! }),
        });
      }
      continue;
    }
    throw new Error("INVALID_PROPOSAL_TARGET");
  }
  if (!operations.length) throw new Error("EMPTY_PROPOSAL");
  return {
    mutationId: `document-proposal:${input.proposal.proposalId}`,
    projectId: input.proposal.projectId,
    workspaceId: input.proposal.workspaceId,
    sessionId: input.sessionId,
    // Strict CAS is per-resource under Authority's lease. A stale unrelated
    // revision must not make a frozen proposal conflict.
    baseRevision: 0,
    actor: "author-site",
    reason: "document_proposal_apply",
    operations,
  };
}

export async function finalizeDocumentProposal(input: {
  store: DocumentProposalStore;
  proposal: DocumentEditProposal;
  receipt: WorkspaceMutationReceipt;
}): Promise<DocumentEditProposal> {
  try {
    const workspacePath = findWorkspacePath(input.proposal.workspaceId);
    if (!workspacePath) throw new Error("WORKSPACE_NOT_FOUND");
    const service = new ProjectAdminService({ dataDir: getDataDir() });
    for (const target of input.proposal.targets) {
      if (target.kind !== "knowledge" || target.resourcePath === "knowledge/manifest.json" || !target.resourceId) continue;
      if (target.proposedHash === null) {
        const item = deletedKnowledgeItem(input.store, input.proposal, target.resourceId);
        const content = requireSnapshot(input.store, input.proposal.proposalId, target.baseSnapshotRef);
        if (!item || content === null) throw new Error("KNOWLEDGE_TOMBSTONE_SNAPSHOT_MISSING");
        const result = service.resourceVersionCreateKnowledgeTombstone({
          projectId: input.proposal.projectId, resourceId: target.resourceId, item, content,
          workspaceId: input.proposal.workspaceId, workspaceRevision: input.receipt.revision,
          workspaceRootHash: input.receipt.rootHash, note: `Approved deletion proposal ${input.proposal.proposalId}`,
        }, { id: input.proposal.approval?.actorId ?? "author-site", name: "Author Site", role: "creator", source: "author-site" });
        if (!result.ok) throw new Error(result.error?.code ?? "FINALIZATION_FAILED");
        continue;
      }
      const result = service.resourceVersionCreate({
        projectId: input.proposal.projectId,
        kind: "knowledge_document",
        resourceId: target.resourceId,
        sourceWorkspacePath: workspacePath,
        workspaceId: input.proposal.workspaceId,
        workspaceRevision: input.receipt.revision,
        workspaceRootHash: input.receipt.rootHash,
        source: "ai",
        note: `Approved document proposal ${input.proposal.proposalId}`,
      }, { id: input.proposal.approval?.actorId ?? "author-site", name: "Author Site", role: "creator", source: "author-site" });
      if (!result.ok) throw new Error(result.error?.code ?? "FINALIZATION_FAILED");
    }
    return input.store.recordFinalization(input.proposal.proposalId, "completed");
  } catch (error) {
    return input.store.recordFinalization(input.proposal.proposalId, "failed", error instanceof Error ? error.message : "FINALIZATION_FAILED");
  }
}

/** Safe recovery entry point for a restarted Author Site: it never mutates the
 * Workspace, and only resumes durable post-commit finalization records. */
export async function reconcileDocumentProposalFinalizations(input: { projectId?: string } = {}): Promise<DocumentEditProposal[]> {
  const store = new DocumentProposalStore({ dataDir: getDataDir() });
  const completed: DocumentEditProposal[] = [];
  for (const record of store.listPendingFinalizations(input.projectId)) {
    const proposal = store.get(record.proposalId);
    if (!proposal?.receipt) continue;
    const receipt = {
      committed: true as const, mutationId: proposal.receipt.mutationId,
      projectId: proposal.projectId, workspaceId: proposal.workspaceId, baseRevision: 0,
      revision: proposal.receipt.revision, rootHash: proposal.receipt.rootHash,
      actor: "author-site" as const, resources: [], committedAt: proposal.receipt.committedAt,
    } as WorkspaceMutationReceipt;
    completed.push(await finalizeDocumentProposal({ store, proposal, receipt }));
  }
  return completed;
}

export async function approveDocumentProposal(input: {
  proposalId: string;
  proposalVersion: number;
  idempotencyKey: string;
  actorId: string;
  sessionId: string;
}): Promise<DocumentEditProposal> {
  const store = new DocumentProposalStore({ dataDir: getDataDir() });
  let proposal = store.approve(input.proposalId, input.proposalVersion, { id: input.actorId }, input.idempotencyKey).proposal;
  if (!proposal.receipt) {
    try {
      const receipt = await commitDocumentProposalMutation(compileDocumentProposalMutation({ proposal, store, sessionId: input.sessionId }));
      proposal = store.recordCommitted(proposal.proposalId, receipt);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "WORKSPACE_RESOURCE_CONFLICT") store.recordConflict(proposal.proposalId);
      throw error;
    }
  }
  if (proposal.finalization?.status !== "completed") {
    const receipt = proposal.receipt;
    if (!receipt) throw new Error("MISSING_COMMIT_RECEIPT");
    const authorityReceipt = {
      committed: true as const,
      mutationId: receipt.mutationId,
      projectId: proposal.projectId,
      workspaceId: proposal.workspaceId,
      baseRevision: 0,
      revision: receipt.revision,
      rootHash: receipt.rootHash,
      actor: "author-site" as const,
      resources: [],
      committedAt: receipt.committedAt,
    } as WorkspaceMutationReceipt;
    // The proposal's receipt intentionally stores only its public audit subset;
    // finalization only needs the revision and the current Workspace source.
    proposal = await finalizeDocumentProposal({ store, proposal, receipt: authorityReceipt });
  }
  return proposal;
}

export function createApprovalIdempotencyKey(): string { return crypto.randomUUID(); }
