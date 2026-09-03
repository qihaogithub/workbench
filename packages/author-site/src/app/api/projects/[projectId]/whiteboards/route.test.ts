import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
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
  listDemoPages: jest.fn(() => [{ id: "闯关活动页-进行中_ec853d", name: "闯关活动页（进行中）", order: 0 }]),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/image-store", () => ({
  getImageInfo: jest.fn(),
}));

jest.mock("@workbench/whiteboard-core", () => ({
  validateWhiteboardDocument: jest.fn(() => ({ valid: true, diagnostics: [] })),
}));

function request(pageId: string): NextRequest {
  const searchParams = new URLSearchParams({
    sessionId: "session-1",
    scope: "page",
    pageId,
    fieldPath: "image",
  });
  return { nextUrl: { searchParams } } as unknown as NextRequest;
}

describe("whiteboard read route page targets", () => {
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-read-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const pageDir = path.join(workspacePath, "demos", "闯关活动页-进行中_ec853d");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.tsx"), "export default function Page() { return null; }", "utf8");
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), JSON.stringify({
      type: "object",
      properties: { image: { type: "string", format: "image" } },
    }), "utf8");
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads an unbound target with a Unicode page id", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("闯关活动页-进行中_ec853d"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { binding: null, document: null },
    });
  });

  it("reopens a bound document targeting a Unicode page id", async () => {
    const whiteboardDir = path.join(workspacePath, "whiteboards");
    fs.mkdirSync(whiteboardDir, { recursive: true });
    fs.writeFileSync(path.join(whiteboardDir, "bindings.json"), JSON.stringify({
      bindings: [{
        id: "binding_unicode",
        target: {
          scope: "page",
          pageId: "闯关活动页-进行中_ec853d",
          fieldPath: ["image"],
        },
        whiteboardId: "wb_unicode",
        documentRevisionAtOutput: 1,
        documentVersion: 3,
        outputAssetHash: "a".repeat(64),
        updatedAt: 1,
      }],
    }), "utf8");
    fs.writeFileSync(path.join(whiteboardDir, "wb_unicode.json"), JSON.stringify({
      id: "wb_unicode",
      version: 3,
      sceneFormat: "sketch-scene-v1",
      documentRevision: 1,
      scene: { version: 1, pageSize: { width: 100, height: 100 }, nodes: [] },
      nodeSemantics: {},
      editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
      updatedAt: 1,
    }), "utf8");

    const { GET } = await import("./route");
    const response = await GET(request("闯关活动页-进行中_ec853d"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        binding: { target: { pageId: "闯关活动页-进行中_ec853d" } },
        document: { id: "wb_unicode", documentRevision: 1 },
      },
    });
  });

  it("rejects unsafe and missing page ids before reading a schema", async () => {
    const { GET } = await import("./route");
    const unsafe = await GET(request("../other"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(unsafe.status).toBe(400);

    const missing = await GET(request("page-not-found"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(missing.status).toBe(400);
  });
});
