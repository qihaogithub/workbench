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
  listUserChatAttachments,
  readChatAttachment,
  readChatAttachmentFile,
  deleteChatAttachment,
  deleteChatAttachments,
} from "@/lib/ai-attachments";
import { ConversationDomainError, getConversationService } from "@/lib/conversation";

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
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const auth = await authorize(sessionId);
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id");

  if (attachmentId) {
    const content = readChatAttachment(auth.projectId, attachmentId);
    if (
      !content ||
      content.metadata.ownerUserId !== auth.ownerUserId ||
      !content.metadata.conversationId ||
      !auth.activeConversationIds.has(content.metadata.conversationId)
    ) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "聊天附件不存在"),
        { status: 404 },
      );
    }
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
    return NextResponse.json(
      createApiSuccess({ metadata: content.metadata, text: content.text }),
    );
  }

  const attachments = listUserChatAttachments(
    auth.projectId,
    auth.ownerUserId,
    auth.activeConversationIds,
  );
  return NextResponse.json(createApiSuccess(attachments));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const auth = await authorize(sessionId);
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
    const ownedAttachments = ids.map((id) => {
      const attachment = readChatAttachment(auth.projectId, id);
      return (
        attachment &&
        attachment.metadata.ownerUserId === auth.ownerUserId &&
        attachment.metadata.conversationId &&
        auth.activeConversationIds.has(attachment.metadata.conversationId)
      ) ? attachment.metadata : null;
    });
    if (ownedAttachments.some((attachment) => !attachment)) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "一个或多个聊天附件不存在"),
        { status: 404 },
      );
    }
    const metadata = ownedAttachments.filter(
      (attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment),
    );
    const ownedIds = metadata.map((attachment) => attachment.id);
    const deleted = deleteChatAttachments(auth.projectId, ownedIds);
    const refsByConversation = new Map<string, string[]>();
    for (const attachment of metadata) {
      const refs = refsByConversation.get(attachment.conversationId!) ?? [];
      refs.push(attachment.id);
      refsByConversation.set(attachment.conversationId!, refs);
    }
    for (const [conversationId, storageRefs] of refsByConversation) {
      getConversationService().markAttachmentDeleted({
        ownerUserId: auth.ownerUserId,
        conversationId,
        storageRefs,
      });
    }
    return NextResponse.json(createApiSuccess({ deleted }));
  }

  const attachmentId = searchParams.get("id");
  if (!attachmentId) {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "缺少附件 id"),
      { status: 400 },
    );
  }

  const attachment = readChatAttachment(auth.projectId, attachmentId);
  if (
    !attachment ||
    attachment.metadata.ownerUserId !== auth.ownerUserId ||
    !attachment.metadata.conversationId ||
    !auth.activeConversationIds.has(attachment.metadata.conversationId)
  ) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "聊天附件不存在"),
      { status: 404 },
    );
  }
  const deleted = deleteChatAttachment(auth.projectId, attachmentId);
  if (!deleted) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "聊天附件不存在"),
      { status: 404 },
    );
  }
  getConversationService().markAttachmentDeleted({
    ownerUserId: auth.ownerUserId,
    conversationId: attachment.metadata.conversationId,
    storageRefs: [attachmentId],
  });
  return NextResponse.json(createApiSuccess({ deleted: true }));
}

async function authorize(sessionId: string): Promise<
  {
    ok: true;
    projectId: string;
    ownerUserId: string;
    activeConversationIds: ReadonlySet<string>;
  } | { ok: false; res: NextResponse }
> {
  const token = await getAuthCookie();
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
  if (!meta.userId || meta.userId !== payload.userId) {
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
  try {
    const conversations = getConversationService().list(payload.userId, projectId);
    const activeConversationIds = new Set(conversations.map((conversation) => conversation.id));
    if (!activeConversationIds.has(sessionId)) {
      return { ok: false, res: NextResponse.json(createApiError("FORBIDDEN", "对话与项目归属不匹配"), { status: 403 }) };
    }
    return { ok: true, projectId, ownerUserId: payload.userId, activeConversationIds };
  } catch (error) {
    const unavailable = error instanceof ConversationDomainError &&
      error.code === "CONVERSATION_STORE_UNAVAILABLE";
    return {
      ok: false,
      res: NextResponse.json(
        createApiError(
          unavailable ? "INTERNAL_ERROR" : "SESSION_NOT_FOUND",
          unavailable ? "对话账本暂不可用" : "对话账本记录不存在",
        ),
        { status: unavailable ? 503 : 404 },
      ),
    };
  }
}
