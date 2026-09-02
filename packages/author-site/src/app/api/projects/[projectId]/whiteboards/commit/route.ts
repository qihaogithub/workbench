import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceMutationDeletePathOperation, WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  isWhiteboardDocument,
  isWhiteboardBinding,
  asWhiteboardDocumentV2,
  getWhiteboardDocumentRevision,
  type ImageConfigTarget,
  type WhiteboardBinding,
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
import { getImageInfo } from "@/lib/image-store";
import { canonicalizeWhiteboardDocument, validateWhiteboardDocument } from "@workbench/whiteboard-core";
import {
  isWhiteboardImageTargetInput,
  supportsWhiteboardImageTarget,
  updateWhiteboardImageTarget,
  type WhiteboardImageTargetInput,
} from "@/lib/whiteboard-image-target";

type TargetInput = WhiteboardImageTargetInput;
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }
function validateManagedImageRefs(document: ReturnType<typeof asWhiteboardDocumentV2>): { code: string; message: string; nodeId?: string }[] {
  const diagnostics: { code: string; message: string; nodeId?: string }[] = [];
  for (const [nodeId, semantics] of Object.entries(document.nodeSemantics)) {
    if (!semantics.assetRef) continue;
    const node = document.scene.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.type !== "image" || typeof node.src !== "string") continue;
    const imagePath = node.src.match(/^\/api\/images\/([A-Za-z0-9_-]+)$/);
    if (node.src.startsWith("/api/images/") && (!imagePath || imagePath[1] !== semantics.assetRef || !getImageInfo(semantics.assetRef))) {
      diagnostics.push({ code: "ASSET_NOT_RESOLVED", message: `managed image asset ${semantics.assetRef} is missing or does not match node src`, nodeId });
    }
  }
  return diagnostics;
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

/** WhiteboardCommit: scene, binding, PNG and config value enter one Authority revision. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
  const body = await request.json().catch(() => null) as null | { sessionId?: string; target?: TargetInput; document?: unknown; baseDocumentRevision?: number | null; pngBase64?: string };
  if (!body?.sessionId || !isWhiteboardImageTargetInput(body.target) || !isWhiteboardDocument(body.document) || typeof body.pngBase64 !== "string") {
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
  const submittedDocument = asWhiteboardDocumentV2(body.document);
  if (body.baseDocumentRevision === null && submittedDocument.documentRevision !== 0) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "首次提交的白板 documentRevision 必须为 0"), { status: 409 });
  }
  if (body.baseDocumentRevision !== null && submittedDocument.documentRevision !== body.baseDocumentRevision) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板文档与 baseDocumentRevision 不一致"), { status: 409 });
  }
  const bridgeValidation = validateWhiteboardDocument(submittedDocument);
  if (!bridgeValidation.valid) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", bridgeValidation.diagnostics.map((item) => item.message).join("；"), { diagnostics: bridgeValidation.diagnostics }), { status: 422 });
  }
  const assetDiagnostics = validateManagedImageRefs(submittedDocument);
  if (assetDiagnostics.length) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", assetDiagnostics.map((item) => item.message).join("；"), { diagnostics: assetDiagnostics }), { status: 422 });
  }
  const document = canonicalizeWhiteboardDocument(submittedDocument);
  const png = Buffer.from(body.pngBase64, "base64");
  if (!png.length || png.length > 20 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板导出的 PNG 无效或过大"), { status: 422 });
  }
  const hash = crypto.createHash("sha256").update(png).digest("hex");
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
    return NextResponse.json(createApiError("FILE_READ_ERROR", "配置值文件损坏"), { status: 500 });
  }
  const conflict = updateWhiteboardImageTarget(values, body.target, assetPath, schema);
  if (conflict) return NextResponse.json(createApiError("VALIDATION_ERROR", conflict), { status: 409 });
  const bindingsPath = path.join(workspacePath, "whiteboards", "bindings.json");
  let bindingsRoot: Record<string, unknown> = {};
  if (fs.existsSync(bindingsPath)) {
    try {
      bindingsRoot = record(JSON.parse(fs.readFileSync(bindingsPath, "utf8"))) ?? {};
    } catch {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定索引损坏"), { status: 500 });
    }
  }
  const bindings = bindingsRoot.bindings;
  if (fs.existsSync(bindingsPath) && (!Array.isArray(bindings) || bindings.some((entry) => !isWhiteboardBinding(entry)))) {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定索引损坏"), { status: 500 });
  }
  const existing = Array.isArray(bindings) ? bindings.filter(isWhiteboardBinding) : [];
  const target: ImageConfigTarget = { scope: body.target.scope, ...(body.target.pageId ? { pageId: body.target.pageId } : {}), fieldPath: [body.target.fieldPath], ...(body.target.listItem ? { item: { indexHint: body.target.listItem.index, itemValue: body.target.listItem.url } } : {}) };
  const currentBinding = existing.find((entry) => sameTarget(entry.target, body.target!));
  let currentRevision = 0;
  const incomingDocumentPath = path.join(workspacePath, whiteboardDocumentPath(document.id));
  if (!currentBinding && fs.existsSync(incomingDocumentPath)) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板文档 ID 已存在但未绑定当前目标，请刷新后重试"), { status: 409 });
  }
  if (currentBinding) {
    if (currentBinding.whiteboardId !== document.id) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "白板目标与绑定文档不一致"), { status: 409 });
    }
    const currentDocumentPath = path.join(workspacePath, whiteboardDocumentPath(currentBinding.whiteboardId));
    if (!fs.existsSync(currentDocumentPath)) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档缺失"), { status: 500 });
    }
    let currentRaw: unknown;
    try { currentRaw = JSON.parse(fs.readFileSync(currentDocumentPath, "utf8")); } catch {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    }
    if (!isWhiteboardDocument(currentRaw) || (currentRaw.version === 2 && !validateWhiteboardDocument(currentRaw).valid)) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    }
    currentRevision = getWhiteboardDocumentRevision(currentRaw);
  }
  const requestedRevision = body.baseDocumentRevision === null ? 0 : body.baseDocumentRevision;
  const revisionConflict = currentBinding
    ? body.baseDocumentRevision === null || requestedRevision !== currentRevision
    : requestedRevision !== 0;
  if (revisionConflict) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "白板版本已变化，请刷新后重试", { currentDocumentRevision: currentRevision }), { status: 409 });
  }
  const nextRevision = currentRevision + 1;
  const nextDocument = { ...document, documentRevision: nextRevision, updatedAt: Date.now() };
  const binding: WhiteboardBinding = { id: `wb_${nextDocument.id}`, target, whiteboardId: nextDocument.id, documentRevisionAtOutput: nextRevision, outputAssetHash: hash, updatedAt: Date.now() };
  const isSameBindingTarget = (candidate: WhiteboardBinding) => candidate.target.scope === binding.target.scope
    && candidate.target.pageId === binding.target.pageId
    && candidate.target.fieldPath[0] === binding.target.fieldPath[0]
    && candidate.target.item?.itemValue === binding.target.item?.itemValue;
  const nextBindings = { bindings: [...existing.filter((entry) => !isSameBindingTarget(entry)), binding] };
  const documentsText = text(nextDocument);
  const bindingsText = text(nextBindings);
  const configText = text(values);
  try {
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
      return NextResponse.json(createApiSuccess({ assetPath, binding, document: nextDocument, values, receipt }));
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
    return NextResponse.json(createApiSuccess({ assetPath, binding, document: nextDocument, values }));
  } catch (error) {
    const status = error instanceof WhiteboardTransactionConflictError ? 409 : 500;
    const message = error instanceof WorkspaceAuthorityClientError || error instanceof WhiteboardTransactionConflictError
      ? error.message
      : "白板回填失败";
    return NextResponse.json(createApiError(status === 409 ? "VALIDATION_ERROR" : "FILE_WRITE_ERROR", message), { status });
  }
}
