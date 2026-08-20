import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { normalizeHtmlImport } from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  getSessionMeta,
  getWorkspaceDemoPageFiles,
  isSessionExpired,
  listDemoPages,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { findWorkspacePath } from "@/lib/workspace-meta";
import {
  createHtmlSandboxExecution,
  HTML_SANDBOX_POLICY_VERSION,
  resolveHtmlSandboxPublicOrigin,
} from "@/lib/html-sandbox-execution";
import { appendServerEditorDiagnosticEvent } from "@/lib/editor-diagnostics/store";

interface HtmlImportMetaPayload {
  analysisVersion?: number;
  sourceHash?: string;
  normalizedHash?: string;
  sandboxPolicyVersion?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; demoId: string }> },
) {
  const token = await getAuthCookie();
  if (!token) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  const auth = await verifyToken(token);
  if (!auth) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });

  const { projectId, demoId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const body = await request.json().catch(() => ({})) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json(createApiError("INVALID_REQUEST", "sessionId 必填"), { status: 400 });
  if (!sessionExists(sessionId)) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
  const session = getSessionMeta(sessionId);
  if (!session) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
  if (session.userId && session.userId !== auth.userId) return NextResponse.json(createApiError("FORBIDDEN"), { status: 403 });
  if (session.demoId !== projectId) return NextResponse.json(createApiError("INVALID_REQUEST", "Session 与项目不匹配"), { status: 400 });
  if (isSessionExpired(session)) return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
  if (!session.workspaceId) return NextResponse.json(createApiError("INVALID_REQUEST", "Session 未绑定 Workspace"), { status: 400 });

  const workspacePath = findWorkspacePath(session.workspaceId);
  if (!workspacePath) return NextResponse.json(createApiError("FILE_READ_ERROR", "Workspace 不存在"), { status: 404 });
  const page = listDemoPages(workspacePath).find((candidate) => candidate.id === demoId);
  if (!page) return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), { status: 404 });
  if (page.runtimeType !== "sandboxed-html") {
    return NextResponse.json(createApiError("INVALID_REQUEST", "页面不是交互 HTML 运行时"), { status: 409 });
  }
  const files = getWorkspaceDemoPageFiles(session.workspaceId, demoId) as unknown as {
    sandboxHtml?: string;
    htmlImportMeta?: HtmlImportMetaPayload;
  } | null;
  const sandboxHtml = files?.sandboxHtml;
  const htmlImportMeta = files?.htmlImportMeta;
  if (!sandboxHtml || !htmlImportMeta) {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "交互 HTML 源码或审计元数据缺失"), { status: 409 });
  }
  const normalization = normalizeHtmlImport(sandboxHtml);
  if (
    normalization.analysis.outcome.status !== "accepted" ||
    normalization.analysis.outcome.runtimeType !== "sandboxed-html" ||
    htmlImportMeta.analysisVersion !== normalization.analysis.analysisVersion ||
    htmlImportMeta.sandboxPolicyVersion !== HTML_SANDBOX_POLICY_VERSION ||
    htmlImportMeta.normalizedHash !== normalization.analysis.sourceHash ||
    typeof htmlImportMeta.sourceHash !== "string" ||
    !/^[a-f\d]{64}$/.test(htmlImportMeta.sourceHash)
  ) {
    return NextResponse.json(
      createApiError("HTML_RUNTIME_FAILED", "交互 HTML 与导入安全合同不一致"),
      { status: 422 },
    );
  }
  const publicOrigin = resolveHtmlSandboxPublicOrigin(request.nextUrl.origin);
  if (!publicOrigin) {
    return NextResponse.json(
      createApiError("HTML_RUNTIME_FAILED", "HTML sandbox 独立 origin 未配置"),
      { status: 503 },
    );
  }
  const execution = createHtmlSandboxExecution(sandboxHtml);
  appendServerEditorDiagnosticEvent({
    level: "info",
    eventGroup: "preview",
    eventType: "preview.sandbox_execution_issued",
    projectId,
    sessionId,
    workspaceId: session.workspaceId,
    pageId: demoId,
    payload: {
      runtimeType: "sandboxed-html",
      sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION,
      renderer: "sandbox-html",
      executionIdHash: crypto.createHash("sha256").update(execution.executionId).digest("hex"),
    },
  });
  return NextResponse.json(createApiSuccess({
    executionUrl: `${publicOrigin}/api/html-sandbox/executions/${execution.executionId}`,
    channelId: execution.channelId,
    expiresAt: execution.expiresAt,
    sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION,
  }));
}
