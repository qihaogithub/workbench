import { getConversationService } from "@/lib/conversation";
import {
  conversationError,
  conversationSuccess,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string; runId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId, runId } = await params;
    return conversationSuccess(
      getConversationService().requestRunCancellation({
        ownerUserId: auth.user.id,
        conversationId,
        runId,
      }),
    );
  } catch (error) {
    return conversationError(error);
  }
}
