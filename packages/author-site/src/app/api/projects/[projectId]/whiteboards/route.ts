import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getWhiteboardDocumentRevision,
  isWhiteboardBinding,
  isWhiteboardConfigPath,
  isWhiteboardDocument,
  isWhiteboardPageId,
  type ImageConfigTarget,
  type WhiteboardDocument,
  whiteboardDocumentPath,
} from "@workbench/shared";
import { createApiError, createApiSuccess, findWorkspacePath, getSessionMeta, isSessionExpired, listDemoPages, projectExists, sessionExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getImageInfo } from "@/lib/image-store";
import { validateWhiteboardDocument } from "@workbench/whiteboard-core";
import { supportsWhiteboardImageTarget } from "@/lib/whiteboard-image-target";

function sameTarget(a: ImageConfigTarget, b: ImageConfigTarget) {
  return a.scope === b.scope && a.pageId === b.pageId && a.fieldPath[0] === b.fieldPath[0]
    && a.item?.itemValue === b.item?.itemValue;
}

function hasMissingManagedImage(document: WhiteboardDocument): boolean {
  if (document.version !== 3) return false;
  const hasMissingNodeAsset = document.scene.nodes.some((node) => {
    if (node.type !== "image") return false;
    const assetRef = document.nodeSemantics[node.id]?.assetRef;
    const match = typeof node.src === "string" ? node.src.match(/^\/api\/images\/([A-Za-z0-9_-]+)$/) : null;
    const info = assetRef ? getImageInfo(assetRef) : null;
    return !assetRef || !match || match[1] !== assetRef || !info || info.mimeType !== "image/png";
  });
  if (hasMissingNodeAsset) return true;
  return (document.scene.assets ?? []).some((asset) => {
    const match = typeof asset.src === "string"
      ? asset.src.match(/^\/api\/images\/([A-Za-z0-9_-]+)$/)
      : null;
    const info = match ? getImageInfo(match[1]) : null;
    return !match || !info || info.mimeType !== "image/png";
  });
}

/** Reads only an already-bound document; it never infers ownership from a reusable PNG asset. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  const search = request.nextUrl.searchParams;
  const sessionId = search.get("sessionId");
  const scope = search.get("scope");
  const fieldPath = search.get("fieldPath");
  const pageId = search.get("pageId") || undefined;
  const itemValue = search.get("itemUrl") || undefined;
  if (!user || !sessionId || (scope !== "page" && scope !== "project") || !fieldPath || !isWhiteboardConfigPath(fieldPath)) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "白板读取参数无效"), { status: 400 });
  }
  if ((scope === "page" && !isWhiteboardPageId(pageId)) || (scope === "project" && pageId)) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "白板目标无效"), { status: 400 });
  }
  const meta = sessionExists(sessionId) ? getSessionMeta(sessionId) : null;
  if (!meta || meta.demoId !== projectId || (meta.userId && meta.userId !== user.userId) || isSessionExpired(meta) || !meta.workspaceId) {
    return NextResponse.json(createApiError("FORBIDDEN", "无权读取此白板"), { status: 403 });
  }
  const workspacePath = findWorkspacePath(meta.workspaceId);
  if (!workspacePath) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不存在"), { status: 500 });
  if (scope === "page" && !listDemoPages(workspacePath).some((page) => page.id === pageId)) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "白板目标无效"), { status: 400 });
  }
  const schemaPath = scope === "project"
    ? path.join(workspacePath, "project.config.schema.json")
    : path.join(workspacePath, "demos", pageId ?? "", "config.schema.json");
  let schema: Record<string, unknown>;
  try {
    const parsed = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid schema");
    schema = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "配置定义损坏"), { status: 500 });
  }
  if (!supportsWhiteboardImageTarget(schema, {
    scope,
    ...(pageId ? { pageId } : {}),
    fieldPath,
    ...(itemValue ? { listItem: { index: 0, url: itemValue } } : {}),
  })) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "该字段不是支持的图片目标"), { status: 422 });
  }
  const target: ImageConfigTarget = { scope, ...(pageId ? { pageId } : {}), fieldPath: [fieldPath], ...(itemValue ? { item: { indexHint: -1, itemValue } } : {}) };
  try {
    const bindingsPath = path.join(workspacePath, "whiteboards", "bindings.json");
    // A workspace with no whiteboard bindings yet is a valid unbound state.
    // Treat it as an empty index instead of surfacing a misleading read error;
    // malformed or unreadable files still take the corruption path below.
    if (!fs.existsSync(bindingsPath)) {
      return NextResponse.json(createApiSuccess({ binding: null, document: null, documentRevision: 0 }));
    }
    const raw = JSON.parse(fs.readFileSync(bindingsPath, "utf8")) as { bindings?: unknown };
    if (!Array.isArray(raw.bindings) || raw.bindings.some((entry) => !isWhiteboardBinding(entry))) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定索引损坏"), { status: 500 });
    }
    const binding = raw.bindings.find((candidate) => sameTarget(candidate.target, target));
    if (!binding) return NextResponse.json(createApiSuccess({ binding: null, document: null, documentRevision: 0 }));
    const documentPath = path.join(workspacePath, whiteboardDocumentPath(binding.whiteboardId));
    if (!fs.existsSync(documentPath)) return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档缺失"), { status: 500 });
    let documentRaw: unknown;
    try { documentRaw = JSON.parse(fs.readFileSync(documentPath, "utf8")); } catch {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    }
    if (!isWhiteboardDocument(documentRaw)) return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    if (!validateWhiteboardDocument(documentRaw).valid) return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定存在但文档损坏"), { status: 500 });
    if (hasMissingManagedImage(documentRaw)) return NextResponse.json(createApiError("FILE_READ_ERROR", "白板绑定引用的图片资产缺失"), { status: 500 });
    return NextResponse.json(createApiSuccess({ binding, document: documentRaw, documentRevision: getWhiteboardDocumentRevision(documentRaw) }));
  } catch {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "无法读取白板绑定"), { status: 500 });
  }
}
