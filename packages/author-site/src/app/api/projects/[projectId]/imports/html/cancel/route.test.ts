import type { NextRequest } from "next/server";

const deleteHtmlImportDraft = jest.fn();
const readHtmlImportDraft = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: (code: string, message?: string) => ({
    success: false,
    error: { code, message },
  }),
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
}));
jest.mock("@/lib/html-import-draft", () => ({
  deleteHtmlImportDraft,
  readHtmlImportDraft,
}));

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST HTML import cancel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readHtmlImportDraft.mockReturnValue({
      draftId: "draft-1",
      projectId: "project-1",
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  it("清理当前用户与 Session 绑定的 draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ sessionId: "session-1", draftId: "draft-1" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(deleteHtmlImportDraft).toHaveBeenCalledWith("draft-1");
  });

  it("拒绝跨 Session 取消 draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ sessionId: "other-session", draftId: "draft-1" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(deleteHtmlImportDraft).not.toHaveBeenCalled();
  });
});
