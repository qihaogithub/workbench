import type { NextRequest } from "next/server";

const commitHtmlImportDraft = jest.fn();
const deleteHtmlImportDraft = jest.fn();
const readHtmlImportDraft = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: (code: string, message?: string) => ({ success: false, error: { code, message } }),
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
  getSessionMeta: jest.fn(() => ({ userId: "user-1", demoId: "project-1", workspaceId: "workspace-1" })),
  isSessionExpired: jest.fn(() => false),
}));
jest.mock("@/lib/html-import-draft", () => ({
  commitHtmlImportDraft,
  deleteHtmlImportDraft,
  readHtmlImportDraft,
  WorkspaceAuthorityClientError: class WorkspaceAuthorityClientError extends Error {},
}));

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const presentation = {
  version: 1 as const,
  mode: "responsive-page" as const,
  viewport: { width: 1440, height: 900 },
  heightBehavior: "content" as const,
  preset: "desktop" as const,
  source: "user" as const,
};

describe("POST HTML import commit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readHtmlImportDraft.mockReturnValue({
      draftId: "draft-1", projectId: "project-1", userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1", name: "old",
      analysis: {
        compatibility: "degraded",
        source: { kind: "figma-export", confirmationBypassEligible: true },
        presentation: { confirmationRequired: true },
      },
    });
    commitHtmlImportDraft.mockResolvedValue({ id: "page-1", name: "dashboard", order: 0 });
  });

  it("重新校验绑定后原子提交并保留 receipt draft 供幂等重放", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", draftId: "draft-1", presentation, name: "dashboard" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(response.status).toBe(201);
    expect(commitHtmlImportDraft).toHaveBeenCalledWith(expect.objectContaining({ name: "dashboard" }), presentation);
    expect(deleteHtmlImportDraft).not.toHaveBeenCalled();
  });

  it("拒绝跨 Session 使用 draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "other-session", draftId: "draft-1", presentation }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(response.status).toBe(400);
    expect(commitHtmlImportDraft).not.toHaveBeenCalled();
  });

  it("仅允许可信 Figma draft 在未确认时提交", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", draftId: "draft-1", presentation }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(response.status).toBe(201);

    readHtmlImportDraft.mockReturnValueOnce({
      draftId: "draft-2", projectId: "project-1", userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1", name: "plain",
      analysis: {
        compatibility: "degraded",
        source: { kind: "unknown", confirmationBypassEligible: false },
        presentation: { confirmationRequired: false },
      },
    });
    const rejected = await POST(request({ sessionId: "session-1", draftId: "draft-2", presentation }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(rejected.status).toBe(422);
  });
});
