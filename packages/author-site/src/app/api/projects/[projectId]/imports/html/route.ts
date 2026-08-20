import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  HtmlImportError,
  normalizeHtmlImport,
  stageHtmlImportBranch,
  validateHtmlImportPrototypeCandidate,
  type HtmlImportAnalysis,
} from "@workbench/project-core";
import type { DemoPageMeta, WorkspaceTree } from "@workbench/shared";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  generateDemoPageId,
  generateRouteKey,
  getSessionMeta,
  isSessionExpired,
  listDemoPages,
  projectExists,
  readFoldersMeta,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

const EMPTY_SCHEMA = JSON.stringify({ type: "object", properties: {} });

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function pageNameFromInput(filename: string, name?: string): string {
  const supplied = name?.trim();
  if (supplied) return supplied;
  const basename = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  return basename.replace(/\.html?$/i, "").trim() || "导入的 HTML 页面";
}

function createPutTextOperation(input: {
  workspacePath: string;
  resourcePath: string;
  content: string;
  expectedAbsent?: boolean;
}): WorkspaceMutationOperation {
  if (input.expectedAbsent) {
    return { type: "put_text", path: input.resourcePath, content: input.content, expectedAbsent: true };
  }
  const absolutePath = path.join(input.workspacePath, input.resourcePath);
  const previous = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
  return {
    type: "put_text",
    path: input.resourcePath,
    content: input.content,
    ...(previous === null ? { expectedAbsent: true } : { expectedHash: hashText(previous) }),
  };
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, { authorityCode: error.code }),
    { status: error.status },
  );
}

function importErrorResponse(error: HtmlImportError, analysis?: HtmlImportAnalysis) {
  return NextResponse.json(
    createApiError(error.code, error.message, analysis ? { analysis } : undefined),
    { status: 422 },
  );
}

function prototypeMeta(analysis: HtmlImportAnalysis): Record<string, unknown> {
  return {
    width: analysis.detectedViewport?.width ?? 390,
    height: analysis.detectedViewport?.height ?? 844,
    generatedBy: "html-import",
    ...(analysis.detectedTitle ? { title: analysis.detectedTitle } : {}),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const token = await getAuthCookie();
    if (!token) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });

    const { projectId } = await params;
    if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
    const body = await request.json().catch(() => ({})) as {
      sessionId?: unknown;
      filename?: unknown;
      name?: unknown;
      html?: unknown;
      parentId?: unknown;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const filename = typeof body.filename === "string" ? body.filename : "import.html";
    const name = typeof body.name === "string" ? body.name : undefined;
    const html = typeof body.html === "string" ? body.html : undefined;
    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    if (!sessionId || html === undefined) {
      return NextResponse.json(createApiError("INVALID_REQUEST", "sessionId 和 html 参数必填"), { status: 400 });
    }
    if (!sessionExists(sessionId)) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    const meta = getSessionMeta(sessionId);
    if (!meta) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    if (meta.userId && meta.userId !== payload.userId) return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), { status: 403 });
    if (meta.demoId !== projectId) return NextResponse.json(createApiError("INVALID_REQUEST", "sessionId 与 projectId 不匹配"), { status: 400 });
    if (isSessionExpired(meta)) return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
    if (!meta.workspaceId) return NextResponse.json(createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"), { status: 400 });

    const normalization = normalizeHtmlImport(html);
    const analysis = normalization.analysis;
    if (analysis.outcome.status === "rejected") {
      return importErrorResponse(new HtmlImportError(analysis.outcome.code), analysis);
    }
    const normalizedHtml = normalization.normalizedHtml ?? "";
    const css = "";
    const runtimeType = analysis.outcome.runtimeType;
    const gate = runtimeType === "prototype-html-css"
      ? validateHtmlImportPrototypeCandidate(normalizedHtml, css)
      : { ok: true, reasonCodes: [] };
    if (!gate.ok) {
      return NextResponse.json(createApiError("HTML_IMPORT_CAPABILITY_RESTRICTED", "HTML 原型校验未通过", { analysis, reasonCodes: gate.reasonCodes }), { status: 422 });
    }

    const workspacePath = findWorkspacePath(meta.workspaceId);
    if (!workspacePath) return NextResponse.json(createApiError("FILE_WRITE_ERROR", "工作空间路径不存在"), { status: 500 });
    const live = isLiveWorkspacePath(workspacePath);
    const liveTree = live ? (() => {
      const treePath = path.join(workspacePath, "workspace-tree.json");
      if (!fs.existsSync(treePath)) return null;
      try { return JSON.parse(fs.readFileSync(treePath, "utf8")) as WorkspaceTree; } catch { return null; }
    })() : null;
    if (live && !liveTree) return NextResponse.json(createApiError("FILE_WRITE_ERROR", "live Workspace 缺少有效 workspace-tree.json"), { status: 409 });
    const pages = liveTree?.pages ?? listDemoPages(workspacePath);
    const folders = liveTree?.folders ?? readFoldersMeta(workspacePath);
    if (parentId && !folders.some((folder) => folder.id === parentId)) return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), { status: 404 });
    const sameParent = pages.filter((page) => (page.parentId ?? null) === parentId);
    const pageId = generateDemoPageId(pageNameFromInput(filename, name));
    const page: DemoPageMeta = {
      id: pageId,
      name: pageNameFromInput(filename, name),
      routeKey: generateRouteKey(pageNameFromInput(filename, name), pages.map((item) => item.routeKey).filter(Boolean) as string[]),
      order: sameParent.length ? Math.max(...sameParent.map((item) => item.order)) + 1 : 0,
      parentId,
      runtimeType,
    };

    if (live) {
      const treePath = path.join(workspacePath, "workspace-tree.json");
      const previousTree = fs.readFileSync(treePath, "utf8");
      const operations: WorkspaceMutationOperation[] = runtimeType === "sandboxed-html"
        ? [
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/sandbox.html`, content: normalizedHtml, expectedAbsent: true }),
            createPutTextOperation({
              workspacePath,
              resourcePath: `demos/${pageId}/html-import.meta.json`,
              content: JSON.stringify({
                source: "html-import",
                analysisVersion: analysis.analysisVersion,
                sourceHash: analysis.sourceHash,
                normalizedHash: normalization.normalizedHash ?? hashText(normalizedHtml),
                sandboxPolicyVersion: 1,
                ...(analysis.detectedViewport ? { viewport: analysis.detectedViewport } : {}),
              }, null, 2) + "\n",
              expectedAbsent: true,
            }),
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/config.schema.json`, content: EMPTY_SCHEMA, expectedAbsent: true }),
            { type: "put_text", path: "workspace-tree.json", content: JSON.stringify({ folders, pages: [...pages, page] }, null, 2) + "\n", expectedHash: hashText(previousTree) },
          ]
        : [
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/prototype.html`, content: normalizedHtml, expectedAbsent: true }),
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/prototype.css`, content: css, expectedAbsent: true }),
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/prototype.meta.json`, content: JSON.stringify(prototypeMeta(analysis), null, 2) + "\n", expectedAbsent: true }),
            createPutTextOperation({ workspacePath, resourcePath: `demos/${pageId}/config.schema.json`, content: EMPTY_SCHEMA, expectedAbsent: true }),
            { type: "put_text", path: "workspace-tree.json", content: JSON.stringify({ folders, pages: [...pages, page] }, null, 2) + "\n", expectedHash: hashText(previousTree) },
          ];
      await commitWorkspaceMutation({ mutationId: crypto.randomUUID(), projectId, workspaceId: meta.workspaceId, sessionId, baseRevision: 0, actor: "author-site", reason: "import_html_page", operations });
    } else {
      const stage = stageHtmlImportBranch({ workspacePath, pageId, page: page as unknown as Record<string, unknown>, source: html, schema: EMPTY_SCHEMA, css });
      try { stage.commit(); } catch (error) { stage.discard(); throw error; }
    }
    return NextResponse.json(createApiSuccess({ page, analysis, warnings: analysis.warnings }), { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return createMutationErrorResponse(error);
    if (error instanceof HtmlImportError) return importErrorResponse(error);
    console.error("Error importing HTML page:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "导入 HTML 页面失败"), { status: 500 });
  }
}
