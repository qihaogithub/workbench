import fs from "fs";
import os from "os";
import path from "path";
import { normalizeCanvasStateLayers } from "@workbench/demo-ui";
import type { CanvasState } from "@workbench/demo-ui";

class TestResponse {
  status: number;
  ok: boolean;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
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
  const originalFetch = global.fetch;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    global.fetch = jest.fn(async () => TestResponse.json({
      success: true,
      data: {
        committed: true,
        mutationId: "mutation-test",
        projectId: "project-test",
        workspaceId: "workspace-test",
        baseRevision: 0,
        revision: 2,
        rootHash: "root-hash",
        actor: "author-site",
        resources: [],
        committedAt: Date.now(),
      },
    })) as unknown as typeof fetch;
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
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it("保存画布布局时通过 Authority 提交 live Workspace，并保留 session 恢复缓存", async () => {
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
        page_2: { x: 430, y: 20, width: 375, height: 812 },
      },
      pageGroups: {
        "page-group-1": {
          id: "page-group-1",
          kind: "page-group",
          title: "页面一 等 2 个页面",
          pages: [
            { id: "page_1", pageId: "page_1", title: "页面一" },
            { id: "page_2", pageId: "page_2", title: "页面二" },
          ],
          activePageId: "page_2",
          layout: { x: 10, y: 20, width: 375, height: 812, zIndex: 6 },
          directoryCollapsed: true,
          createdAt: 5,
          updatedAt: 5,
        },
      },
      hiddenPageIds: ["page_1", "page_2"],
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
        "doc-group": {
          id: "doc-group",
          kind: "document",
          title: "活动规则 等 2 个文档",
          documents: [
            {
              id: "kb_1",
              title: "活动规则",
              knowledgeDocument: {
                id: "kb_1",
                title: "活动规则",
                fileName: "活动规则.md",
                description: "活动规则",
              },
            },
            {
              id: "kb_2",
              title: "执行手册",
              knowledgeDocument: {
                id: "kb_2",
                title: "执行手册",
                fileName: "执行手册.md",
              },
            },
          ],
          activeDocumentId: "kb_2",
          layout: { x: 40, y: 420, width: 620, height: 420 },
          createdAt: 4,
          updatedAt: 4,
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
      },
      hiddenKnowledgeDocumentIds: ["kb_hidden"],
    };
    const expectedState = normalizeCanvasStateLayers(state);

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
    expect(fs.existsSync(workspaceLayoutPath)).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${encodeURIComponent(project.id)}/workspaces/${encodeURIComponent(session.workspaceId)}/mutate`),
      expect.objectContaining({ method: "POST" }),
    );

    const getResponse = await GET(
      createRequest(),
      { params: { sessionId: session.sessionId } },
    );
    const body = (await getResponse.json()) as {
      success: boolean;
      data: { state: CanvasState | null };
    };

    expect(body.success).toBe(true);
    expect(body.data.state).toEqual(expectedState);
    expect(body.data.state?.nodes).toEqual(state.nodes);
    expect(body.data.state?.layers?.annotations?.nodes).toEqual(state.nodes);
  });

  it("保存非 live 画布布局时写入 workspace 文件且不调用 Authority", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    const { POST } = await import("./route");

    const project = fsUtils.createProject("非 live 画布布局项目");
    const session = await sessionManager.createEditSession(
      "user-1",
      project.id,
    );
    const workspaceMeta = fsUtils.getWorkspaceMeta(session.workspaceId);
    if (!workspaceMeta) throw new Error("workspace meta missing");
    fsUtils.writeWorkspaceMeta(session.workspaceId, {
      ...workspaceMeta,
      scope: "branch",
      updatedAt: workspaceMeta.updatedAt,
    });

    const state: CanvasState = {
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: {
        page_1: { x: 10, y: 20, width: 375, height: 812 },
      },
      nodes: {},
      hiddenKnowledgeDocumentIds: [],
    };

    const response = await POST(
      createJsonRequest({ projectId: project.id, version: 1, state }),
      { params: { sessionId: session.sessionId } },
    );

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();

    const workspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    const sessionPath = fsUtils.getSessionPath(session.sessionId);
    expect(workspacePath).toBeTruthy();
    expect(sessionPath).toBeTruthy();

    const workspaceLayoutPath = path.join(workspacePath!, ".canvas-layout.json");
    const sessionLayoutPath = path.join(sessionPath!, ".canvas-layout.json");
    expect(fs.existsSync(workspaceLayoutPath)).toBe(true);
    expect(fs.existsSync(sessionLayoutPath)).toBe(true);

    const stored = JSON.parse(fs.readFileSync(workspaceLayoutPath, "utf-8"));
    expect(stored.state).toEqual(normalizeCanvasStateLayers(state));
  });

  it("读取拼接损坏的画布布局时恢复最新有效布局", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    const { GET } = await import("./route");

    const project = fsUtils.createProject("损坏画布布局项目");
    const session = await sessionManager.createEditSession(
      "user-1",
      project.id,
    );
    const oldState: CanvasState = {
      viewport: { x: 1, y: 2, zoom: 0.5 },
      pages: {
        page_old: { x: 10, y: 20, width: 375, height: 812 },
      },
      nodes: {},
      hiddenKnowledgeDocumentIds: [],
    };
    const latestState: CanvasState = {
      viewport: { x: 30, y: 40, zoom: 0.75 },
      pages: {
        page_latest: { x: 50, y: 60, width: 390, height: 844 },
      },
      nodes: {},
      hiddenKnowledgeDocumentIds: [],
    };

    const sessionPath = fsUtils.getSessionPath(session.sessionId);
    const workspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    expect(sessionPath).toBeTruthy();
    expect(workspacePath).toBeTruthy();

    fs.writeFileSync(
      path.join(fsUtils.getProjectPath(project.id), "workspace", ".canvas-layout.json"),
      `${JSON.stringify({
        version: 1,
        projectId: project.id,
        updatedAt: 1,
        state: oldState,
      }, null, 2)}${JSON.stringify({
        version: 1,
        projectId: project.id,
        updatedAt: 2,
        state: latestState,
      }, null, 2)}`,
      "utf-8",
    );
    fs.rmSync(path.join(sessionPath!, ".canvas-layout.json"), { force: true });
    fs.rmSync(path.join(workspacePath!, ".canvas-layout.json"), { force: true });

    const response = await GET(
      createRequest(),
      { params: { sessionId: session.sessionId } },
    );
    const body = (await response.json()) as {
      success: boolean;
      data: { state: CanvasState | null; updatedAt?: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updatedAt).toBe(2);
    expect(body.data.state).toEqual(normalizeCanvasStateLayers(latestState));
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
