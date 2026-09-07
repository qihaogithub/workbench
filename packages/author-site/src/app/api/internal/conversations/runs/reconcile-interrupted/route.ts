import { ConversationDomainError, getConversationService } from "@/lib/conversation";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
} from "@/lib/conversation/route-helpers";

export async function POST(request: Request) {
  const denied = requireConversationInternalToken(request);
  if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    const startedBefore =
      typeof body.startedBefore === "number" ? body.startedBefore : Number.NaN;
    if (!Number.isFinite(startedBefore)) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "startedBefore 必填");
    }
    return conversationSuccess({
      interrupted: getConversationService().reconcileInterrupted(startedBefore),
    });
  } catch (error) {
    return conversationError(error);
  }
}
