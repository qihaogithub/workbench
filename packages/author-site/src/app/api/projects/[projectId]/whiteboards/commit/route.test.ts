import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

const writeWhiteboardTransaction = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1", username: "测试用户" })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  findWorkspacePath: jest.fn(),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    expiresAt: Date.now() + 10_000,
  })),
  isSessionExpired: jest.fn(() => false),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/live-workspace-route-context", () => ({
  isLiveWorkspacePath: jest.fn(() => false),
}));

jest.mock("@/lib/image-store", () => ({
  getImageInfo: jest.fn(() => undefined),
}));

jest.mock("@/lib/workspace-authority-client", () => ({
  commitWorkspaceMutation: jest.fn(),
  getWorkspaceAuthorityState: jest.fn(),
  stageWorkspaceBinary: jest.fn(),
  WorkspaceAuthorityClientError: class WorkspaceAuthorityClientError extends Error {},
}));

jest.mock("@workbench/project-core", () => ({
  hashWorkspaceContent: (content: Buffer) => crypto.createHash("sha256").update(content).digest("hex"),
  planWhiteboardGarbageCollection: jest.fn(() => ({})),
  WhiteboardTransactionConflictError: class WhiteboardTransactionConflictError extends Error {},
  whiteboardGcPathsToDelete: jest.fn(() => []),
  writeWhiteboardTransaction,
}));

function jsonRequest(body: unknown): NextRequest {
  return { json: async () => body } as NextRequest;
}

function whiteboardDocument() {
  return {
    id: "wb_test",
    version: 2,
    documentRevision: 0,
    scene: {
      version: 1,
      pageSize: { width: 100, height: 100 },
      nodes: [],
      assets: [],
      bindings: {},
      metadata: {},
    },
    nodeSemantics: {},
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt: 1,
  };
}

function commitBody(currentValue: string) {
  return {
    sessionId: "session-1",
    target: {
      scope: "page",
      pageId: "page-1",
      fieldPath: "heroImage",
      currentValue,
    },
    document: whiteboardDocument(),
    baseDocumentRevision: null,
    pngBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
  };
}

describe("whiteboard commit route config defaults", () => {
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-commit-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSchema(defaultValue: string) {
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "config.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          heroImage: { type: "string", format: "image", default: defaultValue },
        },
      }),
      "utf8",
    );
  }

  it("uses the Schema default when the page has no config values file", async () => {
    writeSchema("/api/images/original");
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest(commitBody("/api/images/original")),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { values: { heroImage: expect.stringMatching(/^assets\/whiteboards\/.+\.png$/) } },
    });
    expect(writeWhiteboardTransaction).toHaveBeenCalledWith(
      workspacePath,
      expect.objectContaining({
        writes: expect.arrayContaining([
          expect.objectContaining({
            path: "demos/page-1/config.values.json",
            content: expect.stringContaining('"heroImage"'),
          }),
        ]),
      }),
    );
  });

  it("keeps the conflict guard when the Schema default changed", async () => {
    writeSchema("/api/images/changed");
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest(commitBody("/api/images/original")),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { message: "图片字段已被其他编辑者替换，请刷新后重试" },
    });
    expect(writeWhiteboardTransaction).not.toHaveBeenCalled();
  });
});
