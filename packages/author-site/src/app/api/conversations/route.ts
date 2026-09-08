import { ConversationDomainError, getConversationService } from "@/lib/conversation";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
  requireConversationUser,
} from "@/lib/conversation/route-helpers";

export async function GET(request: Request) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
    if (!projectId) throw new ConversationDomainError("CONVERSATION_INVALID", "projectId 必填");
    return conversationSuccess(getConversationService().list(auth.user.id, projectId));
  } catch (error) {
    return conversationError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireConversationUser(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await readJsonObject(request);
    const id = typeof body.conversationId === "string" ? body.conversationId : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const title = typeof body.title === "string" ? body.title : null;
    const conversation = getConversationService().ensureConversation({
      id,
      ownerUserId: auth.user.id,
      projectId,
      workspaceId,
      title,
    });
    return conversationSuccess(conversation, 201);
  } catch (error) {
    return conversationError(error);
  }
}
