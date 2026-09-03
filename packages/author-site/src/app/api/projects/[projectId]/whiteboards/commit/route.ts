import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceMutationDeletePathOperation, WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  isWhiteboardDocument,
  isWhiteboardBinding,
  asWhiteboardDocumentV3,
  getWhiteboardDocumentRevision,
  type ImageConfigTarget,
  type WhiteboardBinding,
  type WhiteboardDocumentV3,
  whiteboardDocumentPath,
} from "@workbench/shared";
import {
  hashWorkspaceContent,
  planWhiteboardGarbageCollection,
  WhiteboardTransactionConflictError,
  whiteboardGcPathsToDelete,
  writeWhiteboardTransaction,
} from "@workbench/project-core";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import { commitWorkspaceMutation, getWorkspaceAuthorityState, stageWorkspaceBinary, WorkspaceAuthorityClientError } from "@/lib/workspace-authority-client";
import {
  detachWhiteboardImages,
  getImageInfo,
  releaseWhiteboardDraftImages,
  syncWhiteboardImages,
} from "@/lib/image-store";
import { canonicalizeWhiteboardDocument, validateWhiteboardDocument } from "@workbench/whiteboard-core";
import {
  isWhiteboardImageTargetInput,
  supportsWhiteboardImageTarget,
  updateWhiteboardImageTarget,
  type WhiteboardImageTargetInput,
} from "@/lib/whiteboard-image-target";
import { renderWhiteboardDocumentToPng, WhiteboardRenderError } from "@/lib/whiteboard-renderer";

type TargetInput = WhiteboardImageTargetInput;
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }
function validateManagedImageRefs(document: WhiteboardDocumentV3): { code: string; message: string; nodeId?: string }[] {
  const diagnostics: { code: string; message: string; nodeId?: string }[] = [];
  for (const node of document.scene.nodes) {
    if (node.type !== "image") continue;
    const assetRef = document.nodeSemantics[node.id]?.assetRef;
    const imagePath = typeof node.src === "string" ? node.src.match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/) : null;
    if (!assetRef) {
      diagnostics.push({ code: "ASSET_REF_MISSING", message: `图片节点“${node.name || node.id}”缺少受管图片资源`, nodeId: node.id });
      continue;
    }
    if (!imagePath || imagePath[1] !== assetRef || !getImageInfo(assetRef)) {
      diagnostics.push({ code: "ASSET_NOT_RESOLVED", message: `图片节点“${node.name || node.id}”的受管资源缺失或引用不一致`, nodeId: node.id });
      continue;
    }
    const info = getImageInfo(assetRef);
    if (info?.mimeType !== "image/png") {
      diagnostics.push({ code: "ASSET_NOT_CANONICAL", message: `图片节点“${node.name || node.id}”必须使用受管静态 PNG 资源`, nodeId: node.id });
    }
  }
  for (const asset of document.scene.assets ?? []) {
    const imagePath = typeof asset.src === "string"
      ? asset.src.match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/)
      : null;
    const info = imagePath ? getImageInfo(imagePath[1]) : null;
    if (!imagePath || !info) {
      diagnostics.push({ code: "ASSET_NOT_RESOLVED", message: `场景资源“${asset.id}”缺少受管图片资源` });
      continue;
    }
    if (info.mimeType !== "image/png") {
      diagnostics.push({ code: "ASSET_NOT_CANONICAL", message: `场景资源“${asset.id}”必须使用受管静态 PNG 资源` });
    }
  }
  return diagnostics;
}

function whiteboardImageIds(document: WhiteboardDocumentV3): string[] {
  const nodeIds = document.scene.nodes
    .filter((node) => node.type === "image")
    .map((node) => document.nodeSemantics[node.id]?.assetRef)
    .filter((assetRef): assetRef is string => Boolean(assetRef));
  const libraryIds = (document.scene.assets ?? [])
    .map((asset) => asset.src.match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/)?.[1])
    .filter((assetRef): assetRef is string => Boolean(assetRef));
  return [...new Set([...nodeIds, ...libraryIds])];
}

function releaseDraftAssets(document: WhiteboardDocumentV3): void {
  try {
    releaseWhiteboardDraftImages(document.id);
  } catch {
    // Asset cleanup is best-effort. The lease expiry path remains fail-safe.
  }
}

function prepareCommittedAssets(document: WhiteboardDocumentV3): void {
  const imageIds = whiteboardImageIds(document);
  if (!imageIds.length) return;
  // Establish a durable reference before the workspace transaction. This
  // prevents a process crash between document commit and manifest bookkeeping
  // from leaving a committed document pointing at a GC-eligible asset.
  syncWhiteboardImages(imageIds, document.id, document.id);
}

function finalizeCommittedAssets(
  document: WhiteboardDocumentV3,
  previousImageIds: readonly string[] = [],
): void {
  try {
    syncWhiteboardImages(whiteboardImageIds(document), document.id, undefined, previousImageIds);
  } catch {
    // New references are already durable. If stale-reference cleanup fails,
    // keep the old asset rather than risking a document that cannot reopen.
  }
}
function pendingWhiteboardGcOperations(workspacePath: string): WorkspaceMutationDeletePathOperation[] {
  return whiteboardGcPathsToDelete(planWhiteboardGarbageCollection(workspacePath)).flatMap((resourcePath) => {
    const absolutePath = path.join(workspacePath, resourcePath);
    if (!fs.existsSync(absolutePath)) return [];
    return [{ type: "delete_path" as const, path: resourcePath, expectedHash: hashWorkspaceContent(fs.readFileSync(absolutePath)) }];
  });
}
function sameTarget(a: ImageConfigTarget, b: TargetInput): boolean {
  return a.scope === b.scope && a.pageId === b.pageId && a.fieldPath[0] === b.fieldPath
    && a.item?.itemValue === b.listItem?.url;
}

function fileHashOrNull(filePath: string): string | null {
  return fs.existsSync(filePath) ? hashWorkspaceContent(fs.readFileSync(filePath)) : null;
}

function whiteboardCommitFailureMessage(error: unknown): string {
  if (error instanceof WhiteboardTransactionConflictError) {
    return "白板文件已被其他修改，请刷新后重试";
  }
  if (error instanceof WorkspaceAuthorityClientError) {
    switch (error.code) {
      case "WORKSPACE_EXTERNAL_DRIFT":
        return "工作空间内容已变化，请刷新后重试";
      case "WORKSPACE_RESOURCE_CONFLICT":
      case "WORKSPACE_MUTATION_ID_REUSED":
      case "WORKSPACE_WRITE_LEASE_UNAVAILABLE":
        return "工作空间已被其他修改，请刷新后重试";
      case "WORKSPACE_AUTHORITY_NOT_READY":
      case "WORKSPACE_NOT_FOUND":
        return "工作空间服务暂不可用，请稍后重试";
      default:
        return "白板回填失败，请稍后重试";
    }
  }
  return "白板回填失败，请重试";
}

/** WhiteboardCommit: scene, binding, PNG and config value enter one Authority revision. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
  const body = await request.json().catch(() => null) as null | { sessionId?: string; target?: TargetInput; document?: unknown; baseDocumentRevision?: number | null };
  if (!body?.sessionId || !isWhiteboardImageTargetInput(body.target) || !isWhiteboardDocument(body.document) || Object.prototype.hasOwnProperty.call(body, "pngBase64")) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "白板提交参数无效"), { status: 400 });
  }
  if (body.baseDocumentRevision !== null && (!Number.isInteger(body.baseDocumentRevision) || (body.baseDocumentRevision as number) < 0)) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "必须提供有效的 baseDocumentRevision（首次提交使用 null）"), { status: 400 });
  }
  const meta = sessionExists(body.sessionId) ? getSessionMeta(body.sessionId) : null;
  if (!meta || meta.demoId !== projectId || (meta.userId && meta.userId !== user.userId) || isSessionExpired(meta) || !meta.workspaceId) {
    return NextResponse.json(createApiError("FORBIDDEN", "无权提交此白板"), { status: 403 });
  }
  if (body.target.scope === "page" && (!body.target.pageId || !/^[A-Za-z0-9_-]+$/.test(body.target.pageId))) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "页面目标无效"), { status: 400 });
  }
  if (body.target.scope === "project" && body.target.pageId !== undefined) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "项目目标不应包含 pageId"), { status: 400 });
  }
  const workspacePath = findWorkspacePath(meta.workspaceId);
  if (!workspacePath) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不存在"), { status: 500 });
  const schemaPath = body.target.scope === "project"
    ? path.join(workspacePath, "project.config.schema.json")
    : path.join(workspacePath, "demos", body.target.pageId ?? "", "config.schema.json");
  let schema: Record<string, unknown>;
  try {
    const parsed = record(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
    if (!parsed) throw new Error("invalid schema");
    schema = parsed;
  } catch {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "配置定义损坏"), { status: 500 });
  }
  if (!supportsWhiteboardImageTarget(schema, body.target)) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "该字段不是一期支持的图片目标"), { status: 422 });
  }
  const submittedDocument = asWhiteboardDocumentV3(body.document);
  if (body.baseDocumentRevision === null && submittedDocument.documentRevision !== 0) {
    releaseDraftAssets(submittedDocument);
    return NextResponse.json(createApiError("VALIDATION_ERROR", "首次提交的白板 documentRevision 必须为 0"), { status: 409 });
  }
  if (body.baseDocumentRevision !== null && submittedDocument.documentRevision !== body.baseDocumentRevision) {
    releaseDraftAssets(submittedDocument);
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板文档与 baseDocumentRevision 不一致"), { status: 409 });
  }
  const documentValidation = validateWhiteboardDocument(submittedDocument);
  if (!documentValidation.valid) {
    releaseDraftAssets(submittedDocument);
    return NextResponse.json(createApiError("VALIDATION_ERROR", documentValidation.diagnostics.map((item) => item.message).join("；"), { diagnostics: documentValidation.diagnostics }), { status: 422 });
  }
  const document = canonicalizeWhiteboardDocument(submittedDocument) as WhiteboardDocumentV3;
  const assetDiagnostics = validateManagedImageRefs(document);
  if (assetDiagnostics.length) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", assetDiagnostics.map((item) => item.message).join("；"), { diagnostics: assetDiagnostics }), { status: 422 });
  }
  let rendered: Awaited<ReturnType<typeof renderWhiteboardDocumentToPng>>;
  try {
    rendered = await renderWhiteboardDocumentToPng(document);
  } catch (error) {
    const renderError = error instanceof WhiteboardRenderError ? error : null;
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", renderError?.message || "白板生成图片失败，请重试", {
      code: renderError?.code || "RENDER_FAILED",
      ...(renderError?.nodeId ? { nodeId: renderError.nodeId } : {}),
    }), { status: 422 });
  }
  const png = rendered.png;
  if (png.length > 20 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板生成的 PNG 无效或过大"), { status: 422 });
  }
  const hash = rendered.sha256;
  const assetPath = `assets/whiteboards/${hash}.png`;
  const configPath = body.target.scope === "project" ? "project.config.values.json" : `demos/${body.target.pageId}/config.values.json`;
  let values: Record<string, unknown>;
  const valuesPath = path.join(workspacePath, configPath);
  try {
    if (!fs.existsSync(valuesPath)) values = {};
    else {
      const parsedValues = record(JSON.parse(fs.readFileSync(valuesPath, "utf8")));
      if (!parsedValues) throw new Error("invalid config values");
      values = parsedValues;
    }
  } catch {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("FILE_READ_ERROR", "配置值文件损坏"), { status: 500 });
  }
  const conflict = updateWhiteboardImageTarget(values, body.target, assetPath, schema);
  if (conflict) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", conflict), { status: 409 });
  }
  const bindingsPath = path.join(workspacePath, "whiteboards", "bindings.json");
  let bindingsRoot: Record<string, unknown> = {};
  if (fs.existsSync(bindingsPath)) {
    try {
      bindingsRoot = record(JSON.parse(fs.readFileSync(bindingsPath, "utf8"))) ?? {};
    } catch {
      releaseDraftAssets(document);
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定索引损坏"), { status: 500 });
    }
  }
  const bindings = bindingsRoot.bindings;
  if (fs.existsSync(bindingsPath) && (!Array.isArray(bindings) || bindings.some((entry) => !isWhiteboardBinding(entry)))) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定索引损坏"), { status: 500 });
  }
  const existing = Array.isArray(bindings) ? bindings.filter(isWhiteboardBinding) : [];
  const target: ImageConfigTarget = { scope: body.target.scope, ...(body.target.pageId ? { pageId: body.target.pageId } : {}), fieldPath: [body.target.fieldPath], ...(body.target.listItem ? { item: { indexHint: body.target.listItem.index, itemValue: body.target.listItem.url } } : {}) };
  const currentBinding = existing.find((entry) => sameTarget(entry.target, body.target!));
  let currentRevision = 0;
  let previousImageIds: string[] = [];
  const incomingDocumentPath = path.join(workspacePath, whiteboardDocumentPath(document.id));
  if (!currentBinding && fs.existsSync(incomingDocumentPath)) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板文档 ID 已存在但未绑定当前目标，请刷新后重试"), { status: 409 });
  }
  if (currentBinding) {
    if (currentBinding.whiteboardId !== document.id) {
      releaseDraftAssets(document);
      return NextResponse.json(createApiError("VALIDATION_ERROR", "白板目标与绑定文档不一致"), { status: 409 });
    }
    const currentDocumentPath = path.join(workspacePath, whiteboardDocumentPath(currentBinding.whiteboardId));
    if (!fs.existsSync(currentDocumentPath)) {
      releaseDraftAssets(document);
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档缺失"), { status: 500 });
    }
    let currentRaw: unknown;
    try { currentRaw = JSON.parse(fs.readFileSync(currentDocumentPath, "utf8")); } catch {
      releaseDraftAssets(document);
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    }
    if (!isWhiteboardDocument(currentRaw) || !validateWhiteboardDocument(currentRaw).valid) {
      releaseDraftAssets(document);
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    }
    currentRevision = getWhiteboardDocumentRevision(currentRaw);
    previousImageIds = whiteboardImageIds(asWhiteboardDocumentV3(currentRaw));
  }
  const requestedRevision = body.baseDocumentRevision === null ? 0 : body.baseDocumentRevision;
  const revisionConflict = currentBinding
    ? body.baseDocumentRevision === null || requestedRevision !== currentRevision
    : requestedRevision !== 0;
  if (revisionConflict) {
    releaseDraftAssets(document);
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板版本已变化，请刷新后重试", { currentDocumentRevision: currentRevision }), { status: 409 });
  }
  const nextRevision = currentRevision + 1;
  const nextDocument = { ...document, documentRevision: nextRevision, updatedAt: Date.now() };
  const binding: WhiteboardBinding = { id: `wb_${nextDocument.id}`, target, whiteboardId: nextDocument.id, documentRevisionAtOutput: nextRevision, documentVersion: 3, outputAssetHash: hash, updatedAt: Date.now() };
  const isSameBindingTarget = (candidate: WhiteboardBinding) => candidate.target.scope === binding.target.scope
    && candidate.target.pageId === binding.target.pageId
    && candidate.target.fieldPath[0] === binding.target.fieldPath[0]
    && candidate.target.item?.itemValue === binding.target.item?.itemValue;
  const nextBindings = { bindings: [...existing.filter((entry) => !isSameBindingTarget(entry)), binding] };
  const documentsText = text(nextDocument);
  const bindingsText = text(nextBindings);
  const configText = text(values);
  const committedImageIds = whiteboardImageIds(document);
  const previousImageIdSet = new Set(previousImageIds);
  const newlyDurableImageIds = committedImageIds.filter((imageId) => !previousImageIdSet.has(imageId));
  let precommitAssetsMayBeDurable = false;
  try {
    precommitAssetsMayBeDurable = committedImageIds.length > 0;
    prepareCommittedAssets(document);
    // Compute GC before installing the new binding, but never let that
    // pre-commit snapshot delete the output asset being written in this
    // mutation (the hash may already exist as an aged orphan).
    const gcOperations = pendingWhiteboardGcOperations(workspacePath).filter((operation) => operation.path !== assetPath);
    if (isLiveWorkspacePath(workspacePath)) {
      const staged = await stageWorkspaceBinary({ projectId, workspaceId: meta.workspaceId, sessionId: body.sessionId, content: png });
      const authorityState = await getWorkspaceAuthorityState({ projectId, workspaceId: meta.workspaceId, sessionId: body.sessionId });
      const operations: WorkspaceMutationOperation[] = [
        { type: "put_binary", path: assetPath, stagingId: staged.stagingId, hash: staged.hash, size: staged.size, ...(fileHashOrNull(path.join(workspacePath, assetPath)) ? { expectedHash: fileHashOrNull(path.join(workspacePath, assetPath))! } : { expectedAbsent: true }) },
        { type: "put_text", path: whiteboardDocumentPath(nextDocument.id), content: documentsText, ...(fileHashOrNull(path.join(workspacePath, whiteboardDocumentPath(nextDocument.id))) ? { expectedHash: fileHashOrNull(path.join(workspacePath, whiteboardDocumentPath(nextDocument.id)) )! } : { expectedAbsent: true }) },
        { type: "put_text", path: "whiteboards/bindings.json", content: bindingsText, ...(fileHashOrNull(bindingsPath) ? { expectedHash: fileHashOrNull(bindingsPath)! } : { expectedAbsent: true }) },
        { type: "put_text", path: configPath, content: configText, ...(fileHashOrNull(path.join(workspacePath, configPath)) ? { expectedHash: fileHashOrNull(path.join(workspacePath, configPath))! } : { expectedAbsent: true }) },
        ...gcOperations,
      ];
      const receipt = await commitWorkspaceMutation({ mutationId: crypto.randomUUID(), projectId, workspaceId: meta.workspaceId, sessionId: body.sessionId, baseRevision: authorityState.revision, actor: "author-site", reason: "whiteboard_commit", operations });
      finalizeCommittedAssets(document, previousImageIds);
      return NextResponse.json(createApiSuccess({ assetPath, binding, document: nextDocument, values, renderManifest: rendered.manifest, rendererVersion: rendered.rendererVersion, receipt }));
    }
    const existingAssetPath = path.join(workspacePath, assetPath);
    if (fs.existsSync(existingAssetPath) && hashWorkspaceContent(fs.readFileSync(existingAssetPath)) !== hash) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板 PNG 内容与其内容哈希路径不一致"), { status: 500 });
    }
    const write = (resourcePath: string, content: Buffer | string) => {
      const expectedHash = fileHashOrNull(path.join(workspacePath, resourcePath));
      return expectedHash ? { path: resourcePath, content, expectedHash } : { path: resourcePath, content, expectedAbsent: true as const };
    };
    const writes = [
      write(whiteboardDocumentPath(nextDocument.id), documentsText),
      write("whiteboards/bindings.json", bindingsText),
      write(configPath, configText),
      ...(fs.existsSync(existingAssetPath) ? [] : [write(assetPath, png)]),
    ];
    writeWhiteboardTransaction(workspacePath, {
      writes,
      deletes: gcOperations.map((operation) => ({ path: operation.path, expectedHash: operation.expectedHash })),
    });
    finalizeCommittedAssets(document, previousImageIds);
    return NextResponse.json(createApiSuccess({ assetPath, binding, document: nextDocument, values, renderManifest: rendered.manifest, rendererVersion: rendered.rendererVersion }));
  } catch (error) {
    if (precommitAssetsMayBeDurable && newlyDurableImageIds.length) {
      try {
        // A failed workspace transaction must not strand newly localized
        // images as durable references. If this cleanup itself fails, keeping
        // the reference is safer than allowing a later GC to break the draft.
        detachWhiteboardImages(newlyDurableImageIds, document.id);
      } catch {
        // Best effort; the durable reference is intentionally fail-safe.
      }
    }
    releaseDraftAssets(document);
    const status = error instanceof WhiteboardTransactionConflictError
      ? 409
      : error instanceof WorkspaceAuthorityClientError && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    const message = whiteboardCommitFailureMessage(error);
    return NextResponse.json(createApiError(status === 409 ? "VALIDATION_ERROR" : "FILE_WRITE_ERROR", message), { status });
  }
}
