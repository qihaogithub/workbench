export {};

const appendUserMessage = jest.fn();
const getConversation = jest.fn();
const readChatAttachment = jest.fn();
const appendServerEditorDiagnosticEvent = jest.fn();
const conversationSuccess = jest.fn((data: unknown, status = 200) => ({ data, status }));
const conversationError = jest.fn(() => ({ status: 503 }));
const readJsonObject = jest.fn();

jest.mock("@/lib/conversation", () => ({
  getConversationService: () => ({
    appendUserMessage,
    get: getConversation,
  }),
}));

jest.mock("@/lib/ai-attachments", () => ({
  readChatAttachment,
  isChatAttachmentOwned: (metadata: { ownerUserId?: string; conversationId?: string }, ownerUserId: string, conversationId: string) =>
    metadata.ownerUserId === ownerUserId && metadata.conversationId === conversationId,
}));

jest.mock("@/lib/conversation/route-helpers", () => ({
  requireConversationUser: jest.fn(async () => ({
    ok: true,
    user: { id: "user-1" },
  })),
  readJsonObject,
  conversationSuccess,
  conversationError,
}));

jest.mock("@/lib/editor-diagnostics/store", () => ({
  appendServerEditorDiagnosticEvent,
}));

describe("conversation message command route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readJsonObject.mockResolvedValue({
      clientMessageId: "client-message-1",
      content: "private prompt",
      expectedRevision: 4,
    });
    getConversation.mockReturnValue({
      conversation: { projectId: "project-1" },
    });
    appendUserMessage.mockReturnValue({
      conversationId: "conversation-1",
      messageId: "message-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      sequence: 1,
      serverCreatedAt: 1,
      conversationRevision: 5,
      status: "accepted",
    });
  });

  it("resolves owned attachment metadata before committing the command", async () => {
    readJsonObject.mockResolvedValue({
      clientMessageId: "client-message-1",
      content: "read this",
      attachmentIds: ["attachment-1", "attachment-1"],
      displayParts: [{
        type: "file",
        name: "notes.txt",
        url: "",
        size: 12,
        attachmentId: "attachment-1",
        mimeType: "text/plain",
        textExtracted: true,
      }],
    });
    readChatAttachment.mockReturnValue({
      metadata: {
        id: "attachment-1",
        ownerUserId: "user-1",
        conversationId: "conversation-1",
        sha256: "a".repeat(64),
        mimeType: "text/plain",
        size: 12,
      },
      text: "hello",
    });
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(201);
    expect(appendUserMessage).toHaveBeenCalledWith(expect.objectContaining({
      displayParts: [{
        type: "file",
        name: "notes.txt",
        url: "",
        size: 12,
        attachmentId: "attachment-1",
        mimeType: "text/plain",
        textExtracted: true,
      }],
      attachments: [{
        storageRef: "attachment-1",
        sha256: "a".repeat(64),
        mimeType: "text/plain",
        sizeBytes: 12,
      }],
    }));
  });

  it("rejects attachments owned by another conversation before ledger mutation", async () => {
    readJsonObject.mockResolvedValue({
      clientMessageId: "client-message-1",
      content: "read this",
      attachmentIds: ["attachment-1"],
    });
    readChatAttachment.mockReturnValue({
      metadata: {
        id: "attachment-1",
        ownerUserId: "user-1",
        conversationId: "conversation-other",
        size: 12,
      },
      text: "hello",
    });
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(503);
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("records an allowlisted persistence success without message content", async () => {
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(201);
    expect(appendUserMessage).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      content: "private prompt",
    }));
    const diagnostic = appendServerEditorDiagnosticEvent.mock.calls[0][0];
    expect(diagnostic).toEqual(expect.objectContaining({
      eventType: "ai.message_persist_succeeded",
      sessionId: "conversation-1",
      operationId: expect.stringMatching(/^conversation-command-/),
      payload: expect.objectContaining({
        clientRevision: 4,
        revision: 5,
        httpStatus: 201,
        messageId: "message-1",
        runId: "run-1",
      }),
    }));
    expect(diagnostic.payload).not.toHaveProperty("content");
  });

  it("records a failed persistence attempt with status and no content", async () => {
    appendUserMessage.mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    const { POST } = await import("./route");
    const response = await POST({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(503);
    const diagnostic = appendServerEditorDiagnosticEvent.mock.calls[0][0];
    expect(diagnostic).toEqual(expect.objectContaining({
      eventType: "ai.message_persist_failed",
      level: "error",
      payload: expect.objectContaining({
        clientRevision: 4,
        httpStatus: 503,
        status: "failed",
        errorCode: "CONVERSATION_STORE_UNAVAILABLE",
      }),
    }));
    expect(diagnostic.payload).not.toHaveProperty("content");
  });
});
