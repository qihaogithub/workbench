import { NextRequest, NextResponse } from "next/server";
import {
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
  findWorkspacePath,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getWorkspaceMeta } from "@/lib/workspace-meta";
import {
  listChatAttachments,
  readChatAttachment,
  readChatAttachmentFile,
  deleteChatAttachment,
  deleteChatAttachments,
} from "@/lib/ai-attachments";

/**
 * 聊天附件（.ai-attachments）读取/删除接口。
 * GET  /api/sessions/{sessionId}/attachments            → 附件清单
 * GET  /api/sessions/{sessionId}/attachments?id={id}    → 指定附件的文本内容
 * GET  /api/sessions/{sessionId}/attachments?id={id}&raw=1 → 指定附件的原始文件（图片等二进制）
 * DELETE /api/sessions/{sessionId}/attachments?id={id}  → 删除单个附件
 * DELETE /api/sessions/{sessionId}/attachments?ids=a,b  → 批量删除附件
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const auth = await authorize(params.sessionId);
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id");

  if (attachmentId) {
    if (searchParams.get("raw") === "1") {
      const file = readChatAttachmentFile(auth.projectId, attachmentId);
      if (!file) {
        return NextResponse.json(
          createApiError("FILE_READ_ERROR", "聊天附件不存在"),
          { status: 404 },
        );
      }
      return new NextResponse(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Length": String(file.buffer.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    const content = readChatAttachment(auth.projectId, attachmentId);
    if (!content) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "聊天附件不存在"),
        { status: 404 },
      );
    }
    return NextResponse.json(
      createApiSuccess({ metadata: content.metadata, text: content.text }),
    );
  }

  const attachments = listChatAttachments(auth.projectId);
  return NextResponse.json(createApiSuccess(attachments));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const auth = await authorize(params.sessionId);
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "缺少附件 id"),
        { status: 400 },
      );
    }
    const deleted = deleteChatAttachments(auth.projectId, ids);
    return NextResponse.json(createApiSuccess({ deleted }));
  }

  const attachmentId = searchParams.get("id");
  if (!attachmentId) {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "缺少附件 id"),
      { status: 400 },
    );
  }

  const deleted = deleteChatAttachment(auth.projectId, attachmentId);
  if (!deleted) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "聊天附件不存在"),
      { status: 404 },
    );
  }
  return NextResponse.json(createApiSuccess({ deleted: true }));
}

async function authorize(sessionId: string): Promise<
  { ok: true; projectId: string } | { ok: false; res: NextResponse }
> {
  const token = getAuthCookie();
  if (!token) {
    return { ok: false, res: NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 }) };
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return { ok: false, res: NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 }) };
  }
  if (!sessionExists(sessionId)) {
    return { ok: false, res: NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 }) };
  }
  const meta = getSessionMeta(sessionId);
  if (!meta) {
    return { ok: false, res: NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 }) };
  }
  if (meta.userId && meta.userId !== payload.userId) {
    return { ok: false, res: NextResponse.json(createApiError("FORBIDDEN", "无权访问其他用户的 Session"), { status: 403 }) };
  }
  if (isSessionExpired(meta)) {
    return { ok: false, res: NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 }) };
  }
  if (!meta.workspaceId) {
    return { ok: false, res: NextResponse.json(createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"), { status: 400 }) };
  }
  const wsPath = findWorkspacePath(meta.workspaceId);
  if (!wsPath) {
    return { ok: false, res: NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间路径不存在"), { status: 500 }) };
  }
  const wsMeta = getWorkspaceMeta(meta.workspaceId);
  const projectId = wsMeta?.projectId;
  if (!projectId) {
    return { ok: false, res: NextResponse.json(createApiError("FILE_READ_ERROR", "项目 ID 缺失，无法读取聊天附件"), { status: 400 }) };
  }
  return { ok: true, projectId };
}