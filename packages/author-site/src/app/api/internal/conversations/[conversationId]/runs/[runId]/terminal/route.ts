import {
  ConversationDomainError,
  getConversationService,
  type ConversationContextSummaryInput,
  type ConversationTerminalStatus,
} from "@/lib/conversation";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import {
  conversationError,
  conversationSuccess,
  readJsonObject,
} from "@/lib/conversation/route-helpers";

type Params = { params: Promise<{ conversationId: string; runId: string }> };

const TERMINAL = new Set<ConversationTerminalStatus>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

function parseContextSummary(value: unknown): ConversationContextSummaryInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConversationDomainError("CONVERSATION_INVALID", "context summary 无效");
  }
  const summary = value as Record<string, unknown>;
  if (
    summary.schemaVersion !== 1 ||
    (summary.reason !== "preflight" && summary.reason !== "overflow_recovery") ||
    !Number.isInteger(summary.sourceRevision) ||
    !Number.isInteger(summary.coveredThroughSequence) ||
    typeof summary.summaryText !== "string" ||
    !Array.isArray(summary.tailMessages)
  ) {
    throw new ConversationDomainError("CONVERSATION_INVALID", "context summary 字段无效");
  }
  const tailMessages = summary.tailMessages.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      ((item as { role?: unknown }).role !== "user" &&
        (item as { role?: unknown }).role !== "assistant") ||
      typeof (item as { content?: unknown }).content !== "string"
    ) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "context summary tail 无效");
    }
    const role = (item as { role: "user" | "assistant" }).role;
    return { role, content: (item as { content: string }).content };
  });
  return {
    schemaVersion: 1,
    reason: summary.reason,
    sourceRevision: summary.sourceRevision as number,
    coveredThroughSequence: summary.coveredThroughSequence as number,
    summaryText: summary.summaryText,
    tailMessages,
  };
}

export async function POST(request: Request, { params }: Params) {
  const denied = requireConversationInternalToken(request);
  if (denied) return denied;
  try {
    const { conversationId, runId } = await params;
    const body = await readJsonObject(request);
    const status = body.status as ConversationTerminalStatus;
    if (!TERMINAL.has(status)) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "run 终态无效");
    }
    return conversationSuccess(
      getConversationService().commitRunTerminal({
        conversationId,
        runId,
        messageId: typeof body.messageId === "string" ? body.messageId : "",
        assistantMessageId:
          typeof body.assistantMessageId === "string" ? body.assistantMessageId : "",
        ownerUserId: typeof body.ownerUserId === "string" ? body.ownerUserId : "",
        projectId: typeof body.projectId === "string" ? body.projectId : "",
        status,
        content: typeof body.content === "string" ? body.content : undefined,
        displayParts: Array.isArray(body.displayParts) ? body.displayParts : [],
        errorCode: typeof body.errorCode === "string" ? body.errorCode : undefined,
        usage:
          body.usage && typeof body.usage === "object" && !Array.isArray(body.usage)
            ? (body.usage as Record<string, unknown>)
            : undefined,
        summary:
          body.summary && typeof body.summary === "object" && !Array.isArray(body.summary)
            ? (body.summary as Record<string, unknown>)
            : undefined,
        traceId: typeof body.traceId === "string" ? body.traceId : undefined,
        contextSummary: parseContextSummary(body.contextSummary),
      }),
    );
  } catch (error) {
    return conversationError(error);
  }
}
