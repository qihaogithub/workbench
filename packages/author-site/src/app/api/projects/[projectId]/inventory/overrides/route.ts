import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateInventoryOverrides, InventoryOverridesError } from "@workbench/project-core";
import { decodeMarkdownReferenceUri, PROJECT_INVENTORY_SCHEMA_VERSION, type InventoryOverridesFile } from "@workbench/shared";
import { createApiError, createApiSuccess, getSessionMeta, isSessionExpired } from "@/lib/fs-utils";
import { getCurrentUserFromRequest, toProjectAdminActor } from "@/lib/auth/current-user";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";
import { getProjectInventory, projectInventoryEntries, reconcileProjectInventory, redactUnavailableInventoryEntry } from "@/lib/agent/project-inventory";
import {
  commitWorkspaceMutation,
  getWorkspaceAuthorityState,
  readWorkspaceAuthorityResource,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

export const dynamic = "force-dynamic";

const FILE_PATH = "project.inventory-overrides.json";

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function error(code: string, message: string, status: number): NextResponse {
  return json(createApiError(code as never, message), status);
}

async function contextFor(request: NextRequest, projectId: string, mode: "read" | "write" = "read") {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return { response: error("UNAUTHORIZED", "未登录", 401) } as const;
  const actor = toProjectAdminActor(user);
  if (!getProjectAdminService().getProject(projectId, actor).ok) return { response: error("FORBIDDEN", "无权访问项目清单", 403) } as const;
  if (mode === "write" && user.role !== "admin" && user.role !== "editor") return { response: error("FORBIDDEN", "无权编辑项目清单", 403) } as const;
  const context = resolveMarkdownReferenceWorkspace(request, projectId, user.id);
  if (!context) return { response: error("FILE_READ_ERROR", "项目工作空间不可用", 404) } as const;
  const workspaceId = context.workspaceId;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  const session = getSessionMeta(sessionId);
  if (!session || session.userId !== user.id || session.demoId !== projectId || !session.workspaceId) return { response: error("SESSION_NOT_FOUND", "编辑会话不可用", 404) } as const;
  if (isSessionExpired(session)) return { response: error("SESSION_EXPIRED", "编辑会话已过期", 410) } as const;
  return { user, actor, context, workspaceId, sessionId } as const;
}

async function currentResource(input: { projectId: string; workspaceId: string; sessionId: string }) {
  try {
    return await readWorkspaceAuthorityResource({ ...input, path: FILE_PATH });
  } catch (cause) {
    if (cause instanceof WorkspaceAuthorityClientError && cause.code === "WORKSPACE_RESOURCE_NOT_FOUND") return null;
    throw cause;
  }
}

function emptyOverrides(): InventoryOverridesFile {
  return { schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, entries: {} };
}

function parseOverridesContent(content: string): InventoryOverridesFile {
  const value = JSON.parse(content) as unknown;
  // Inventory overrides are a pre-release project asset. A schema change
  // intentionally starts from an empty file instead of preserving obsolete
  // semantic fields or adding a compatibility migration.
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (value as { schemaVersion?: unknown }).schemaVersion !== PROJECT_INVENTORY_SCHEMA_VERSION) {
    return emptyOverrides();
  }
  return validateInventoryOverrides(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const resolved = await contextFor(request, projectId, "read");
  if ("response" in resolved) return resolved.response;
  try {
    const resource = await currentResource({ projectId, workspaceId: resolved.workspaceId, sessionId: resolved.sessionId });
    const overrides = resource ? parseOverridesContent(resource.content) : emptyOverrides();
    const authorityState = await getWorkspaceAuthorityState({ projectId, workspaceId: resolved.workspaceId, sessionId: resolved.sessionId });
    const inventory = await getProjectInventory({
      ...resolved.context,
      observedRevision: authorityState.revision,
      observedRootHash: authorityState.rootHash,
    });
    const service = getProjectAdminService();
    const entries = projectInventoryEntries(inventory.snapshot, true).map((entry) => {
      if (entry.scope === "local") return { ...entry, targetAvailability: "available" as const };
      const target = decodeMarkdownReferenceUri(entry.canonicalUri);
      return target && service.getProject(target.projectId, resolved.actor).ok
        ? { ...entry, targetAvailability: "available" as const }
        : redactUnavailableInventoryEntry(entry);
    });
    const entryUris = new Set(entries.map((entry) => entry.canonicalUri));
    const unavailableUris = new Set(entries.filter((entry) => entry.targetAvailability === "unavailable").map((entry) => entry.canonicalUri));
    const visibleOverrideEntries = Object.fromEntries(
      Object.entries(overrides.entries).filter(([uri]) => entryUris.has(uri) && !unavailableUris.has(uri)),
    );
    const orphanEntries = Object.keys(overrides.entries).filter((uri) => {
      if (entryUris.has(uri)) return false;
      const target = decodeMarkdownReferenceUri(uri);
      return target?.projectId === projectId;
    });
    const visibleOverrides: InventoryOverridesFile = { schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, entries: visibleOverrideEntries };
    return json(createApiSuccess({
      overrides: visibleOverrides,
      entries,
      orphanEntries,
      freshness: inventory.snapshot.freshness,
      projectionSource: inventory.source,
      projectionState: inventory.projectionState,
      generationActivity: inventory.generationActivity,
      reconcileRequired: inventory.reconcileRequired,
      currentRevision: authorityState.revision,
      currentRootHash: authorityState.rootHash,
      snapshotRevision: inventory.snapshot.workspaceRevision,
      snapshotRootHash: inventory.snapshot.workspaceRootHash,
      hash: resource?.hash ?? null,
      revision: resource?.revision ?? null,
    }));
  } catch (cause) {
    if (cause instanceof InventoryOverridesError) return error("VALIDATION_ERROR", "清单覆盖文件无效", 409);
    if (cause instanceof WorkspaceAuthorityClientError) return error(cause.code, cause.message, cause.status);
    return error("FILE_READ_ERROR", "读取清单覆盖失败", 503);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const resolved = await contextFor(request, projectId, "write");
  if ("response" in resolved) return resolved.response;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 256 * 1024) return error("INVALID_REQUEST", "请求体过大", 400);
  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > 256 * 1024) return error("INVALID_REQUEST", "请求体过大", 400);
  let body: Record<string, unknown> | null;
  try {
    body = JSON.parse(rawBody || "null") as Record<string, unknown> | null;
  } catch {
    return error("INVALID_REQUEST", "请求体不是合法 JSON", 400);
  }
  if (!body || !body.entries || typeof body.entries !== "object" || Array.isArray(body.entries)) return error("INVALID_REQUEST", "entries 必须是对象", 400);
  if (typeof body.expectedHash !== "string" && body.expectedHash !== null) return error("INVALID_REQUEST", "expectedHash 必须来自最近一次读取", 400);
  let submittedOverrides: InventoryOverridesFile;
  try {
    submittedOverrides = validateInventoryOverrides({ schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, entries: body.entries });
  } catch (cause) {
    return error("VALIDATION_ERROR", cause instanceof InventoryOverridesError ? cause.message : "清单覆盖无效", 400);
  }
  try {
    const input = { projectId, workspaceId: resolved.workspaceId, sessionId: resolved.sessionId };
    const current = await currentResource(input);
    const expectedHash = body.expectedHash as string | null;
    if (expectedHash !== (current?.hash ?? null)) return error("CONFLICT", "清单已被其他会话修改，请重新读取后合并", 409);
    const persistedOverrides = current ? parseOverridesContent(current.content) : emptyOverrides();
    // Keep overlays that were intentionally hidden from this caller because
    // their external target is not currently authorized. Otherwise a normal
    // visible-settings save would silently delete another user's metadata.
    const mergedOverrides = validateInventoryOverrides({
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      entries: { ...persistedOverrides.entries, ...submittedOverrides.entries },
    });
    const state = await getWorkspaceAuthorityState(input);
    const content = `${JSON.stringify(mergedOverrides, null, 2)}\n`;
    const receipt = await commitWorkspaceMutation({
      mutationId: crypto.randomUUID(),
      projectId,
      workspaceId: resolved.workspaceId,
      sessionId: resolved.sessionId,
      baseRevision: state.revision,
      baseRootHash: state.rootHash,
      actor: "author-site",
      reason: "update_project_inventory_overrides",
      operations: [{
        type: "put_text",
        path: FILE_PATH,
        content,
        ...(current ? { expectedHash: current.hash } : { expectedAbsent: true }),
      }],
    });
    // The override is already durable if the derived service is down. Best
    // effort reconciliation keeps the active FTS projection fresh without
    // turning a successful Authority write into a failed UI operation.
    await reconcileProjectInventory(resolved.context, resolved.sessionId).catch((cause) => {
      console.warn("[project-inventory] override committed; derived index refresh deferred:", cause instanceof Error ? cause.message : String(cause));
    });
    return json(createApiSuccess({ overrides: submittedOverrides, receipt }), 200);
  } catch (cause) {
    if (cause instanceof InventoryOverridesError) return error("VALIDATION_ERROR", "现有清单覆盖文件无效，请先修复后重试", 409);
    if (cause instanceof WorkspaceAuthorityClientError) return error(cause.code, cause.message, cause.status);
    return error("FILE_WRITE_ERROR", "保存清单覆盖失败", 503);
  }
}
