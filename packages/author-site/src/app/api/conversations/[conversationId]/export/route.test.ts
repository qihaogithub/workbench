export {};

const getProjection = jest.fn();
const conversationSuccess = jest.fn((data: unknown) => ({ status: 200, data }));
const conversationError = jest.fn(() => ({ status: 404 }));

jest.mock("@/lib/conversation", () => ({
  getConversationService: () => ({ get: getProjection }),
}));

jest.mock("@/lib/conversation/route-helpers", () => ({
  requireConversationUser: jest.fn(async () => ({
    ok: true,
    user: { id: "user-1" },
  })),
  conversationSuccess,
  conversationError,
}));

describe("conversation export route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports the exact owner-scoped canonical projection", async () => {
    const projection = {
      conversation: { id: "conversation-1", revision: 3 },
      messages: [{
        id: "message-1",
        content: "hello",
        displayParts: [{
          type: "file",
          name: "reference.png",
          url: "",
          size: 128,
          attachmentId: "attachment-image-1",
          mimeType: "image/png",
          textExtracted: false,
        }],
      }],
      runs: [{ id: "run-1", status: "completed" }],
    };
    getProjection.mockReturnValue(projection);
    const { GET } = await import("./route");
    const response = await GET({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(getProjection).toHaveBeenCalledWith("user-1", "conversation-1");
    expect((response as unknown as { data: unknown }).data).toEqual({
      exportedAt: expect.any(String),
      ...projection,
    });
    expect(JSON.stringify((response as unknown as { data: unknown }).data)).not.toContain("data:");
  });

  it("does not produce an export when the owner-scoped projection is unavailable", async () => {
    getProjection.mockImplementationOnce(() => {
      throw new Error("not found");
    });
    const { GET } = await import("./route");
    const response = await GET({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(404);
    expect(conversationSuccess).not.toHaveBeenCalled();
    expect(conversationError).toHaveBeenCalled();
  });
});
