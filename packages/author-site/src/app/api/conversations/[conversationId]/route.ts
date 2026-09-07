import { getConversationService } from "@/lib/conversation";
import { deleteConversationChatAttachments } from "@/lib/ai-attachments";
import {
  conversationError,
  conversationSuccess,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId } = await params;
    return conversationSuccess(getConversationService().get(auth.user.id, conversationId));
  } catch (error) {
    return conversationError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId } = await params;
    const scope = getConversationService().delete(auth.user.id, conversationId);
    try {
      deleteConversationChatAttachments(
        scope.projectId,
        scope.ownerUserId,
        scope.conversationId,
      );
    } catch (error) {
      console.warn("[ConversationLedger] deleted conversation attachment cleanup deferred", {
        conversationId,
        error,
      });
    }
    return conversationSuccess(null);
  } catch (error) {
    return conversationError(error);
  }
}
