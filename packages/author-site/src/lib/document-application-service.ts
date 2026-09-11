import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import type { ProjectAdminActor } from "@workbench/project-core";
import {
  DocumentApplicationError,
  createDocumentApplicationService as createCoreDocumentApplicationService,
  type DocumentApplicationService,
  type DocumentWriteContext,
} from "@workbench/project-core/documents";
import { commitWorkspaceMutation } from "@/lib/workspace-authority-client";
import { getDataDir, findWorkspacePath, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";
import { getCurrentProjectActor } from "@/lib/auth/current-user";
import { resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";
import { reconcileProjectInventory } from "@/lib/agent/project-inventory";

export function createDocumentApplicationService(): DocumentApplicationService {
  const dataDir = getDataDir();
  return createCoreDocumentApplicationService({
    dataDir,
    authority: {
      async commit(input) {
        const receipt = await commitWorkspaceMutation({
          mutationId: crypto.randomUUID(),
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          baseRevision: input.baseRevision,
          actor: "author-site",
          reason: input.reason,
          operations: input.operations,
        });
        return { revision: receipt.revision, rootHash: receipt.rootHash };
      },
    },
  });
}

export async function resolveDocumentActor(): Promise<ProjectAdminActor | null> {
  return getCurrentProjectActor();
}

export async function resolveDocumentContext(
  request: NextRequest,
  projectId: string,
  actor: ProjectAdminActor,
  input?: { sessionId?: unknown },
): Promise<DocumentWriteContext> {
  const inputSessionId = typeof input?.sessionId === "string" && input.sessionId.trim()
    ? input.sessionId.trim()
    : undefined;
  const querySessionId = request.nextUrl.searchParams.get("sessionId")?.trim() || undefined;
  const sessionId = inputSessionId ?? querySessionId;
  if (!sessionId) return {};
  if (!sessionExists(sessionId)) throw new DocumentApplicationError({ code: "DOCUMENT_AUTHORITY_NOT_READY", message: "Session 不存在" });
  const session = getSessionMeta(sessionId);
  if (!session || session.demoId !== projectId || isSessionExpired(session)) {
    throw new DocumentApplicationError({ code: "DOCUMENT_AUTHORITY_NOT_READY", message: "Session 已失效或与项目不匹配" });
  }
  if (session.userId && session.userId !== actor.id) {
    throw new DocumentApplicationError({ code: "DOCUMENT_FORBIDDEN", message: "当前操作者无权使用此 Session" });
  }
  if (!session.workspaceId) throw new DocumentApplicationError({ code: "DOCUMENT_AUTHORITY_NOT_READY", message: "Session 未绑定 Workspace" });
  const workspacePath = findWorkspacePath(session.workspaceId);
  if (!workspacePath) throw new DocumentApplicationError({ code: "DOCUMENT_AUTHORITY_NOT_READY", message: "Workspace 不存在" });
  return { sessionId, workspaceId: session.workspaceId, workspacePath, baseRevision: 0 };
}

export function documentErrorResponse(error: unknown): { status: number; body: { success: false; error: { code: string; message: string; details?: unknown } } } {
  if (error instanceof DocumentApplicationError) {
    const status = error.code === "DOCUMENT_NOT_FOUND" || error.code === "DOCUMENT_VERSION_NOT_FOUND" ? 404
      : error.code === "DOCUMENT_FORBIDDEN" || error.code === "DOCUMENT_READONLY" ? 403
        : error.code === "DOCUMENT_CONFLICT" || error.code === "DOCUMENT_AUTHORITY_CONFLICT" ? 409
          : error.code === "DOCUMENT_AUTHORITY_NOT_READY" || error.code === "DOCUMENT_AUTHORITY_BACKUP_MISSING" ? 503 : 400;
    return { status, body: { success: false, error: error.toJSON() } };
  }
  const message = error instanceof Error ? error.message : "文档操作失败";
  return { status: 500, body: { success: false, error: { code: "DOCUMENT_OPERATION_FAILED", message } } };
}

export function assertProject(projectId: string): void {
  if (!projectId || !projectExists(projectId)) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "项目不存在" });
}

export function refreshProjectInventoryAfterDocumentMutation(input: {
  request: NextRequest;
  projectId: string;
  actorId: string;
  context: DocumentWriteContext;
}): void {
  if (!input.context.sessionId) return;
  const inventoryContext = resolveMarkdownReferenceWorkspace(input.request, input.projectId, input.actorId);
  if (!inventoryContext) return;
  void reconcileProjectInventory(inventoryContext, input.context.sessionId).catch((cause) => {
    console.warn("[documents] mutation committed; inventory refresh deferred:", cause instanceof Error ? cause.message : String(cause));
  });
}
