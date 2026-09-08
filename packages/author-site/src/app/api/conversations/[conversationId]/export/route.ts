import { getConversationService } from "@/lib/conversation";
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
    return conversationSuccess({
      exportedAt: new Date().toISOString(),
      ...getConversationService().get(auth.user.id, conversationId),
    });
  } catch (error) {
    return conversationError(error);
  }
}
