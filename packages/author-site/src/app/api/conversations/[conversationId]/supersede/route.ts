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
      getConversationService().supersede({
        ownerUserId: auth.user.id,
        conversationId,
        afterMessageId: typeof body.afterMessageId === "string" ? body.afterMessageId : null,
        expectedRevision:
          typeof body.expectedRevision === "number" ? body.expectedRevision : Number.NaN,
      }),
    );
  } catch (error) {
    return conversationError(error);
  }
}
