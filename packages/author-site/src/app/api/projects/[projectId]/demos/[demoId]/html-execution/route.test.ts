import type { NextRequest } from "next/server";

const mockGetAuthCookie = jest.fn(async () => "token");
const mockVerifyToken = jest.fn(async () => ({ userId: "user-1" }));
const mockProjectExists = jest.fn(() => true);
const mockSessionExists = jest.fn(() => true);
const mockGetSessionMeta = jest.fn(() => ({
  sessionId: "session-1",
  demoId: "project-1",
  userId: "user-1",
  workspaceId: "workspace-1",
  expiresAt: Date.now() + 60_000,
}));
const mockIsSessionExpired = jest.fn(() => false);
const mockListDemoPages = jest.fn(() => [{ id: "page-1", runtimeType: "sandboxed-html" }]);
const mockGetWorkspaceDemoPageFiles = jest.fn();
const mockFindWorkspacePath = jest.fn(() => "/tmp/workspace-1");
const mockNormalizeHtmlImport = jest.fn();
const mockCreateHtmlSandboxExecution = jest.fn(() => ({
  executionId: "a".repeat(32),
  channelId: "b".repeat(32),
  expiresAt: 301_000,
}));
const mockResolveHtmlSandboxPublicOrigin = jest.fn(() => "http://127.0.0.1:4200");

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: mockGetAuthCookie,
  verifyToken: mockVerifyToken,
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string) => ({
    success: false,
    error: { code, message: message || code },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  getSessionMeta: mockGetSessionMeta,
  getWorkspaceDemoPageFiles: mockGetWorkspaceDemoPageFiles,
  isSessionExpired: mockIsSessionExpired,
  listDemoPages: mockListDemoPages,
  projectExists: mockProjectExists,
  sessionExists: mockSessionExists,
}));
jest.mock("@/lib/workspace-meta", () => ({ findWorkspacePath: mockFindWorkspacePath }));
jest.mock("@workbench/project-core", () => ({ normalizeHtmlImport: mockNormalizeHtmlImport }));
jest.mock("@/lib/html-sandbox-execution", () => ({
  createHtmlSandboxExecution: mockCreateHtmlSandboxExecution,
  HTML_SANDBOX_POLICY_VERSION: 1,
  resolveHtmlSandboxPublicOrigin: mockResolveHtmlSandboxPublicOrigin,
}));
jest.mock("@/lib/editor-diagnostics/store", () => ({
  appendServerEditorDiagnosticEvent: jest.fn(),
}));

const validHtml = "<button>safe</button>";
const validMeta = {
  analysisVersion: 1,
  sourceHash: "1".repeat(64),
  normalizedHash: "2".repeat(64),
  sandboxPolicyVersion: 1,
};

function makeRequest(body: unknown, origin = "http://localhost:4200"): NextRequest {
  return {
    nextUrl: { origin },
    json: async () => body,
  } as unknown as NextRequest;
}

describe("HTML sandbox execution issuance route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthCookie.mockResolvedValue("token");
    mockVerifyToken.mockResolvedValue({ userId: "user-1" });
    mockGetSessionMeta.mockReturnValue({
      sessionId: "session-1",
      demoId: "project-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      expiresAt: Date.now() + 60_000,
    });
    mockProjectExists.mockReturnValue(true);
    mockSessionExists.mockReturnValue(true);
    mockIsSessionExpired.mockReturnValue(false);
    mockListDemoPages.mockReturnValue([{ id: "page-1", runtimeType: "sandboxed-html" }]);
    mockFindWorkspacePath.mockReturnValue("/tmp/workspace-1");
    mockGetWorkspaceDemoPageFiles.mockReturnValue({ sandboxHtml: validHtml, htmlImportMeta: validMeta });
    mockNormalizeHtmlImport.mockReturnValue({
      analysis: { analysisVersion: 1, sourceHash: validMeta.normalizedHash, outcome: { status: "accepted", runtimeType: "sandboxed-html" } },
      normalizedHash: validMeta.normalizedHash,
    });
    mockResolveHtmlSandboxPublicOrigin.mockReturnValue("http://127.0.0.1:4200");
  });

  it("requires authentication and a matching session", async () => {
    mockGetAuthCookie.mockResolvedValue(null as never);
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    expect(response.status).toBe(401);

    mockGetAuthCookie.mockResolvedValue("token");
    mockGetSessionMeta.mockReturnValue({
      ...mockGetSessionMeta(),
      demoId: "other-project",
    });
    const mismatch = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    expect(mismatch.status).toBe(400);
  });

  it("issues an opaque URL and never places HTML source in it", async () => {
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    const body = await response.json();
    // eslint-disable-next-line no-console

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        executionUrl: `http://127.0.0.1:4200/api/html-sandbox/executions/${"a".repeat(32)}`,
        channelId: "b".repeat(32),
        expiresAt: 301_000,
        sandboxPolicyVersion: 1,
      },
    });
    expect(body.data.executionUrl).not.toContain(validHtml);
    expect(mockCreateHtmlSandboxExecution).toHaveBeenCalledWith(
      validHtml,
      expect.any(Number),
      expect.objectContaining({ projectId: "project-1", sessionId: "session-1", workspaceId: "workspace-1", pageId: "page-1" }),
    );
  });

  it.each([
    ["runtime mismatch", () => mockListDemoPages.mockReturnValue([{ id: "page-1", runtimeType: "prototype-html-css" }])],
    ["analysis outcome mismatch", () => mockNormalizeHtmlImport.mockReturnValue({ analysis: { analysisVersion: 1, sourceHash: validMeta.normalizedHash, outcome: { status: "rejected", code: "INTERACTIVE_NOT_YET_SUPPORTED" } }, normalizedHash: validMeta.normalizedHash })],
    ["analysis version mismatch", () => mockNormalizeHtmlImport.mockReturnValue({ analysis: { analysisVersion: 99, sourceHash: validMeta.normalizedHash, outcome: { status: "accepted", runtimeType: "sandboxed-html" } }, normalizedHash: validMeta.normalizedHash })],
    ["normalized hash mismatch", () => mockNormalizeHtmlImport.mockReturnValue({ analysis: { analysisVersion: 1, sourceHash: "3".repeat(64), outcome: { status: "accepted", runtimeType: "sandboxed-html" } }, normalizedHash: "3".repeat(64) })],
    ["malformed source hash", () => mockGetWorkspaceDemoPageFiles.mockReturnValue({ sandboxHtml: validHtml, htmlImportMeta: { ...validMeta, sourceHash: "not-a-hash" } })],
    ["metadata policy mismatch", () => mockGetWorkspaceDemoPageFiles.mockReturnValue({ sandboxHtml: validHtml, htmlImportMeta: { ...validMeta, sandboxPolicyVersion: 99 } })],
  ])("rejects %s before issuing execution", async (_label, configure) => {
    configure();
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockCreateHtmlSandboxExecution).not.toHaveBeenCalled();
  });

  it("accepts a valid source hash that differs from normalized source", async () => {
    mockGetWorkspaceDemoPageFiles.mockReturnValue({
      sandboxHtml: validHtml,
      htmlImportMeta: { ...validMeta, sourceHash: "9".repeat(64) },
    });
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    expect(response.status).toBe(200);
    expect(mockCreateHtmlSandboxExecution).toHaveBeenCalledWith(
      validHtml,
      expect.any(Number),
      expect.objectContaining({ projectId: "project-1", sessionId: "session-1", workspaceId: "workspace-1", pageId: "page-1" }),
    );
  });

  it("fails closed when the independent public origin is unavailable", async () => {
    mockResolveHtmlSandboxPublicOrigin.mockReturnValue(null as never);
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ projectId: "project-1", demoId: "page-1" }),
    });
    expect(response.status).toBe(503);
    expect(mockCreateHtmlSandboxExecution).not.toHaveBeenCalled();
  });
});
