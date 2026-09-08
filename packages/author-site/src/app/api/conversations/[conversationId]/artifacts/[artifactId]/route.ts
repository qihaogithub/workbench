import { getConversationService } from "@/lib/conversation";
import {
  conversationError,
  conversationSuccess,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

type Params = {
  params: Promise<{ conversationId: string; artifactId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { conversationId, artifactId } = await params;
    return conversationSuccess(
      getConversationService().getRunArtifact(
        auth.user.id,
        conversationId,
        artifactId,
      ),
    );
  } catch (error) {
    return conversationError(error);
  }
}
