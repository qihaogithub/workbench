import { NextRequest, NextResponse } from "next/server";
import {
  createApiError,
  createApiSuccess,
  getSessionMeta,
  isSessionExpired,
} from "@/lib/fs-utils";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import { findUserById } from "@/lib/user";
import { toProjectAdminActor } from "@/lib/auth/current-user";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";
import {
  readMarkdownReferenceContent,
  readMarkdownReferenceImage,
  type MarkdownReferenceReadRequest,
} from "@/lib/markdown-reference-content";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
} from "@workbench/shared/markdown-reference";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

function response(body: unknown, status = 200): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

function noStore<T extends NextResponse>(value: T): T {
  value.headers.set("Cache-Control", "no-store");
  return value;
}

function error(
  code:
    | "INVALID_REQUEST"
    | "FORBIDDEN"
    | "FILE_READ_ERROR"
    | "PROJECT_NOT_FOUND"
    | "SESSION_NOT_FOUND"
    | "SESSION_EXPIRED",
  status: number,
  message?: string,
) {
  return response(createApiError(code, message), status);
}

async function readBody(
  request: NextRequest,
): Promise<MarkdownReferenceReadRequest | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8",
  );
  try {
    const body = JSON.parse(raw) as Partial<MarkdownReferenceReadRequest>;
    if (
      typeof body.ownerUserId !== "string" ||
      body.ownerUserId.length === 0 ||
      typeof body.sourceProjectId !== "string" ||
      body.sourceProjectId.length === 0 ||
      typeof body.sessionId !== "string" ||
      body.sessionId.length === 0 ||
      typeof body.uri !== "string" ||
      body.uri.length === 0 ||
      body.uri.length > 4096 ||
      (body.mode !== undefined &&
        body.mode !== "content" &&
        body.mode !== "image") ||
      (body.assetId !== undefined &&
        (typeof body.assetId !== "string" || body.assetId.length > 512)) ||
      (body.offset !== undefined &&
        (!Number.isSafeInteger(body.offset) || body.offset < 0))
    )
      return null;
    return {
      ...body,
      mode: body.mode ?? "content",
    } as MarkdownReferenceReadRequest;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const tokenError = requireConversationInternalToken(request);
  if (tokenError) {
    tokenError.headers.set("Cache-Control", "no-store");
    return tokenError;
  }

  try {
    const body = await readBody(request);
    if (!body) return error("INVALID_REQUEST", 400);
    const target = decodeMarkdownReferenceUri(body.uri);
    if (!target || encodeMarkdownReferenceUri(target) !== body.uri)
      return error("INVALID_REQUEST", 400);

    const user = findUserById(body.ownerUserId);
    if (!user) return error("FORBIDDEN", 403);
    const actor = toProjectAdminActor(user);
    const service = getProjectAdminService();
    const sourceProject = service.getProject(body.sourceProjectId, actor);
    if (!sourceProject.ok) return noStore(projectAdminResponse(sourceProject));
    const targetProject = service.getProject(target.projectId, actor);
    if (!targetProject.ok) return noStore(projectAdminResponse(targetProject));

    const session = getSessionMeta(body.sessionId);
    if (
      !session ||
      session.userId !== body.ownerUserId ||
      session.demoId !== body.sourceProjectId ||
      !session.workspaceId
    )
      return error("SESSION_NOT_FOUND", 404);
    if (isSessionExpired(session)) return error("SESSION_EXPIRED", 410);

    const sourceRequest = new NextRequest(
      `${request.nextUrl.origin}${request.nextUrl.pathname}${target.projectId === body.sourceProjectId ? `?sessionId=${encodeURIComponent(body.sessionId)}` : ""}`,
    );
    const context = resolveMarkdownReferenceWorkspace(
      sourceRequest,
      target.projectId,
      body.ownerUserId,
    );
    if (!context) return error("FILE_READ_ERROR", 404, "工作空间不可用");
    if (body.mode === "image") {
      if (!body.assetId) return error("INVALID_REQUEST", 400);
      const data = await readMarkdownReferenceImage(
        context,
        body.uri,
        body.assetId,
      );
      return response(createApiSuccess(data));
    }
    const data = readMarkdownReferenceContent(
      context,
      body.uri,
      body.offset ?? 0,
    );
    return response(createApiSuccess(data));
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (
      [
        "REFERENCE_NOT_FOUND",
        "IMAGE_NOT_FOUND",
        "IMAGE_NOT_IN_REFERENCE",
        "IMAGE_NOT_SUPPORTED",
      ].includes(code)
    )
      return error("FILE_READ_ERROR", 404, "引用内容不可用");
    if (code === "IMAGE_TOO_LARGE")
      return error("FILE_READ_ERROR", 413, "图片超过大小限制");
    return error("FILE_READ_ERROR", 503, "引用内容暂时不可用");
  }
}
