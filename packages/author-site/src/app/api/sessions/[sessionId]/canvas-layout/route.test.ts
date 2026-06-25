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
});
