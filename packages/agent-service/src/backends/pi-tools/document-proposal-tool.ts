import { resolveManagedDocumentPath } from "@workbench/project-core/document-proposal";
import {
  DocumentProposalStore,
  type DocumentProposalTargetInput,
} from "@workbench/project-core/document-proposal-store";

import type { AgentConfig } from "../../core/types";
import type { WorkspaceAuthoritySnapshot } from "../../workspace/workspace-mutation-authority";

type KnowledgeItem = {
  id: string; title: string; source: "system" | "user"; description: string;
  fileName: string; addedAt: string; updatedAt: string; sizeBytes?: number;
  [key: string]: unknown;
};
type KnowledgeManifest = { version: number; items: KnowledgeItem[] };

function readManifest(raw: string | undefined): KnowledgeManifest {
  if (!raw) return { version: 1, items: [] };
  try {
    const value = JSON.parse(raw) as KnowledgeManifest;
    return Array.isArray(value.items) ? value : { version: 1, items: [] };
  } catch {
    return { version: 1, items: [] };
  }
}

function titleFromMarkdown(content: string, fileName: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fileName.replace(/\.(md|markdown|mdown)$/i, "").replace(/[-_]+/g, " ") || "Untitled";
}

export function createManagedDocumentProposalResult(input: {
  config: AgentConfig;
  dataDir: string;
  projectId: string;
  workspaceId: string;
  snapshot: WorkspaceAuthoritySnapshot;
  resourcePath: string;
  operationIntent: "create" | "replace" | "delete";
  baseContent: string | null;
  proposedContent: string | null;
}): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } | null {
  const manifestRaw = input.snapshot.resources["knowledge/manifest.json"];
  const manifest = readManifest(manifestRaw);
  const target = resolveManagedDocumentPath(input.resourcePath, manifest);
  if (!target) return null;
  const targets: DocumentProposalTargetInput[] = [{
    kind: target.kind,
    resourcePath: target.resourcePath,
    resourceId: target.resourceId,
    operationIntent: input.operationIntent,
    baseContent: input.baseContent,
    proposedContent: input.proposedContent,
  }];
  if (target.kind === "knowledge") {
    const fileName = target.resourcePath.slice("knowledge/".length);
    const existing = manifest.items.find((item) => item.fileName === fileName);
    const now = new Date().toISOString();
    const nextManifest: KnowledgeManifest = {
      ...manifest,
      items: input.operationIntent === "delete"
        ? manifest.items.filter((item) => item.fileName !== fileName)
        : existing
          ? { ...manifest, items: manifest.items.map((item) => item.fileName === fileName ? {
              ...item,
              title: titleFromMarkdown(input.proposedContent ?? "", fileName),
              updatedAt: now,
              sizeBytes: Buffer.byteLength(input.proposedContent ?? "", "utf8"),
            } : item) }.items
          : [...manifest.items, {
              id: `kb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              title: titleFromMarkdown(input.proposedContent ?? "", fileName),
              source: "user",
              description: titleFromMarkdown(input.proposedContent ?? "", fileName),
              fileName,
              addedAt: now,
              updatedAt: now,
              sizeBytes: Buffer.byteLength(input.proposedContent ?? "", "utf8"),
            }],
    };
    const resolvedResourceId = existing?.id ?? nextManifest.items.find((item) => item.fileName === fileName)?.id;
    if (resolvedResourceId) targets[0].resourceId = resolvedResourceId;
    targets.push({
      kind: "knowledge",
      resourcePath: "knowledge/manifest.json",
      operationIntent: "metadata",
      baseContent: manifestRaw ?? null,
      proposedContent: JSON.stringify(nextManifest, null, 2),
    });
  }
  const proposal = new DocumentProposalStore({ dataDir: input.dataDir }).create({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    source: input.config.sessionId.startsWith("comment-task-") ? "comment" : "chat",
    sourceRef: input.config.sessionId,
    baseRevision: input.snapshot.state.revision,
    baseRootHash: input.snapshot.state.rootHash,
    expiresAt: Date.now() + 10 * 60 * 1000,
    targets,
  });
  return {
    content: [{
      type: "text",
      text: `Created document edit proposal ${proposal.proposalId}. The document has not been changed; the user must review and approve the Diff.`,
    }],
    details: {
      proposalId: proposal.proposalId,
      status: proposal.status,
      path: target.resourcePath,
      additions: proposal.summary.additions,
      deletions: proposal.summary.deletions,
      expiresAt: proposal.expiresAt,
    },
  };
}
