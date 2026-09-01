import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DocumentProposalStore,
  DocumentProposalStoreError,
  buildDocumentProposalDiff,
} from "../document-proposal-store";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function input() {
  return {
    projectId: "project-1", workspaceId: "workspace-1", source: "chat" as const, sourceRef: "session-1",
    baseRevision: 3, baseRootHash: "root-hash", expiresAt: Date.now() + 60_000,
    targets: [{ kind: "memory" as const, resourcePath: "memory.md", operationIntent: "replace" as const, baseContent: "one\ntwo\n", proposedContent: "one\nchanged\n" }],
  };
}

describe("DocumentProposalStore", () => {
  it("persists aggregates separately from private snapshots and survives a new instance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-store-")); roots.push(root);
    const first = new DocumentProposalStore({ dataDir: root, idFactory: () => "proposal-1" });
    const proposal = first.create(input());
    expect(first.get("proposal-1")).toEqual(proposal);
    expect(first.readSnapshot("proposal-1", proposal.targets[0].proposedSnapshotRef)).toBe("one\nchanged\n");
    expect(fs.existsSync(path.join(root, "memory.md"))).toBe(false);
    const second = new DocumentProposalStore({ dataDir: root });
    expect(second.list({ projectId: "project-1" })[0]).toEqual(proposal);
  });

  it("uses optimistic versions for approval and rejection", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-store-")); roots.push(root);
    const store = new DocumentProposalStore({ dataDir: root, idFactory: () => "proposal-1" });
    const proposal = store.create(input());
    const approved = store.approve(proposal.proposalId, 1, { id: "user-1" }, "approval-1");
    expect(approved.proposal.status).toBe("applying");
    expect(approved.proposal.proposalVersion).toBe(2);
    expect(approved.proposal.approval).toMatchObject({ actorId: "user-1", idempotencyKey: "approval-1" });
    expect(() => store.reject(proposal.proposalId, 1)).toThrowError(DocumentProposalStoreError);
  });

  it("persists a commit receipt before finalization and can resume a failed finalization", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-store-")); roots.push(root);
    const store = new DocumentProposalStore({ dataDir: root, idFactory: () => "proposal-1" });
    const proposal = store.create(input());
    store.approve(proposal.proposalId, proposal.proposalVersion, { id: "user-1" }, "approval-1");
    const committed = store.recordCommitted(proposal.proposalId, {
      committed: true, mutationId: "mutation-1", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 0,
      revision: 4, rootHash: "next-root", actor: "author-site", resources: [], committedAt: 123,
    });
    expect(committed).toMatchObject({ status: "committed", receipt: { mutationId: "mutation-1", revision: 4 } });
    expect(store.listPendingFinalizations("project-1")).toMatchObject([{ proposalId: "proposal-1", status: "pending", attempts: 0 }]);
    const failed = store.recordFinalization(proposal.proposalId, "failed", "RESOURCE_VERSION_FAILED");
    expect(failed).toMatchObject({ status: "finalization_failed", finalization: { status: "failed" } });
    expect(store.listPendingFinalizations("project-1")).toMatchObject([{ proposalId: "proposal-1", status: "failed", attempts: 1, lastErrorCode: "RESOURCE_VERSION_FAILED" }]);
    expect(store.recordFinalization(proposal.proposalId, "completed").status).toBe("applied");
    expect(store.listPendingFinalizations("project-1")).toEqual([]);
  });

  it("creates stable unified hunks and line counts", () => {
    const a = buildDocumentProposalDiff("memory.md", "a\nb\nc", "a\nx\nc");
    const b = buildDocumentProposalDiff("memory.md", "a\nb\nc", "a\nx\nc");
    expect(a).toEqual(b);
    expect(a.additions).toBe(1); expect(a.deletions).toBe(1);
    expect(a.unified).toContain("-b"); expect(a.unified).toContain("+x");
  });

  it("expires and cleans snapshots without deleting the aggregate", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-store-")); roots.push(root);
    let now = 1000;
    const store = new DocumentProposalStore({ dataDir: root, now: () => now, idFactory: () => "proposal-1" });
    const proposal = store.create({ ...input(), createdAt: now, expiresAt: now + 10 });
    now = 1011;
    expect(store.expire(proposal.proposalId, 1).proposal.status).toBe("expired");
    expect(store.cleanExpiredSnapshots()).toEqual([proposal.proposalId]);
    expect(store.get(proposal.proposalId)?.status).toBe("expired");
    expect(store.readSnapshot(proposal.proposalId, proposal.targets[0].baseSnapshotRef)).toBeNull();
  });
});
