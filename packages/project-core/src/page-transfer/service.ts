import crypto from "node:crypto";

import { PagePackageBuilder } from "./package-builder.js";
import { PageTransferStore } from "./store.js";
import type {
  ExecutePageTransferInput,
  PageTransferConflict,
  PageTransferResult,
  PageTransferWarning,
  PreparePageTransferInput,
  ReferenceGrant,
  SourceSnapshotAuthPort,
  TargetMutationPort,
} from "./types.js";

export class PageTransferService {
  private readonly builder: PagePackageBuilder;
  constructor(
    private readonly store: PageTransferStore,
    private readonly source: SourceSnapshotAuthPort,
    private readonly target: TargetMutationPort,
    builder = new PagePackageBuilder(),
  ) {
    this.builder = builder;
  }

  async prepare(input: PreparePageTransferInput): Promise<PageTransferResult> {
    await this.source.authorize({
      sourceProjectId: input.sourceProjectId,
      sourceWorkspaceId: input.sourceWorkspaceId,
      pageIds: input.sourcePageIds,
      actorId: input.actorId,
    });
    const existing = this.store.getJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return this.result(existing.id);
    const job = this.store.createJob({
      id:
        input.transferId ??
        `transfer_${crypto.createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24)}`,
      idempotencyKey: input.idempotencyKey,
      sourceProjectId: input.sourceProjectId,
      sourceWorkspaceId: input.sourceWorkspaceId,
      targetProjectId: input.targetProjectId,
      targetWorkspaceId: input.targetWorkspaceId,
      mode: input.mode,
      sourceRevision: input.sourceRevision,
      sourceRootHash: input.sourceRootHash,
      targetBaseRevision: input.targetBaseRevision,
      targetBaseRootHash: input.targetBaseRootHash,
      targetFolderId: input.targetFolderId ?? null,
      placement: input.placement,
      pagePlacements: input.pagePlacements,
      createdBy: input.actorId,
    });
    for (const sourcePageId of input.sourcePageIds) {
      try {
        const packageData = this.builder.build(
          await this.source.getPage({
            sourceProjectId: input.sourceProjectId,
            sourceWorkspaceId: input.sourceWorkspaceId,
            pageId: sourcePageId,
          }),
        );
        const targetPageId = this.stableTargetId(job.id, sourcePageId);
        const conflicts = this.target.preflightPage
          ? await this.target.preflightPage({
              targetProjectId: input.targetProjectId,
              targetWorkspaceId: input.targetWorkspaceId,
              targetPageId,
              page: packageData,
              mode: input.mode,
              targetFolderId: input.targetFolderId ?? null,
            })
          : [];
        this.store.upsertItem({
          jobId: job.id,
          sourcePageId,
          targetPageId,
          status: conflicts.length ? "conflict" : "pending",
          packageHash: packageData.packageHash,
          mutationId: `page-transfer:${job.id}:${sourcePageId}`,
          referenceGrantId:
            input.mode === "reference"
              ? this.stableGrantId(job.id, sourcePageId)
              : undefined,
          conflict: conflicts[0],
        });
      } catch (error) {
        const code = this.errorCode(error);
        const blocked =
          code === "DYNAMIC_CONFIG_DEPENDENCY" ||
          code === "EXTERNAL_PAGE_RELATION";
        this.store.upsertItem({
          jobId: job.id,
          sourcePageId,
          targetPageId: this.stableTargetId(job.id, sourcePageId),
          status: blocked ? "conflict" : "failed",
          packageHash: "",
          mutationId: `page-transfer:${job.id}:${sourcePageId}`,
          referenceGrantId:
            input.mode === "reference"
              ? this.stableGrantId(job.id, sourcePageId)
              : undefined,
          conflict: blocked
            ? {
                code,
                message: error instanceof Error ? error.message : String(error),
                sourcePageId,
                allowedActions: [],
              }
            : undefined,
          warning: blocked
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
    return this.result(job.id);
  }

  async execute(input: ExecutePageTransferInput): Promise<PageTransferResult> {
    const job = this.store.getJob(input.transferId);
    if (!job) throw new Error("TRANSFER_NOT_FOUND");
    this.store.transitionJob(job.id, "executing");
    for (const item of this.store
      .listItems(job.id)
      .filter(
        (value) => value.status === "failed" && Boolean(value.packageHash),
      )) {
      this.store.transitionItem(job.id, item.sourcePageId, "pending", {
        conflict: undefined,
        warning: undefined,
      });
    }
    for (const item of this.store
      .listItems(job.id)
      .filter((value) => value.status === "conflict")) {
      const conflict = item.conflict;
      const resolved =
        conflict &&
        input.resolutions?.some(
          (resolution) =>
            resolution.sourcePageId === item.sourcePageId &&
            resolution.code === conflict.code &&
            (resolution.key ?? "") === (conflict.key ?? ""),
        );
      if (resolved)
        this.store.transitionItem(job.id, item.sourcePageId, "pending", {
          conflict: undefined,
        });
    }
    for (const item of this.store
      .listItems(job.id)
      .filter((i) => i.status === "pending")) {
      try {
        const inputPage = await this.source.getPage({
          sourceProjectId: job.sourceProjectId,
          sourceWorkspaceId: job.sourceWorkspaceId,
          pageId: item.sourcePageId,
        });
        const page = this.builder.build(inputPage);
        if (page.packageHash !== item.packageHash)
          throw Object.assign(new Error("源页面已偏离预检时固定的提交版本"), {
            code: "SOURCE_VERSION_CHANGED",
          });
        const terminalSourceProjectId =
          typeof page.referenceMeta?.terminalSourceProjectId === "string"
            ? page.referenceMeta.terminalSourceProjectId
            : job.sourceProjectId;
        const terminalSourcePageId =
          typeof page.referenceMeta?.terminalSourcePageId === "string"
            ? page.referenceMeta.terminalSourcePageId
            : item.sourcePageId;
        if (job.mode === "reference" && item.referenceGrantId) {
          this.store.upsertGrant({
            id: item.referenceGrantId,
            sourceProjectId: terminalSourceProjectId,
            sourcePageId: terminalSourcePageId,
            targetProjectId: job.targetProjectId,
            targetPageId: item.targetPageId,
            sourceHeadHash: page.packageHash,
            createdBy: job.createdBy,
            status: "pending",
          });
        }
        const receipt = await this.target.commitPage({
          mutationId: item.mutationId,
          targetProjectId: job.targetProjectId,
          targetWorkspaceId: job.targetWorkspaceId,
          targetPageId: item.targetPageId,
          page,
          mode: job.mode,
          referenceGrantId: item.referenceGrantId,
          targetFolderId: job.targetFolderId,
          placement: job.placement,
          pagePlacement: job.pagePlacements?.[item.sourcePageId],
          resolutions: input.resolutions?.filter(
            (resolution) => resolution.sourcePageId === item.sourcePageId,
          ),
        });
        this.store.transitionItem(job.id, item.sourcePageId, "committed", {
          receipt,
        });
        if (job.mode === "reference") {
          if (!item.referenceGrantId)
            throw new Error("REFERENCE_GRANT_ID_MISSING");
          this.store.activateGrant(item.referenceGrantId);
          this.store.updateReferenceHead({
            grantId: item.referenceGrantId,
            sourcePageVersionId: page.packageHash,
            sourceContentHash: page.packageHash,
            status: "pending",
          });
        }
      } catch (error) {
        const conflict: PageTransferConflict = {
          code: this.errorCode(error),
          message: error instanceof Error ? error.message : String(error),
        };
        this.store.transitionItem(
          job.id,
          item.sourcePageId,
          this.isConflictCode(conflict.code) ? "conflict" : "failed",
          { conflict },
        );
      }
    }
    const items = this.store.listItems(job.id);
    const committed = items.filter((i) => i.status === "committed");
    this.store.enqueue({
      id: `topology:${job.id}`,
      jobId: job.id,
      kind: "topology",
      payload: { itemCount: committed.length },
    });
    this.store.transitionJob(
      job.id,
      committed.length === items.length
        ? "completed"
        : committed.length
          ? "partial"
          : "failed",
    );
    return this.result(job.id);
  }

  get(transferId: string): Promise<PageTransferResult> {
    return Promise.resolve(this.result(transferId));
  }
  revoke(transferId: string): PageTransferResult {
    const job = this.store.getJob(transferId);
    if (!job) throw new Error("TRANSFER_NOT_FOUND");
    this.store.transitionJob(transferId, "revoked");
    const targetIds = new Set(
      this.store.listItems(job.id).map((item) => item.targetPageId),
    );
    for (const grant of this.store.listGrants())
      if (
        grant.targetProjectId === job.targetProjectId &&
        grant.targetPageId &&
        targetIds.has(grant.targetPageId)
      )
        this.store.transitionGrant(grant.id, "revoked");
    return this.result(transferId);
  }
  revokeGrant(grantId: string): ReferenceGrant {
    const grant = this.store.getGrant(grantId);
    if (!grant) throw new Error("REFERENCE_NOT_FOUND");
    if (grant.status === "revoked") return grant;
    return this.store.revokeGrant(grantId);
  }
  resolveReference(grantId: string): ReferenceGrant {
    const grant = this.store.getGrant(grantId);
    if (!grant || grant.status !== "active")
      throw new Error("REFERENCE_NOT_ACTIVE");
    return grant;
  }
  markSourceDeleted(sourceProjectId: string, sourcePageId: string): void {
    for (const grant of this.store.listGrants(sourceProjectId, sourcePageId))
      this.store.markGrantSourceDeleted(grant.id);
  }
  async processOutbox(limit = 100): Promise<number> {
    if (!this.target.commitTopology) return 0;
    let completed = 0;
    for (const entry of this.store.pendingOutbox(limit)) {
      const job = this.store.getJob(entry.jobId);
      if (!job || entry.kind !== "topology") continue;
      this.store.markOutbox(entry.id, "processing");
      try {
        await this.target.commitTopology({
          mutationId: `topology:${job.id}`,
          targetProjectId: job.targetProjectId,
          targetWorkspaceId: job.targetWorkspaceId,
          jobId: job.id,
          sourceProjectId: job.sourceProjectId,
          sourceWorkspaceId: job.sourceWorkspaceId,
          items: this.store
            .listItems(job.id)
            .filter((item) => item.status === "committed"),
        });
        this.store.markOutbox(entry.id, "completed");
        this.store.transitionJob(job.id, job.status, {
          topologyStatus: "committed",
        });
        completed += 1;
      } catch (error) {
        this.store.markOutbox(
          entry.id,
          "failed",
          error instanceof Error ? error.message : String(error),
        );
        this.store.transitionJob(job.id, job.status, {
          topologyStatus: "failed",
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return completed;
  }

  private result(
    id: string,
    conflicts: PageTransferConflict[] = [],
  ): PageTransferResult {
    const job = this.store.getJob(id);
    if (!job) throw new Error("TRANSFER_NOT_FOUND");
    const items = this.store.listItems(id);
    const warnings: PageTransferWarning[] = items
      .filter((i) => i.warning)
      .map((i) => ({
        code: "ITEM_WARNING",
        message: i.warning as string,
        pageId: i.sourcePageId,
      }));
    return {
      job,
      items,
      conflicts: [
        ...conflicts,
        ...items.flatMap((i) => (i.conflict ? [i.conflict] : [])),
      ],
      warnings,
    };
  }
  private stableTargetId(jobId: string, pageId: string): string {
    return `transfer_${crypto.createHash("sha256").update(`${jobId}:${pageId}`).digest("hex").slice(0, 20)}`;
  }
  private stableGrantId(jobId: string, pageId: string): string {
    return `grant_${crypto.createHash("sha256").update(`${jobId}:${pageId}:grant`).digest("hex").slice(0, 24)}`;
  }
  private errorCode(error: unknown): string {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "TRANSFER_ITEM_FAILED";
  }
  private isConflictCode(code: string): boolean {
    return (
      code.includes("CONFLICT") ||
      code === "SOURCE_VERSION_CHANGED" ||
      code === "EXTERNAL_PAGE_RELATION" ||
      code === "DYNAMIC_CONFIG_DEPENDENCY"
    );
  }
}
