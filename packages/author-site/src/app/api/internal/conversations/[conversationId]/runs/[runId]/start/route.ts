import { getConversationService } from "@/lib/conversation";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string; runId: string }> };

export async function POST(request: Request, { params }: Params) {
  const denied = requireConversationInternalToken(request);
  if (denied) return denied;
  try {
    const { conversationId, runId } = await params;
    const body = await readJsonObject(request);
    return conversationSuccess(
      getConversationService().startRun({
        conversationId,
        runId,
        messageId: typeof body.messageId === "string" ? body.messageId : "",
        assistantMessageId:
          typeof body.assistantMessageId === "string" ? body.assistantMessageId : "",
        ownerUserId: typeof body.ownerUserId === "string" ? body.ownerUserId : "",
        projectId: typeof body.projectId === "string" ? body.projectId : "",
        agentSessionId:
          typeof body.agentSessionId === "string" ? body.agentSessionId : "",
        modelProvider:
          typeof body.modelProvider === "string" ? body.modelProvider : undefined,
        modelId: typeof body.modelId === "string" ? body.modelId : undefined,
        traceId: typeof body.traceId === "string" ? body.traceId : undefined,
      }),
    );
  } catch (error) {
    return conversationError(error);
  }
}
