import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { normalizeHtmlImport } from "@workbench/project-core";
import type { DemoPageMeta, WorkspaceTree } from "@workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { appendServerEditorDiagnosticEvent } from "@/lib/editor-diagnostics/store";
import {
  createApiError,
  createApiSuccess,
  getProjectPath,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import {
  createHtmlSandboxExecution,
  HTML_SANDBOX_POLICY_VERSION,
  resolveHtmlSandboxPublicOrigin,
} from "@/lib/html-sandbox-execution";
import { resolveActiveReferenceGrant } from "@/lib/page-transfer";
import { findWorkspacePath } from "@/lib/workspace-meta";

type HtmlImportMetaPayload = {
  analysisVersion?: number;
  sourceHash?: string;
  normalizedHash?: string;
  sandboxPolicyVersion?: number;
};

function readTree(workspacePath: string): WorkspaceTree | undefined {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf8"),
    ) as Partial<WorkspaceTree>;
    return {
      folders: Array.isArray(value.folders) ? value.folders : [],
      pages: Array.isArray(value.pages) ? (value.pages as DemoPageMeta[]) : [],
    };
  } catch {
    return undefined;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; pageId: string }> },
) {
  const token = await getAuthCookie();
  if (!token)
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  const auth = await verifyToken(token);
  if (!auth)
    return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
      status: 401,
    });
  const { projectId, pageId } = await params;
  if (!projectExists(projectId))
    return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
      status: 404,
    });
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: unknown;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const session =
    sessionId && sessionExists(sessionId) ? getSessionMeta(sessionId) : null;
  if (!session)
    return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
      status: 404,
    });
  if (session.userId && session.userId !== auth.userId)
    return NextResponse.json(createApiError("FORBIDDEN"), { status: 403 });
  if (session.demoId !== projectId || !session.workspaceId)
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "Session 与目标项目不匹配"),
      { status: 400 },
    );
  if (isSessionExpired(session))
    return NextResponse.json(createApiError("SESSION_EXPIRED"), {
      status: 410,
    });
  const targetWorkspacePath = findWorkspacePath(session.workspaceId);
  const targetPage = targetWorkspacePath
    ? readTree(targetWorkspacePath)?.pages.find((page) => page.id === pageId)
    : undefined;
  if (!targetPage?.reference || targetPage.runtimeType !== "sandboxed-html")
    return NextResponse.json(
      createApiError("DEMO_PAGE_NOT_FOUND", "目标引用页不存在或运行时不匹配"),
      { status: 404 },
    );
  let grant;
  try {
    grant = resolveActiveReferenceGrant(targetPage.reference.grantId);
  } catch {
    return NextResponse.json(createApiError("FORBIDDEN", "引用授权已失效"), {
      status: 403,
    });
  }
  if (
    grant.targetProjectId !== projectId ||
    grant.targetPageId !== pageId ||
    grant.sourceProjectId !== targetPage.reference.sourceProjectId ||
    grant.sourcePageId !== targetPage.reference.sourcePageId
  ) {
    return NextResponse.json(
      createApiError("FORBIDDEN", "引用授权绑定不一致"),
      { status: 403 },
    );
  }
  const sourceWorkspacePath = path.join(
    getProjectPath(grant.sourceProjectId),
    "workspace",
  );
  const sourcePage = readTree(sourceWorkspacePath)?.pages.find(
    (page) => page.id === grant.sourcePageId,
  );
  if (
    !sourcePage ||
    sourcePage.runtimeType !== "sandboxed-html" ||
    sourcePage.reference
  )
    return NextResponse.json(
      createApiError("DEMO_PAGE_NOT_FOUND", "源页面不存在或运行时不匹配"),
      { status: 404 },
    );
  const demoDir = path.join(sourceWorkspacePath, "demos", grant.sourcePageId);
  let sandboxHtml: string;
  let htmlImportMeta: HtmlImportMetaPayload;
  try {
    sandboxHtml = fs.readFileSync(path.join(demoDir, "sandbox.html"), "utf8");
    htmlImportMeta = JSON.parse(
      fs.readFileSync(path.join(demoDir, "html-import.meta.json"), "utf8"),
    ) as HtmlImportMetaPayload;
  } catch {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "引用页面执行资源缺失"),
      { status: 409 },
    );
  }
  const normalization = normalizeHtmlImport(sandboxHtml);
  if (
    normalization.analysis.outcome.status !== "accepted" ||
    normalization.analysis.outcome.runtimeType !== "sandboxed-html" ||
    htmlImportMeta.analysisVersion !== normalization.analysis.analysisVersion ||
    htmlImportMeta.sandboxPolicyVersion !== HTML_SANDBOX_POLICY_VERSION ||
    htmlImportMeta.normalizedHash !== normalization.analysis.sourceHash ||
    typeof htmlImportMeta.sourceHash !== "string" ||
    !/^[a-f\d]{64}$/u.test(htmlImportMeta.sourceHash)
  )
    return NextResponse.json(
      createApiError("HTML_RUNTIME_FAILED", "引用页面与 HTML 安全合同不一致"),
      { status: 422 },
    );
  const publicOrigin = resolveHtmlSandboxPublicOrigin(request.nextUrl.origin);
  if (!publicOrigin)
    return NextResponse.json(
      createApiError("HTML_RUNTIME_FAILED", "HTML sandbox 独立 origin 未配置"),
      { status: 503 },
    );
  const execution = createHtmlSandboxExecution(sandboxHtml, Date.now(), {
    projectId,
    sessionId,
    workspaceId: session.workspaceId,
    pageId,
  });
  appendServerEditorDiagnosticEvent({
    level: "info",
    eventGroup: "preview",
    eventType: "preview.sandbox_reference_execution_issued",
    projectId,
    sessionId,
    workspaceId: session.workspaceId,
    pageId,
    payload: {
      runtimeType: "sandboxed-html",
      grantIdHash: crypto.createHash("sha256").update(grant.id).digest("hex"),
      executionIdHash: crypto
        .createHash("sha256")
        .update(execution.executionId)
        .digest("hex"),
    },
  });
  return NextResponse.json(
    createApiSuccess({
      executionUrl: `${publicOrigin}/api/html-sandbox/executions/${execution.executionId}`,
      channelId: execution.channelId,
      expiresAt: execution.expiresAt,
      sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION,
    }),
  );
}
