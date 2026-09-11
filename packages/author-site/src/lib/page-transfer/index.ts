import fs from "node:fs";
import path from "node:path";

import {
  PageTransferService,
  PageTransferStore,
  type PageTransferConflict as CoreConflict,
  type PageTransferResolution as CoreResolution,
  type PageTransferResult,
  type ProjectAdminActor,
  type ReferenceGrant,
} from "@workbench/project-core";
import type {
  PageReferenceGrant,
  PageTransferConflict,
  PageTransferConflictKind,
  PageTransferItem,
  PageTransferJob,
  PageTransferResolution,
} from "@workbench/shared";

import { getProjectAdminService } from "@/lib/project-admin-service";
import { getWorkspaceAuthoritySnapshot } from "@/lib/workspace-authority-client";

import {
  closeSourcePort,
  createSourcePort,
  createTargetPort,
} from "./adapters";
import type { PageTransferPrepareInput } from "./types";

function editable(actor: ProjectAdminActor): boolean {
  return actor.role === "admin" || actor.role === "creator";
}

function requireProject(
  projectId: string,
  actor: ProjectAdminActor,
  requireEdit: boolean,
) {
  const service = getProjectAdminService();
  const result = service.getProject(projectId, actor);
  if (!result.ok || !result.data)
    throw Object.assign(new Error(result.error?.message ?? "项目不可访问"), {
      code: result.error?.code ?? "FORBIDDEN",
    });
  if (requireEdit && (!editable(actor) || result.data.locked))
    throw Object.assign(new Error("项目不可编辑"), { code: "FORBIDDEN" });
  return result.data;
}

function conflictKind(code: string): PageTransferConflictKind {
  if (code === "PROJECT_CONFIG_DEFINITION_CONFLICT")
    return "project_config_definition";
  if (code === "PROJECT_CONFIG_VALUE_CONFLICT") return "project_config_value";
  if (code === "ROUTE_KEY_CONFLICT") return "route_key";
  if (code === "EXTERNAL_PAGE_RELATION") return "external_page_relation";
  if (code === "DYNAMIC_CONFIG_DEPENDENCY") return "dynamic_config_dependency";
  if (code === "SOURCE_VERSION_CHANGED") return "source_version_changed";
  return "target_changed";
}

function conflictId(
  jobId: string,
  sourcePageId: string,
  conflict: CoreConflict,
): string {
  return [jobId, sourcePageId, conflict.code, conflict.key ?? ""]
    .map(encodeURIComponent)
    .join(":");
}

function publicConflict(
  jobId: string,
  sourcePageId: string,
  value: CoreConflict,
): PageTransferConflict {
  return {
    id: conflictId(jobId, sourcePageId, value),
    sourcePageId,
    kind: conflictKind(value.code),
    key: value.key,
    message: value.message,
    sourceValue: value.sourceValue,
    targetValue: value.targetValue,
    allowedActions: [...(value.allowedActions ?? [])],
  };
}

function publicItem(
  result: PageTransferResult,
  item: PageTransferResult["items"][number],
): PageTransferItem {
  const conflicts = item.conflict
    ? [publicConflict(result.job.id, item.sourcePageId, item.conflict)]
    : [];
  const status: PageTransferItem["status"] =
    item.status === "pending"
      ? "ready"
      : item.status === "conflict"
        ? "needs_resolution"
        : item.status === "committed"
          ? "completed"
          : "failed";
  return {
    sourcePageId: item.sourcePageId,
    sourcePageVersionId: item.packageHash,
    targetPageId: item.targetPageId,
    status,
    conflicts,
    warnings: item.warning ? [item.warning] : [],
    referenceGrantId: item.referenceGrantId,
    receipt: item.receipt,
    errorCode: item.conflict?.code,
  };
}

export function toPublicJob(result: PageTransferResult): PageTransferJob {
  const items = result.items.map((item) => publicItem(result, item));
  const hasConflict = items.some((item) => item.status === "needs_resolution");
  const status: PageTransferJob["status"] =
    result.job.status === "prepared"
      ? hasConflict
        ? "needs_resolution"
        : items.every((item) => item.status === "failed")
          ? "failed"
          : "preparing"
      : result.job.status === "executing"
        ? "running"
        : result.job.status === "completed"
          ? "completed"
          : result.job.status === "partial"
            ? "partial"
            : "failed";
  return {
    id: result.job.id,
    targetProjectId: result.job.targetProjectId,
    targetWorkspaceId: result.job.targetWorkspaceId,
    sourceProjectId: result.job.sourceProjectId,
    mode: result.job.mode,
    idempotencyKey: result.job.idempotencyKey,
    status,
    sourceRevision: result.job.sourceRevision,
    sourceRootHash: result.job.sourceRootHash,
    targetBaseRevision: result.job.targetBaseRevision,
    targetBaseRootHash: result.job.targetBaseRootHash,
    targetFolderId: result.job.targetFolderId,
    placement: result.job.placement,
    pagePlacements: result.job.pagePlacements
      ? { ...result.job.pagePlacements }
      : undefined,
    items,
    topologyStatus:
      result.job.topologyStatus === "committed"
        ? "completed"
        : result.job.topologyStatus,
    warnings: result.warnings.map((warning) => warning.message),
    createdAt: result.job.createdAt,
    updatedAt: result.job.updatedAt,
    createdBy: result.job.createdBy,
  };
}

function createRuntime(actor: ProjectAdminActor, sessionId?: string) {
  const admin = getProjectAdminService();
  const store = new PageTransferStore({ dataDir: admin.dataDir });
  const source = createSourcePort({ actor, dataDir: admin.dataDir });
  const service = new PageTransferService(
    store,
    source,
    createTargetPort({ sessionId }),
  );
  return {
    store,
    source,
    service,
    close: () => {
      closeSourcePort(source);
      store.close();
    },
  };
}

function autoPlacement(
  sourceWorkspacePath: string,
  sourcePageIds: readonly string[],
  targetLayoutText: string | undefined,
): { anchorX: number; anchorY: number } | undefined {
  try {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(sourceWorkspacePath, ".canvas-layout.json"),
        "utf8",
      ),
    ) as {
      state?: {
        pages?: Record<string, { x?: number; y?: number; width?: number }>;
      };
    };
    const target = targetLayoutText
      ? (JSON.parse(targetLayoutText) as {
          state?: {
            pages?: Record<string, { x?: number; y?: number; width?: number }>;
          };
        })
      : {};
    const selected = sourcePageIds.flatMap((pageId) =>
      source.state?.pages?.[pageId] ? [source.state.pages[pageId]] : [],
    );
    if (!selected.length) return undefined;
    const sourceMinX = Math.min(...selected.map((layout) => layout.x ?? 0));
    const sourceMinY = Math.min(...selected.map((layout) => layout.y ?? 0));
    const targetPages = Object.values(target.state?.pages ?? {});
    const targetRight = targetPages.length
      ? Math.max(
          ...targetPages.map((layout) => (layout.x ?? 0) + (layout.width ?? 0)),
        )
      : sourceMinX - 80;
    const targetTop = targetPages.length
      ? Math.min(...targetPages.map((layout) => layout.y ?? 0))
      : sourceMinY;
    return {
      anchorX: targetRight + 80 - sourceMinX,
      anchorY: targetTop - sourceMinY,
    };
  } catch {
    return undefined;
  }
}

export async function preparePageTransfer(input: {
  targetProjectId: string;
  actor: ProjectAdminActor;
  body: PageTransferPrepareInput;
}): Promise<PageTransferJob> {
  if (!input.body.idempotencyKey?.trim())
    throw Object.assign(new Error("idempotencyKey 必填"), {
      code: "INVALID_REQUEST",
    });
  const pageIds = [...new Set(input.body.sourcePageIds)];
  if (!pageIds.length || pageIds.length > 100)
    throw Object.assign(new Error("sourcePageIds 必须包含 1-100 个页面"), {
      code: "INVALID_REQUEST",
    });
  const target = requireProject(input.targetProjectId, input.actor, true);
  const source = requireProject(
    input.body.sourceProjectId,
    input.actor,
    input.body.mode === "reference",
  );
  const proof = getProjectAdminService().exportProjectPackage(
    input.body.sourceProjectId,
    input.actor,
  );
  if (
    !proof.ok ||
    !proof.data?.workspaceId ||
    proof.data.workspaceRevision === undefined ||
    !proof.data.workspaceRootHash
  ) {
    throw Object.assign(
      new Error(proof.error?.message ?? "源项目尚无可转移的已提交版本"),
      { code: proof.error?.code ?? "WORKSPACE_STALE" },
    );
  }
  if (!target.project.activeWorkspaceId)
    throw Object.assign(new Error("目标项目没有 active Workspace"), {
      code: "WORKSPACE_STALE",
    });
  const targetSnapshot = await getWorkspaceAuthoritySnapshot({
    projectId: input.targetProjectId,
    workspaceId: target.project.activeWorkspaceId,
    sessionId: input.body.sessionId ?? "page-transfer",
  });
  const availablePageIds = new Set(source.pages.map((page) => page.id));
  const missingPageId = pageIds.find((pageId) => !availablePageIds.has(pageId));
  if (missingPageId)
    throw Object.assign(new Error(`源页面不存在: ${missingPageId}`), {
      code: "SOURCE_PAGE_NOT_FOUND",
    });
  const runtime = createRuntime(input.actor, input.body.sessionId);
  const placement =
    input.body.placement ??
    (input.body.pagePlacements
      ? undefined
      : autoPlacement(
          source.project.workspacePath,
          pageIds,
          targetSnapshot.resources[".canvas-layout.json"],
        ));
  try {
    return toPublicJob(
      await runtime.service.prepare({
        idempotencyKey: `${input.targetProjectId}:${input.actor.id}:${input.body.idempotencyKey}`,
        sourceProjectId: input.body.sourceProjectId,
        sourceWorkspaceId: proof.data.workspaceId,
        sourcePageIds: pageIds,
        targetProjectId: input.targetProjectId,
        targetWorkspaceId: target.project.activeWorkspaceId,
        mode: input.body.mode,
        actorId: input.actor.id,
        sourceRevision: proof.data.workspaceRevision,
        sourceRootHash: proof.data.workspaceRootHash,
        targetBaseRevision: targetSnapshot.state.revision,
        targetBaseRootHash: targetSnapshot.state.rootHash,
        targetFolderId: input.body.targetFolderId,
        placement,
        pagePlacements: input.body.pagePlacements,
      }),
    );
  } finally {
    runtime.close();
  }
}

function coreResolutions(
  result: PageTransferResult,
  values: readonly PageTransferResolution[],
): CoreResolution[] {
  const byId = new Map<
    string,
    { item: PageTransferResult["items"][number]; conflict: CoreConflict }
  >();
  for (const item of result.items)
    if (item.conflict)
      byId.set(conflictId(result.job.id, item.sourcePageId, item.conflict), {
        item,
        conflict: item.conflict,
      });
  return values.flatMap((value) => {
    const match = byId.get(value.conflictId);
    return match
      ? [
          {
            sourcePageId: match.item.sourcePageId,
            code: match.conflict.code,
            key: match.conflict.key,
            action: value.action,
            targetKey: value.targetKey,
          },
        ]
      : [];
  });
}

export async function executePageTransfer(input: {
  transferId: string;
  targetProjectId: string;
  actor: ProjectAdminActor;
  sessionId?: string;
  resolutions?: PageTransferResolution[];
}): Promise<PageTransferJob> {
  requireProject(input.targetProjectId, input.actor, true);
  const runtime = createRuntime(input.actor, input.sessionId);
  try {
    const current = await runtime.service.get(input.transferId);
    if (
      current.job.targetProjectId !== input.targetProjectId ||
      current.job.createdBy !== input.actor.id
    )
      throw Object.assign(new Error("转移任务不可访问"), { code: "FORBIDDEN" });
    const result = await runtime.service.execute({
      transferId: input.transferId,
      actorId: input.actor.id,
      resolutions: coreResolutions(current, input.resolutions ?? []),
    });
    await runtime.service.processOutbox();
    return toPublicJob(await runtime.service.get(result.job.id));
  } finally {
    runtime.close();
  }
}

export async function getPageTransfer(input: {
  transferId: string;
  targetProjectId: string;
  actor: ProjectAdminActor;
}): Promise<PageTransferJob> {
  requireProject(input.targetProjectId, input.actor, false);
  const runtime = createRuntime(input.actor);
  try {
    const result = await runtime.service.get(input.transferId);
    if (
      result.job.targetProjectId !== input.targetProjectId ||
      result.job.createdBy !== input.actor.id
    )
      throw Object.assign(new Error("转移任务不可访问"), { code: "FORBIDDEN" });
    return toPublicJob(result);
  } finally {
    runtime.close();
  }
}

function publicGrant(grant: ReferenceGrant): PageReferenceGrant {
  return {
    id: grant.id,
    sourceProjectId: grant.sourceProjectId,
    sourcePageId: grant.sourcePageId,
    targetProjectId: grant.targetProjectId,
    targetPageId: grant.targetPageId,
    status: grant.status,
    createdBy: grant.createdBy,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
  };
}

export function revokePageReference(input: {
  grantId: string;
  targetProjectId: string;
  actor: ProjectAdminActor;
}): PageReferenceGrant {
  requireProject(input.targetProjectId, input.actor, true);
  const runtime = createRuntime(input.actor);
  try {
    const grant = runtime.store.getGrant(input.grantId);
    if (!grant || grant.targetProjectId !== input.targetProjectId)
      throw Object.assign(new Error("引用授权不存在"), {
        code: "REFERENCE_NOT_FOUND",
      });
    const source = requireProject(grant.sourceProjectId, input.actor, true);
    if (source.locked)
      throw Object.assign(new Error("源项目不可编辑"), { code: "FORBIDDEN" });
    return publicGrant(runtime.service.revokeGrant(input.grantId));
  } finally {
    runtime.close();
  }
}

export function resolveActiveReferenceGrant(
  grantId: string,
): PageReferenceGrant {
  const store = new PageTransferStore({
    dataDir: getProjectAdminService().dataDir,
  });
  try {
    const grant = store.getGrant(grantId);
    if (!grant || grant.status !== "active")
      throw Object.assign(new Error("引用授权无效"), {
        code: "REFERENCE_NOT_ACTIVE",
      });
    return publicGrant(grant);
  } finally {
    store.close();
  }
}
