import { getConversationService } from "@/lib/conversation";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId } = await params;
    const body = await readJsonObject(request);
    const result = getConversationService().updateTitle({
      ownerUserId: auth.user.id,
      conversationId,
      title: typeof body.title === "string" ? body.title : "",
    });
    return conversationSuccess(result);
  } catch (error) {
    return conversationError(error);
  }
}
