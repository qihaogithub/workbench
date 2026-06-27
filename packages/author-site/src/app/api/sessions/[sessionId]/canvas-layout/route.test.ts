import fs from "fs";
import os from "os";
import path from "path";
import type { CanvasState } from "@opencode-workbench/shared/demo";

class TestResponse {
  status: number;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.body = body ?? null;
    const headers = new Map<string, string>();
    if (init?.headers) {
      for (const [key, value] of Object.entries(
        init.headers as Record<string, string>,
      )) {
        headers.set(key.toLowerCase(), value);
      }
    }
    this.headers = {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    };
    if (body instanceof Uint8Array) {
      this.buffer = Buffer.from(body);
    } else if (typeof body === "string") {
      this.buffer = Buffer.from(body);
    } else {
      this.buffer = Buffer.alloc(0);
    }
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.buffer.toString("utf-8"));
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  }
}

function createJsonRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

function createRequest(): Request {
  return {} as unknown as Request;
}

describe("canvas layout route", () => {
  const originalEnv = { ...process.env };
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-layout-route-"));
    process.env.DATA_DIR = tempDir;
    process.env.PROJECTS_DIR = path.join(tempDir, "projects");
    process.env.SESSIONS_DIR = path.join(tempDir, "sessions");
    process.env.WORKSPACES_DIR = path.join(tempDir, "workspaces");
    process.env.SNAPSHOTS_DIR = path.join(tempDir, "snapshots");
    jest.doMock("@/lib/auth/jwt", () => ({
      getAuthCookie: jest.fn(() => "token"),
      verifyToken: jest.fn(async () => ({
        userId: "user-1",
        username: "测试用户",
      })),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/auth/jwt");
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("保存画布布局时同步写入 workspace，并优先从 workspace 读取", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    const { GET, POST } = await import("./route");

    const project = fsUtils.createProject("画布布局项目");
    const session = await sessionManager.createEditSession(
      "user-1",
      project.id,
    );
    const state: CanvasState = {
      viewport: { x: 120, y: 80, zoom: 0.75 },
      pages: {
        page_1: { x: 10, y: 20, width: 375, height: 812 },
      },
      nodes: {
        "doc-kb_1": {
          id: "doc-kb_1",
          kind: "document",
          title: "活动规则",
          knowledgeDocument: {
            id: "kb_1",
            title: "活动规则",
            fileName: "活动规则.md",
            description: "活动规则",
          },
          collapsed: true,
          expandedHeight: 360,
          layout: { x: 440, y: 20, width: 420, height: 360 },
          createdAt: 1,
          updatedAt: 1,
        },
        "img-1": {
          id: "img-1",
          kind: "image",
          title: "hero.png",
          src: "data:image/png;base64,aGVybw==",
          fileName: "hero.png",
          intrinsicWidth: 800,
          intrinsicHeight: 600,
          layout: { x: 900, y: 20, width: 320, height: 240 },
          createdAt: 2,
          updatedAt: 2,
        },
        "text-1": {
          id: "text-1",
          kind: "text",
          title: "说明文字",
          text: "说明文字",
          fontSize: 18,
          color: "#111827",
          backgroundColor: "#ffffff",
          layout: { x: 40, y: 900, width: 240, height: 120 },
          createdAt: 3,
          updatedAt: 3,
        },
        "arrow-1": {
          id: "arrow-1",
          kind: "arrow",
          title: "箭头",
          color: "#2563eb",
          strokeWidth: 6,
          direction: "right",
          layout: { x: 320, y: 900, width: 240, height: 80 },
          createdAt: 4,
          updatedAt: 4,
        },
        "draw-1": {
          id: "draw-1",
          kind: "drawing",
          title: "画笔",
          points: [
            { x: 10, y: 12 },
            { x: 48, y: 56 },
            { x: 90, y: 88 },
          ],
          color: "#111827",
          strokeWidth: 4,
          layout: { x: 600, y: 900, width: 180, height: 120 },
          createdAt: 5,
          updatedAt: 5,
        },
      },
      hiddenKnowledgeDocumentIds: ["kb_hidden"],
    };

    const response = await POST(
      createJsonRequest({ projectId: project.id, version: 1, state }),
      { params: { sessionId: session.sessionId } },
    );

    expect(response.status).toBe(200);

    const sessionPath = fsUtils.getSessionPath(session.sessionId);
    const workspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    expect(sessionPath).toBeTruthy();
    expect(workspacePath).toBeTruthy();

    const sessionLayoutPath = path.join(sessionPath!, ".canvas-layout.json");
    const workspaceLayoutPath = path.join(
      workspacePath!,
      ".canvas-layout.json",
    );
    expect(fs.existsSync(sessionLayoutPath)).toBe(true);
    expect(fs.existsSync(workspaceLayoutPath)).toBe(true);

    fs.rmSync(sessionLayoutPath);

    const getResponse = await GET(
      createRequest(),
      { params: { sessionId: session.sessionId } },
    );
    const body = (await getResponse.json()) as {
      success: boolean;
      data: { state: CanvasState | null };
    };

    expect(body.success).toBe(true);
    expect(body.data.state).toEqual(state);
  });

  it("保存非法自由节点时返回无效请求", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    const { POST } = await import("./route");

    const project = fsUtils.createProject("非法画布布局项目");
    const session = await sessionManager.createEditSession(
      "user-1",
      project.id,
    );
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: {},
      nodes: {
        "draw-1": {
          id: "draw-1",
          kind: "drawing",
          title: "画笔",
          points: [{ x: 10, y: 10 }],
          color: "#111827",
          strokeWidth: 4,
          layout: { x: 0, y: 0, width: 120, height: 80 },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    };

    const response = await POST(
      createJsonRequest({ projectId: project.id, version: 1, state }),
      { params: { sessionId: session.sessionId } },
    );

    expect(response.status).toBe(400);
  });
});
