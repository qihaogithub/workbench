import { getConversationService } from "@/lib/conversation";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId } = await params;
    const body = await readJsonObject(request);
    return conversationSuccess(
      getConversationService().retryRun({
        ownerUserId: auth.user.id,
        conversationId,
        userMessageId: typeof body.userMessageId === "string" ? body.userMessageId : "",
      }),
      201,
    );
  } catch (error) {
    return conversationError(error);
  }
}
