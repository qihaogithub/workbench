import type { NextRequest } from "next/server";

const prepareHtmlImportDraft = jest.fn();

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
jest.mock("@/lib/html-import-draft", () => ({ prepareHtmlImportDraft }));

function request(body: unknown): NextRequest {
  return { json: async () => body, nextUrl: new URL("http://localhost/api/import") } as unknown as NextRequest;
}

const presentation = {
  version: 1 as const,
  mode: "responsive-page" as const,
  viewport: { width: 1440, height: 900 },
  heightBehavior: "content" as const,
  preset: "desktop" as const,
  source: "recommended" as const,
};

describe("POST HTML import prepare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prepareHtmlImportDraft.mockReturnValue({
      draft: {
        draftId: "draft-1",
        filename: "dashboard.html",
        name: "dashboard",
        presentation,
        analysis: {
          outcome: { status: "accepted", runtimeType: "sandboxed-html" },
          compatibility: "degraded",
          source: { kind: "figma-export", confirmationBypassEligible: true },
          presentation: { profile: presentation, confidence: "low", confirmationRequired: true },
        },
        execution: { executionUrl: "https://sandbox.test/e/1", channelId: "channel-1", expiresAt: 100 },
      },
    });
  });

  it("只创建私有 draft 并返回推荐视口和安全执行入口", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", filename: "dashboard.html", html: "<main/>" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data).toMatchObject({
      draftId: "draft-1",
      confirmationRequired: false,
      recommendation: presentation,
      execution: { executionUrl: "https://sandbox.test/e/1", channelId: "channel-1" },
    });
    expect(prepareHtmlImportDraft).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", workspaceId: "workspace-1" }));
  });

  it("allows a trusted Figma export to bypass confirmation even when resources degrade", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", filename: "figma.html", html: "<main/>" }), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    const payload = await response.json();
    expect(payload.data.confirmationRequired).toBe(false);
  });
});
