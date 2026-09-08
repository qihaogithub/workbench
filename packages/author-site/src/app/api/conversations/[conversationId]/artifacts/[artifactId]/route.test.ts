export {};

const getRunArtifact = jest.fn();
const requireConversationUser = jest.fn();
const conversationSuccess = jest.fn((data: unknown) => ({ status: 200, data }));
const conversationError = jest.fn(() => ({ status: 404 }));

jest.mock("@/lib/conversation", () => ({
  getConversationService: () => ({ getRunArtifact }),
}));
jest.mock("@/lib/conversation/route-helpers", () => ({
  requireConversationUser,
  conversationSuccess,
  conversationError,
}));

describe("conversation run artifact route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireConversationUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  });

  it("reads an artifact through the authenticated owner scope", async () => {
    getRunArtifact.mockReturnValue({ id: "artifact-1", payload: [{ type: "tool" }] });
    const { GET } = await import("./route");
    const response = await GET({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1", artifactId: "artifact-1" }),
    });

    expect(getRunArtifact).toHaveBeenCalledWith("user-1", "conversation-1", "artifact-1");
    expect((response as unknown as { data: unknown }).data).toEqual({
      id: "artifact-1",
      payload: [{ type: "tool" }],
    });
  });

  it("does not query storage when authentication fails", async () => {
    const unauthorized = { status: 401 };
    requireConversationUser.mockResolvedValue({ ok: false, response: unauthorized });
    const { GET } = await import("./route");
    const response = await GET({} as Request, {
      params: Promise.resolve({ conversationId: "conversation-1", artifactId: "artifact-1" }),
    });

    expect(response).toBe(unauthorized);
    expect(getRunArtifact).not.toHaveBeenCalled();
  });
});
