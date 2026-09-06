import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import crypto from "crypto";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  buildDesignSpecDeleteMutation,
  buildDesignSpecMutation,
  deleteDesignSpecDoc,
  hashText,
  isSafeDocId,
  normalizeEntry,
  readDesignSpecDoc,
  readDesignSpecDocRawContent,
  readDesignSpecManifest,
  saveDesignSpecDoc,
} from "@/lib/design-specs";
import { requireDesignSpecAdmin, resolveDesignSpecContext } from "@/lib/design-specs/route-helpers";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

type RouteParams = { params: Promise<{ docId: string }> };

function mutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    { success: false, error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

function notFound() {
  return NextResponse.json(
    createApiError("FILE_READ_ERROR", "设计规范文档不存在"),
    { status: 404 },
  );
}

/** GET /api/design-specs/[docId] → 单文档 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { docId } = await params;
  if (!isSafeDocId(docId)) return notFound();
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const { workingDir } = resolved.ctx;
  try {
    const doc = readDesignSpecDoc(workingDir, docId);
    if (!doc) return notFound();
    return NextResponse.json(createApiSuccess(doc));
  } catch {
    return NextResponse.json(
       createApiError("FILE_READ_ERROR", "读取设计规范文档失败"),
      { status: 500 },
    );
  }
}

/** PUT /api/design-specs/[docId] body { doc } → 保存整份文档 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { docId } = await params;
  if (!isSafeDocId(docId)) return notFound();
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const authorizationError = requireDesignSpecAdmin(resolved.ctx);
  if (authorizationError) return authorizationError;
  const { workingDir, live, liveContext } = resolved.ctx;

  const body = await request.json().catch(() => null);
  const inputDoc = body?.doc;
  if (!inputDoc || typeof inputDoc !== "object") {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "doc 字段必填"),
      { status: 400 },
    );
  }

  const existing = readDesignSpecDoc(workingDir, docId);
  if (!existing) return notFound();

  try {
    const normalized: typeof existing = {
      id: existing.id,
      title:
        typeof inputDoc.title === "string" && inputDoc.title.trim()
          ? inputDoc.title.trim()
          : existing.title,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      autoManagedPageId: existing.autoManagedPageId,
      entries: Array.isArray(inputDoc.entries)
        ? inputDoc.entries.map((e: unknown) =>
            normalizeEntry(e as never, existing.autoManagedPageId),
          )
        : existing.entries,
    };

    if (live && liveContext) {
      const { manifestContent, docContent } = buildDesignSpecMutation(workingDir, normalized);
      const previousManifest = readDesignSpecManifest(workingDir);
      const operations: WorkspaceMutationOperation[] = [
        {
          type: "put_text",
          path: "design-spec/spec-" + docId + ".json",
          content: docContent,
          expectedHash: hashText(
            readDesignSpecDocRawContent(workingDir, docId)
              ?? JSON.stringify(existing, null, 2),
          ),
        },
        {
          type: "put_text",
          path: "design-spec/manifest.json",
          content: manifestContent,
          expectedHash: hashText(JSON.stringify(previousManifest, null, 2)),
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveContext.projectId,
        workspaceId: liveContext.workspaceId,
        sessionId: liveContext.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "save_design_spec_document",
        operations,
      });
    } else {
      saveDesignSpecDoc(workingDir, normalized);
    }

    return NextResponse.json(createApiSuccess(normalized));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return mutationErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
       createApiError("FILE_WRITE_ERROR", `保存设计规范失败: ${message}`),
      { status: 500 },
    );
  }
}

/** PATCH /api/design-specs/[docId] body { title } → 重命名文档 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { docId } = await params;
  if (!isSafeDocId(docId)) return notFound();
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const authorizationError = requireDesignSpecAdmin(resolved.ctx);
  if (authorizationError) return authorizationError;
  const { workingDir, live, liveContext } = resolved.ctx;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "title 字段必填且不能为空"),
      { status: 400 },
    );
  }

  const existing = readDesignSpecDoc(workingDir, docId);
  if (!existing) return notFound();

  const renamed = {
    ...existing,
    title,
    updatedAt: new Date().toISOString(),
  };

  try {
    let updatedDoc = renamed;
    if (live && liveContext) {
      const { manifestContent, docContent } = buildDesignSpecMutation(workingDir, renamed);
      const previousManifest = readDesignSpecManifest(workingDir);
      const operations: WorkspaceMutationOperation[] = [
        {
          type: "put_text",
          path: "design-spec/spec-" + docId + ".json",
          content: docContent,
          expectedHash: hashText(
            readDesignSpecDocRawContent(workingDir, docId)
              ?? JSON.stringify(existing, null, 2),
          ),
        },
        {
          type: "put_text",
          path: "design-spec/manifest.json",
          content: manifestContent,
          expectedHash: hashText(JSON.stringify(previousManifest, null, 2)),
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveContext.projectId,
        workspaceId: liveContext.workspaceId,
        sessionId: liveContext.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "rename_design_spec_document",
        operations,
      });
    } else {
      updatedDoc = saveDesignSpecDoc(workingDir, renamed);
    }

    return NextResponse.json(createApiSuccess(updatedDoc));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return mutationErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", `重命名设计规范失败: ${message}`),
      { status: 500 },
    );
  }
}

/** DELETE /api/design-specs/[docId] → 删除文档 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { docId } = await params;
  if (!isSafeDocId(docId)) return notFound();
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const authorizationError = requireDesignSpecAdmin(resolved.ctx);
  if (authorizationError) return authorizationError;
  const { workingDir, live, liveContext } = resolved.ctx;

  const existing = readDesignSpecDoc(workingDir, docId);
  if (!existing) return notFound();

  try {
    if (live && liveContext) {
      const { manifestContent, docPath } = buildDesignSpecDeleteMutation(workingDir, docId);
      const previousManifest = readDesignSpecManifest(workingDir);
      const operations: WorkspaceMutationOperation[] = [
        {
          type: "delete_path",
          path: docPath,
          expectedHash: hashText(
            readDesignSpecDocRawContent(workingDir, docId)
              ?? JSON.stringify(existing, null, 2),
          ),
        },
        {
          type: "put_text",
          path: "design-spec/manifest.json",
          content: manifestContent,
          expectedHash: hashText(JSON.stringify(previousManifest, null, 2)),
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveContext.projectId,
        workspaceId: liveContext.workspaceId,
        sessionId: liveContext.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "delete_design_spec_document",
        operations,
      });
    } else {
      deleteDesignSpecDoc(workingDir, docId);
    }

    return NextResponse.json(createApiSuccess({ deleted: true }));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return mutationErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
       createApiError("FILE_WRITE_ERROR", `删除设计规范失败: ${message}`),
      { status: 500 },
    );
  }
}
