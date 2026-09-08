export {};

const commitRunTerminal = jest.fn();
const readJsonObject = jest.fn();
const conversationSuccess = jest.fn((data: unknown) => ({ status: 200, data }));
const conversationError = jest.fn(() => ({ status: 400 }));

jest.mock("@/lib/conversation", () => ({
  ConversationDomainError: class ConversationDomainError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  getConversationService: () => ({ commitRunTerminal }),
}));
jest.mock("@/lib/conversation/internal-auth", () => ({
  requireConversationInternalToken: jest.fn(() => null),
}));
jest.mock("@/lib/conversation/route-helpers", () => ({
  readJsonObject,
  conversationSuccess,
  conversationError,
}));

describe("conversation terminal route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readJsonObject.mockResolvedValue({
      messageId: "message-1",
      assistantMessageId: "assistant-1",
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "done",
      contextSummary: {
        schemaVersion: 1,
        reason: "preflight",
        sourceRevision: 3,
        coveredThroughSequence: 4,
        summaryText: "private compacted summary",
        tailMessages: [{ role: "assistant", content: "tail" }],
      },
    });
    commitRunTerminal.mockReturnValue({ status: "completed" });
  });

  it("passes a validated private context summary to the ledger", async () => {
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1", runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    expect(commitRunTerminal).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      runId: "run-1",
      contextSummary: {
        schemaVersion: 1,
        reason: "preflight",
        sourceRevision: 3,
        coveredThroughSequence: 4,
        summaryText: "private compacted summary",
        tailMessages: [{ role: "assistant", content: "tail" }],
      },
    }));
  });

  it("rejects malformed context summaries before repository commit", async () => {
    readJsonObject.mockResolvedValue({
      messageId: "message-1",
      assistantMessageId: "assistant-1",
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "done",
      contextSummary: { schemaVersion: 1, reason: "preflight" },
    });
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1", runId: "run-1" }),
    });

    expect(response.status).toBe(400);
    expect(commitRunTerminal).not.toHaveBeenCalled();
    expect(conversationError).toHaveBeenCalled();
  });
});
