/** @jest-environment node */

import { NextRequest } from "next/server";

const getAuthCookie = jest.fn();
const verifyToken = jest.fn();
const sessionExists = jest.fn();
const getSessionMeta = jest.fn();
const isSessionExpired = jest.fn();
const findWorkspacePath = jest.fn();
const getWorkspaceMeta = jest.fn();
const listConversations = jest.fn();
const markAttachmentDeleted = jest.fn();
const listUserChatAttachments = jest.fn();
const readChatAttachment = jest.fn();
const readChatAttachmentFile = jest.fn();
const deleteChatAttachment = jest.fn();
const deleteChatAttachments = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie, verifyToken }));

jest.mock("@/lib/fs-utils", () => ({
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  createApiError: (code: string, message?: string) => ({
    success: false,
    error: { code, message },
  }),
}));

jest.mock("@/lib/workspace-meta", () => ({ getWorkspaceMeta }));

jest.mock("@/lib/conversation", () => ({
  ConversationDomainError: class ConversationDomainError extends Error {},
  getConversationService: () => ({
    list: listConversations,
    markAttachmentDeleted,
  }),
}));

jest.mock("@/lib/ai-attachments", () => ({
  listUserChatAttachments,
  readChatAttachment,
  readChatAttachmentFile,
  deleteChatAttachment,
  deleteChatAttachments,
}));

describe("session attachment route ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthCookie.mockResolvedValue("token");
    verifyToken.mockResolvedValue({ userId: "user-1" });
    sessionExists.mockReturnValue(true);
    getSessionMeta.mockReturnValue({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    isSessionExpired.mockReturnValue(false);
    findWorkspacePath.mockReturnValue("/tmp/workspace-1");
    getWorkspaceMeta.mockReturnValue({ projectId: "project-1" });
    listConversations.mockReturnValue([
      { id: "conversation-1" },
      { id: "conversation-2" },
    ]);
    listUserChatAttachments.mockReturnValue([]);
    deleteChatAttachment.mockReturnValue(true);
    deleteChatAttachments.mockReturnValue(1);
  });

  function request(query = ""): NextRequest {
    return new NextRequest(
      `http://localhost/api/sessions/conversation-1/attachments${query}`,
    );
  }

  const context = {
    params: Promise.resolve({ sessionId: "conversation-1" }),
  };

  it("lists only the current owner's attachments from active project conversations", async () => {
    const { GET } = await import("./route");
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(listUserChatAttachments).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      new Set(["conversation-1", "conversation-2"]),
    );
  });

  it("allows reading an owned attachment from another active conversation", async () => {
    readChatAttachment.mockReturnValue({
      metadata: {
        id: "attachment-1",
        ownerUserId: "user-1",
        conversationId: "conversation-2",
      },
      text: "private",
    });
    const { GET } = await import("./route");
    const response = await GET(request("?id=attachment-1"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { text: "private" },
    });
  });

  it("fails closed for another owner or a deleted conversation", async () => {
    const { GET } = await import("./route");
    for (const metadata of [
      {
        id: "attachment-other-user",
        ownerUserId: "user-2",
        conversationId: "conversation-2",
      },
      {
        id: "attachment-deleted-conversation",
        ownerUserId: "user-1",
        conversationId: "conversation-deleted",
      },
    ]) {
      readChatAttachment.mockReturnValueOnce({ metadata, text: "private" });
      const response = await GET(request(`?id=${metadata.id}`), context);
      expect(response.status).toBe(404);
    }
  });

  it("marks the attachment link in its owning conversation after physical deletion", async () => {
    readChatAttachment.mockReturnValue({
      metadata: {
        id: "attachment-1",
        ownerUserId: "user-1",
        conversationId: "conversation-2",
      },
      text: "private",
    });
    const { DELETE } = await import("./route");
    const response = await DELETE(request("?id=attachment-1"), context);

    expect(response.status).toBe(200);
    expect(deleteChatAttachment).toHaveBeenCalledWith("project-1", "attachment-1");
    expect(markAttachmentDeleted).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      conversationId: "conversation-2",
      storageRefs: ["attachment-1"],
    });
  });

  it("rejects the attachment API when the route session is absent from the ledger", async () => {
    listConversations.mockReturnValue([{ id: "conversation-2" }]);
    const { GET } = await import("./route");
    const response = await GET(request(), context);

    expect(response.status).toBe(403);
    expect(listUserChatAttachments).not.toHaveBeenCalled();
  });
});
