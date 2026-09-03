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
  listDemoPages: jest.fn(() => [{ id: "page-1", name: "页面 1", order: 0 }]),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/live-workspace-route-context", () => ({
  isLiveWorkspacePath: jest.fn(() => false),
}));

jest.mock("@/lib/image-store", () => ({
  getImageInfo: jest.fn((imageId: string) =>
    imageId === "img_library" ? { mimeType: "image/png" } : undefined,
  ),
  syncWhiteboardImages: jest.fn(),
  detachWhiteboardImages: jest.fn(),
  releaseWhiteboardDraftImages: jest.fn(),
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
    version: 3,
    sceneFormat: "sketch-scene-v1",
    documentRevision: 0,
    scene: {
      version: 1,
      pageSize: { width: 100, height: 100 },
      nodes: [
        {
          id: "diamond",
          type: "diamond",
          x: 10,
          y: 10,
          width: 40,
          height: 30,
          text: "完整场景",
          name: "保留名称",
          path: "M 0 0 L 10 10",
          style: { fill: "#bfdbfe", italic: true, textDecoration: "underline" },
          metadata: { source: "manual" },
        },
        { id: "path", type: "path", x: 10, y: 60, width: 60, height: 10, path: "M 10 65 L 70 65" },
      ],
      assets: [{ id: "library-image", type: "image", src: "/api/images/img_library" }],
      bindings: { title: "heroTitle" },
      metadata: { source: "whiteboard" },
    },
    nodeSemantics: {},
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt: 1,
  };
}

function commitBody(currentValue: string, pageId = "page-1", fieldPath = "heroImage") {
  return {
    sessionId: "session-1",
    target: {
      scope: "page",
      pageId,
      fieldPath,
      currentValue,
    },
    document: whiteboardDocument(),
    baseDocumentRevision: null,
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
    const mutation = writeWhiteboardTransaction.mock.calls[0]?.[1] as { writes: Array<{ path: string; content: unknown }> };
    const generatedPng = mutation.writes.find((write) => write.path.startsWith("assets/whiteboards/"))?.content;
    expect(Buffer.isBuffer(generatedPng)).toBe(true);
    expect((generatedPng as Buffer).length).toBeGreaterThan(8);
    expect((generatedPng as Buffer).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(body.data.renderManifest).toEqual([]);
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

  it("does not write anything when a submitted image asset is missing", async () => {
    writeSchema("/api/images/original");
    const document = {
      ...whiteboardDocument(),
      scene: {
        ...whiteboardDocument().scene,
        nodes: [{ id: "missing-image", type: "image", x: 0, y: 0, width: 100, height: 100, src: "/api/images/img_missing" }],
      },
      nodeSemantics: { "missing-image": { assetRef: "img_missing" } },
    };
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({ ...commitBody("/api/images/original"), document }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { message: "图片节点“missing-image”的受管资源缺失或引用不一致" },
    });
    expect(writeWhiteboardTransaction).not.toHaveBeenCalled();
  });

  it("releases newly durable image references when the workspace transaction fails", async () => {
    writeSchema("/api/images/original");
    writeWhiteboardTransaction.mockImplementationOnce(() => {
      throw new Error("simulated transaction failure");
    });
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest(commitBody("/api/images/original")),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();
    const imageStore = await import("@/lib/image-store");

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { message: "白板回填失败，请重试" },
    });
    expect(jest.mocked(imageStore.detachWhiteboardImages)).toHaveBeenCalledWith(["img_library"], "wb_test");
    expect(jest.mocked(imageStore.releaseWhiteboardDraftImages)).toHaveBeenCalledWith("wb_test");
  });

  it("rejects client-provided PNG bytes", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({ ...commitBody("/api/images/original"), pngBase64: "not-trusted" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(writeWhiteboardTransaction).not.toHaveBeenCalled();
  });

  it("commits an image target on a Unicode page through a oneOf schema", async () => {
    const pageId = "闯关活动页-进行中_ec853d";
    const pageDir = path.join(workspacePath, "demos", pageId);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.tsx"), "export default function Page() { return null; }", "utf8");
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            oneOf: [
              {
                properties: {
                  type: { const: "image" },
                  image: { type: "string", format: "image" },
                },
                required: ["type", "image"],
              },
              {
                properties: {
                  type: { const: "text" },
                  text: { type: "string" },
                },
                required: ["type"],
              },
            ],
          },
        },
      },
    }), "utf8");
    fs.writeFileSync(path.join(pageDir, "config.values.json"), JSON.stringify({
      modules: [{ type: "image", image: "/original.png" }],
    }), "utf8");
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.listDemoPages).mockReturnValue([{
      id: pageId,
      name: "闯关活动页（进行中）",
      order: 0,
      parentId: null,
      runtimeType: "high-fidelity-react",
    }]);

    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        ...commitBody("/original.png", pageId, "modules[0].image"),
        document: whiteboardDocument(),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { values: { modules: [{ type: "image", image: expect.stringMatching(/^assets\/whiteboards\/.+\.png$/) }] } },
    });
    expect(writeWhiteboardTransaction).toHaveBeenCalledWith(
      workspacePath,
      expect.objectContaining({
        writes: expect.arrayContaining([
          expect.objectContaining({ path: `demos/${pageId}/config.values.json` }),
        ]),
      }),
    );
  });
});
