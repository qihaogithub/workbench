import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";

import { createWorkspaceResourceRegistry } from "../workspace-resource-registry.js";
import {
  PagePackageBuilder,
  PagePackageBuilderError,
} from "../page-transfer/package-builder.js";
import { PageTransferService } from "../page-transfer/service.js";
import { PageTransferStore } from "../page-transfer/store.js";
import type {
  PagePackageBuildInput,
  PageTransferPageMeta,
} from "../page-transfer/types.js";

function page(
  runtimeType: PageTransferPageMeta["runtimeType"],
  pageId = "source",
): PagePackageBuildInput {
  const files: Record<string, string> = {
    "prototype-html-css": {
      "prototype.html": "<main />",
      "prototype.css": "main{}",
      "prototype.meta.json": "{}",
      "config.schema.json": "{}",
    },
    "sandboxed-html": {
      "sandbox.html": "<main />",
      "html-import.meta.json": "{}",
      "config.schema.json": "{}",
    },
    "high-fidelity-react": {
      "index.tsx": "export default function Page() { return null; }",
      "config.schema.json": "{}",
    },
    "sketch-scene": {
      "sketch.scene.json": JSON.stringify({
        version: 1,
        pageSize: { width: 100, height: 100 },
        nodes: [],
      }),
      "sketch.meta.json": "{}",
      "config.schema.json": "{}",
    },
  }[runtimeType];
  return {
    pageId,
    meta: { id: pageId, name: pageId, runtimeType },
    resources: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        `demos/${pageId}/${name}`,
        content,
      ]),
    ),
    registry: createWorkspaceResourceRegistry(),
  };
}

function receipt(mutationId: string): WorkspaceMutationReceipt {
  return {
    committed: true,
    mutationId,
    projectId: "target",
    workspaceId: "target-live",
    baseRevision: 0,
    revision: 1,
    rootHash: "root",
    actor: "author-site",
    resources: [],
    committedAt: Date.now(),
  };
}
const transferProof = {
  sourceRevision: 3,
  sourceRootHash: "source-root",
  targetBaseRevision: 7,
  targetBaseRootHash: "target-root",
  targetFolderId: null,
  createdBy: "u",
} as const;

describe("PagePackageBuilder", () => {
  it.each([
    "prototype-html-css",
    "sandboxed-html",
    "high-fidelity-react",
    "sketch-scene",
  ] as const)("collects all required resources for %s", (runtimeType) => {
    const input = page(runtimeType);
    const built = new PagePackageBuilder().build({
      ...input,
      resources: {
        ...input.resources,
        "assets/hero.png": Buffer.from([1, 2, 3]),
        "design-spec/manifest.json": JSON.stringify({ version: 1, items: [] }),
      },
    });
    expect(built.resources.map((resource) => resource.path)).toEqual(
      expect.arrayContaining(["assets/hero.png", "design-spec/manifest.json"]),
    );
    expect(
      built.resources.every((resource) =>
        /^[a-f0-9]{64}$/.test(resource.contentHash),
      ),
    ).toBe(true);
    expect(built.packageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a missing runtime entry and ignores unrelated managed resources", () => {
    const input = page("sketch-scene");
    const resources = { ...input.resources };
    delete resources["demos/source/sketch.meta.json"];
    resources["demos/other/index.tsx"] = "other";
    expect(() =>
      new PagePackageBuilder().build({ ...input, resources }),
    ).toThrowError(PagePackageBuilderError);
  });
});

describe("PageTransferStore", () => {
  it("uses WAL and makes job/grant/head/outbox writes idempotent", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-transfer-"));
    const store = new PageTransferStore({
      dataDir: root,
      idFactory: () => "fixed",
      now: () => 100,
    });
    const job = store.createJob({
      id: "job-1",
      idempotencyKey: "idem",
      sourceProjectId: "s",
      sourceWorkspaceId: "sw",
      targetProjectId: "t",
      targetWorkspaceId: "tw",
      mode: "reference",
      ...transferProof,
    });
    expect(store.createJob({ ...job, id: "other" }).id).toBe("job-1");
    expect(
      String(store.db.pragma("journal_mode", { simple: true })).toLowerCase(),
    ).toBe("wal");
    store.upsertGrant({
      sourceProjectId: "s",
      sourcePageId: "p",
      targetProjectId: "t",
      targetPageId: "tp",
      sourceHeadHash: "h",
      createdBy: "u",
    });
    store.upsertGrant({
      sourceProjectId: "s",
      sourcePageId: "p",
      targetProjectId: "t",
      targetPageId: "tp",
      sourceHeadHash: "h2",
      createdBy: "u",
    });
    expect(store.listGrants()).toHaveLength(1);
    store.upsertHead({
      grantId: store.listGrants()[0].id,
      sourcePageVersionId: "v2",
      sourceContentHash: "h2",
      status: "ready",
      materializationId: "m2",
      lastKnownGoodMaterializationId: "m2",
    });
    expect(store.getHead(store.listGrants()[0].id)?.sourceContentHash).toBe(
      "h2",
    );
    store.enqueue({
      id: "box",
      jobId: job.id,
      kind: "topology",
      payload: { a: 1 },
    });
    store.enqueue({
      id: "box",
      jobId: job.id,
      kind: "topology",
      payload: { a: 2 },
    });
    expect(store.pendingOutbox()).toHaveLength(1);
    store.close();
  });
});

describe("PageTransferService", () => {
  it("commits pages independently, preserving stable IDs and structured partial conflicts", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "page-transfer-service-"),
    );
    const store = new PageTransferStore({ dataDir: root });
    const source: PagePackageBuildInput[] = [
      page("high-fidelity-react", "one"),
      page("prototype-html-css", "two"),
    ];
    const committed: string[] = [];
    const service = new PageTransferService(
      store,
      {
        authorize: async () => undefined,
        getPage: async ({ pageId }) => {
          const found = source.find((item) => item.pageId === pageId);
          if (!found) throw new Error("not found");
          return found;
        },
      },
      {
        commitPage: async ({ mutationId }) => {
          if (mutationId.endsWith(":two")) {
            const error = Object.assign(new Error("stale target"), {
              code: "WORKSPACE_RESOURCE_CONFLICT",
            });
            throw error;
          }
          committed.push(mutationId);
          return receipt(mutationId);
        },
      },
    );
    const prepared = await service.prepare({
      idempotencyKey: "copy-1",
      sourceProjectId: "s",
      sourceWorkspaceId: "sw",
      sourcePageIds: ["one", "two"],
      targetProjectId: "t",
      targetWorkspaceId: "tw",
      mode: "copy",
      actorId: "u",
      ...transferProof,
    });
    const again = await service.prepare({
      idempotencyKey: "copy-1",
      sourceProjectId: "s",
      sourceWorkspaceId: "sw",
      sourcePageIds: ["one", "two"],
      targetProjectId: "t",
      targetWorkspaceId: "tw",
      mode: "copy",
      actorId: "u",
      ...transferProof,
    });
    expect(again.job.id).toBe(prepared.job.id);
    const result = await service.execute({
      transferId: prepared.job.id,
      actorId: "u",
    });
    expect(result.job.status).toBe("partial");
    expect(
      result.items.find((item) => item.sourcePageId === "one")?.status,
    ).toBe("committed");
    expect(
      result.items.find((item) => item.sourcePageId === "two")?.status,
    ).toBe("conflict");
    expect(result.conflicts[0]?.code).toBe("WORKSPACE_RESOURCE_CONFLICT");
    expect(committed).toHaveLength(1);
    store.close();
  });

  it("activates, resolves, revokes and marks reference grants source_deleted", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "page-transfer-reference-"),
    );
    const store = new PageTransferStore({ dataDir: root });
    let observedPendingGrantId: string | undefined;
    const service = new PageTransferService(
      store,
      {
        authorize: async () => undefined,
        getPage: async () => page("high-fidelity-react"),
      },
      {
        commitPage: async ({ mutationId, referenceGrantId }) => {
          observedPendingGrantId = referenceGrantId;
          expect(store.getGrant(referenceGrantId as string)?.status).toBe(
            "pending",
          );
          return receipt(mutationId);
        },
      },
    );
    const prepared = await service.prepare({
      idempotencyKey: "ref-1",
      sourceProjectId: "s",
      sourceWorkspaceId: "sw",
      sourcePageIds: ["source"],
      targetProjectId: "t",
      targetWorkspaceId: "tw",
      mode: "reference",
      actorId: "u",
      ...transferProof,
    });
    const executed = await service.execute({
      transferId: prepared.job.id,
      actorId: "u",
    });
    const grant = store.listGrants()[0];
    expect(grant.id).toBe(observedPendingGrantId);
    expect(service.resolveReference(grant.id).status).toBe("active");
    service.markSourceDeleted("s", "source");
    expect(store.getGrant(grant.id)?.status).toBe("source_deleted");
    service.revoke(executed.job.id);
    expect(store.getJob(executed.job.id)?.status).toBe("revoked");
    store.close();
  });

  it("blocks source drift after prepare and exposes preflight conflicts before mutation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-transfer-drift-"));
    const store = new PageTransferStore({ dataDir: root });
    let current = page("high-fidelity-react");
    let commits = 0;
    const service = new PageTransferService(
      store,
      {
        authorize: async () => undefined,
        getPage: async () => current,
      },
      {
        preflightPage: async () => [],
        commitPage: async ({ mutationId }) => {
          commits += 1;
          return receipt(mutationId);
        },
      },
    );
    const prepared = await service.prepare({
      idempotencyKey: "drift",
      sourceProjectId: "s",
      sourceWorkspaceId: "sw",
      sourcePageIds: ["source"],
      targetProjectId: "t",
      targetWorkspaceId: "tw",
      mode: "copy",
      actorId: "u",
      ...transferProof,
    });
    current = {
      ...current,
      resources: {
        ...current.resources,
        "demos/source/index.tsx":
          "export default function Changed() { return null; }",
      },
    };
    const result = await service.execute({
      transferId: prepared.job.id,
      actorId: "u",
    });
    expect(result.items[0].status).toBe("conflict");
    expect(result.items[0].conflict?.code).toBe("SOURCE_VERSION_CHANGED");
    expect(commits).toBe(0);
    store.close();
  });
});
