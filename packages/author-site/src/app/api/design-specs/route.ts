import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import crypto from "crypto";
import {
  createApiError,
  createApiSuccess,
} from "@/lib/fs-utils";
import {
  buildDesignSpecMutation,
  buildNewDesignSpecDoc,
  createDesignSpecDoc,
  hashText,
  listDesignSpecDocs,
  readDesignSpecManifest,
} from "@/lib/design-specs";
import { requireDesignSpecAdmin, resolveDesignSpecContext } from "@/lib/design-specs/route-helpers";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

function mutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    { success: false, error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

/** GET /api/design-specs?workingDir=&sessionId= → 文档列表 */
export async function GET(request: NextRequest) {
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const { workingDir } = resolved.ctx;
  try {
    return NextResponse.json(createApiSuccess(listDesignSpecDocs(workingDir)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", `读取设计规范列表失败: ${message}`),
      { status: 500 },
    );
  }
}

/** POST /api/design-specs?workingDir=&sessionId= body { title } → 新建文档 */
export async function POST(request: NextRequest) {
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const authorizationError = requireDesignSpecAdmin(resolved.ctx);
  if (authorizationError) return authorizationError;
  const { workingDir, live, liveContext } = resolved.ctx;

  const body = await request.json().catch(() => null);
  const title =
    body && typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "标题必填"),
      { status: 400 },
    );
  }

  try {
    const doc = buildNewDesignSpecDoc(title);

    if (live && liveContext) {
      const { manifestContent, docContent } = buildDesignSpecMutation(workingDir, doc);
      const previousManifest = readDesignSpecManifest(workingDir);
      const operations: WorkspaceMutationOperation[] = [
        {
          type: "put_text",
          path: "design-spec/manifest.json",
          content: manifestContent,
          ...(previousManifest.items.length === 0
            ? { expectedAbsent: true }
            : { expectedHash: hashText(JSON.stringify(previousManifest, null, 2)) }),
        },
        {
          type: "put_text",
          path: `design-spec/spec-${doc.id}.json`,
          content: docContent,
          expectedAbsent: true,
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveContext.projectId,
        workspaceId: liveContext.workspaceId,
        sessionId: liveContext.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "create_design_spec_document",
        operations,
      });
    } else {
      createDesignSpecDoc(workingDir, title);
    }

    return NextResponse.json(createApiSuccess(doc), { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return mutationErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
       createApiError("FILE_WRITE_ERROR", `创建设计规范失败: ${message}`),
      { status: 500 },
    );
  }
}
