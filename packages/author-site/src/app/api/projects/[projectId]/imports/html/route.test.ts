import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

const commitWorkspaceMutation = jest.fn();
const stageCommit = jest.fn();
const stageDiscard = jest.fn();
const normalizeHtmlImport = jest.fn();
const stageHtmlImportBranch = jest.fn();
const validateHtmlImportPrototypeCandidate = jest.fn(() => ({ ok: true, reasonCodes: [] }));

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));
jest.mock("@/lib/workspace-authority-client", () => {
  class MockError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) { super(message); }
  }
  return { commitWorkspaceMutation, WorkspaceAuthorityClientError: MockError };
});
jest.mock("@workbench/project-core", () => ({
  normalizeHtmlImport,
  stageHtmlImportBranch,
  validateHtmlImportPrototypeCandidate,
  HtmlImportError: class HtmlImportError extends Error {
    readonly code: string;
    constructor(code: string, message = code) { super(message); this.code = code; }
  },
}));
jest.mock("@/lib/live-workspace-route-context", () => ({ isLiveWorkspacePath: jest.fn(() => true) }));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({ success: false, error: { code, message: message ?? code, details } })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  findWorkspacePath: jest.fn(),
  generateDemoPageId: jest.fn(() => "imported-page"),
  generateRouteKey: jest.fn(() => "imported-page"),
  getSessionMeta: jest.fn(() => ({ demoId: "project-1", userId: "user-1", workspaceId: "workspace-1", expiresAt: Date.now() + 10000 })),
  isSessionExpired: jest.fn(() => false),
  listDemoPages: jest.fn(() => [{ id: "existing", name: "Existing", routeKey: "existing", order: 0, parentId: null }]),
  projectExists: jest.fn(() => true),
  readFoldersMeta: jest.fn(() => []),
  sessionExists: jest.fn(() => true),
}));

function request(body: unknown): NextRequest { return { json: async () => body } as unknown as NextRequest; }
const accepted = (html = "<main>Hello</main>") => ({
  analysis: { analysisVersion: 1, outcome: { status: "accepted", runtimeType: "prototype-html-css" }, signals: [], unsupportedCapabilities: [], resourceReferences: [], warnings: [], sourceHash: "hash" },
  normalizedHtml: html,
});

describe("POST /imports/html", () => {
  let workspacePath: string;
  beforeEach(async () => {
    jest.clearAllMocks();
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-route-"));
    fs.mkdirSync(path.join(workspacePath, "demos"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({ scope: "live", status: "active" }));
    fs.writeFileSync(path.join(workspacePath, "workspace-tree.json"), JSON.stringify({ folders: [], pages: [{ id: "existing", name: "Existing", routeKey: "existing", order: 0, parentId: null }] }, null, 2) + "\n");
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
    normalizeHtmlImport.mockReturnValue(accepted());
    stageHtmlImportBranch.mockReturnValue({ analysis: accepted().analysis, normalizedHtml: "<main>Hello</main>", stagingPath: "stage", commit: stageCommit, discard: stageDiscard });
  });
  afterEach(() => fs.rmSync(workspacePath, { recursive: true, force: true }));

  it("requires an authenticated owner session", async () => {
    const auth = await import("@/lib/auth/jwt");
    jest.mocked(auth.getAuthCookie).mockResolvedValueOnce(null as never);
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", html: "<main/>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(401);
  });

  it("rejects a session owned by another user", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.getSessionMeta).mockReturnValueOnce({
      demoId: "project-1", userId: "other-user", workspaceId: "workspace-1", expiresAt: Date.now() + 10000,
    } as never);
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", html: "<main/>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(403);
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });

  it("commits live page files and tree in one mutation", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", filename: "landing.html", html: "<main>Hello</main>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(201);
    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
    const mutation = commitWorkspaceMutation.mock.calls[0][0];
    expect(mutation.operations).toHaveLength(5);
    expect(mutation.operations.map((item: { path: string }) => item.path)).toEqual([
      "demos/imported-page/prototype.html", "demos/imported-page/prototype.css", "demos/imported-page/prototype.meta.json", "demos/imported-page/config.schema.json", "workspace-tree.json",
    ]);
    expect(mutation.operations[2].content).toContain('"generatedBy": "html-import"');
    expect(mutation.operations[4].content.endsWith("\n")).toBe(true);
  });

  it("stages and commits branch workspaces", async () => {
    const context = await import("@/lib/live-workspace-route-context");
    jest.mocked(context.isLiveWorkspacePath).mockReturnValueOnce(false);
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", filename: "branch.html", html: "<main/>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(201);
    expect(stageHtmlImportBranch).toHaveBeenCalledTimes(1);
    expect(stageCommit).toHaveBeenCalledTimes(1);
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });

  it("commits interactive HTML as sandbox files without prototype downgrade", async () => {
    normalizeHtmlImport.mockReturnValueOnce({ analysis: { ...accepted().analysis, outcome: { status: "accepted", runtimeType: "sandboxed-html" } }, normalizedHtml: "<script>1</script>", normalizedHash: "normalized" });
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", html: "<script>1</script>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(201);
    const mutation = commitWorkspaceMutation.mock.calls[0][0];
    expect(mutation.operations.map((item: { path: string }) => item.path)).toEqual([
      "demos/imported-page/sandbox.html",
      "demos/imported-page/html-import.meta.json",
      "demos/imported-page/config.schema.json",
      "workspace-tree.json",
    ]);
    expect(mutation.operations[1].content).toContain('"sandboxPolicyVersion": 1');
    expect(mutation.operations[3].content).toContain('"runtimeType": "sandboxed-html"');
    expect(stageHtmlImportBranch).not.toHaveBeenCalled();
  });

  it("passes analyzer rejection code through", async () => {
    normalizeHtmlImport.mockReturnValueOnce({ analysis: { ...accepted().analysis, outcome: { status: "rejected", code: "HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED" } } });
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", html: "<img src='x.png'>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED");
  });

  it("does not retry an Authority failure as a second mutation", async () => {
    commitWorkspaceMutation.mockRejectedValueOnce(new Error("authority failed"));
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", html: "<main/>" }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(500);
    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
  });
});
