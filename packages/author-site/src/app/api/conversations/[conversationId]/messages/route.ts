import { randomUUID } from "crypto";
import { getConversationService } from "@/lib/conversation";
import { ConversationDomainError } from "@/lib/conversation/domain";
import { appendServerEditorDiagnosticEvent } from "@/lib/editor-diagnostics/store";
import { isChatAttachmentOwned, readChatAttachment } from "@/lib/ai-attachments";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId } = await params;
    const afterSequence = Number(new URL(request.url).searchParams.get("afterSequence") ?? 0);
    const projection = getConversationService().get(auth.user.id, conversationId);
    return conversationSuccess({
      conversation: projection.conversation,
      messages: projection.messages.filter((message) => message.sequence > afterSequence),
      runs: projection.runs,
    });
  } catch (error) {
    return conversationError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  const startedAt = Date.now();
  const requestId = `conversation-command-${randomUUID()}`;
  const { conversationId } = await params;
  let payloadBytes = 0;
  let clientRevision: number | undefined;
  try {
    const body = await readJsonObject(request);
    payloadBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
    clientRevision = typeof body.expectedRevision === "number"
      ? body.expectedRevision
      : undefined;
    const attachmentIds = [...new Set(
      Array.isArray(body.attachmentIds)
        ? body.attachmentIds.filter((id): id is string => typeof id === "string")
        : [],
    )];
    if (attachmentIds.length > 30) {
      throw new ConversationDomainError(
        "CONVERSATION_TOO_LARGE",
        "单条消息附件数量超出限制",
      );
    }
    const conversation = attachmentIds.length > 0
      ? getConversationService().get(auth.user.id, conversationId).conversation
      : null;
    const attachments = attachmentIds.map((attachmentId) => {
      if (!conversation) {
        throw new ConversationDomainError("CONVERSATION_NOT_FOUND", "对话不存在");
      }
      const attachment = readChatAttachment(conversation.projectId, attachmentId);
      if (
        !attachment ||
        !isChatAttachmentOwned(attachment.metadata, auth.user.id, conversationId)
      ) {
        throw new ConversationDomainError(
          "CONVERSATION_FORBIDDEN",
          "附件不存在或不属于当前对话",
        );
      }
      return {
        storageRef: attachmentId,
        sha256: attachment.metadata.sha256,
        mimeType: attachment.metadata.mimeType,
        sizeBytes: attachment.metadata.size,
      };
    });
    const ack = getConversationService().appendUserMessage({
      conversationId,
      ownerUserId: auth.user.id,
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId : "",
      content: typeof body.content === "string" ? body.content : "",
      displayParts: Array.isArray(body.displayParts) ? body.displayParts : [],
      attachments,
      kind: typeof body.kind === "string" ? body.kind : undefined,
    });
    appendServerEditorDiagnosticEvent({
      level: "info",
      eventGroup: "ai",
      eventType: "ai.message_persist_succeeded",
      sessionId: conversationId,
      traceId: requestId,
      operationId: requestId,
      payload: {
        requestId,
        messageId: ack.messageId,
        runId: ack.runId,
        clientRevision,
        revision: ack.conversationRevision,
        httpStatus: 201,
        payloadBytes,
        durationMs: Date.now() - startedAt,
        status: ack.status,
      },
    });
    return conversationSuccess(ack, 201);
  } catch (error) {
    const response = conversationError(error);
    appendServerEditorDiagnosticEvent({
      level: "error",
      eventGroup: "ai",
      eventType: "ai.message_persist_failed",
      sessionId: conversationId,
      traceId: requestId,
      operationId: requestId,
      payload: {
        requestId,
        clientRevision,
        httpStatus: response.status,
        payloadBytes,
        durationMs: Date.now() - startedAt,
        status: "failed",
        errorCode: error instanceof ConversationDomainError
          ? error.code
          : "CONVERSATION_STORE_UNAVAILABLE",
      },
    });
    return response;
  }
}
