import fs from "fs";
import os from "os";
import path from "path";

import type { NextRequest } from "next/server";

const commitWorkspaceMutation = jest.fn(async () => ({
  committed: true,
  mutationId: "mutation-test",
  projectId: "project-1",
  workspaceId: "workspace-1",
  baseRevision: 0,
  revision: 2,
  rootHash: "root-hash",
  actor: "author-site",
  resources: [],
  committedAt: Date.now(),
}));

const createWorkspaceDemoPage = jest.fn();
const copyWorkspaceDemoPage = jest.fn();

class MockWorkspaceAuthorityClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/authoring-feature-flags", () => ({
  isSketchSceneAuthoringEnabled: jest.fn(() => true),
}));

jest.mock("@/lib/workspace-authority-client", () => ({
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError: MockWorkspaceAuthorityClientError,
}));

jest.mock("@/lib/fs-utils", () => ({
  DEFAULT_DEMO_CODE: "export default function Demo() { return <div />; }\n",
  DEFAULT_DEMO_SCHEMA: '{\n  "type": "object"\n}',
  copyWorkspaceDemoPage,
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  createWorkspaceDemoPage,
  findWorkspacePath: jest.fn(),
  generateDemoPageId: jest.fn(() => "new-page_abcd"),
  generateRouteKey: jest.fn(() => "new-page"),
  getDemoDirPath: jest.fn((workspacePath: string, demoId: string) => path.join(workspacePath, "demos", demoId)),
  getProjectPath: jest.fn(() => "/tmp/project-1"),
  isSessionExpired: jest.fn(() => false),
  listDemoPages: jest.fn(() => []),
  projectExists: jest.fn(() => true),
  readFoldersMeta: jest.fn(() => []),
  resolvePageRuntimeType: jest.fn(() => "prototype-html-css" as const),
  sessionExists: jest.fn(() => true),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
}));

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

function createRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

describe("project demos route live Workspace writes", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-demos-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, ".workspace.json"),
      JSON.stringify({ workspaceId: "workspace-1", scope: "live", status: "active" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "workspace-tree.json"),
      JSON.stringify({
        folders: [],
        pages: [{
          id: "page-1",
          name: "首页",
          routeKey: "home",
          order: 0,
          parentId: null,
        }],
      }, null, 2),
      "utf-8",
    );
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
  });

  afterEach(() => {
    global.Response = originalResponse;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("live Workspace 新建页面通过 Authority 一次性提交初始文件和 workspace-tree", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      createRequest({
        sessionId: "session-1",
        name: "New Page",
        runtimeType: "prototype-html-css",
      }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "new-page_abcd",
        name: "New Page",
        routeKey: "new-page",
        order: 1,
        parentId: null,
      },
    });
    expect(createWorkspaceDemoPage).not.toHaveBeenCalled();
    expect(copyWorkspaceDemoPage).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, "demos", "new-page_abcd"))).toBe(false);
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "create_demo_page",
        operations: [
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/prototype.html",
            content: "<main></main>",
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/prototype.css",
            content: "",
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/config.schema.json",
            content: '{\n  "type": "object"\n}',
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "workspace-tree.json",
          }),
        ],
      }),
    );
  });

  it("live Workspace 复制页面通过 Authority 一次性提交复制文件和 workspace-tree", async () => {
    fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "prototype.html"),
      "<main>source</main>",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "prototype.css"),
      ".source { color: red; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "config.schema.json"),
      '{"type":"object","title":"source"}',
      "utf-8",
    );
    const { POST } = await import("./route");

    const response = await POST(
      createRequest({
        sessionId: "session-1",
        name: "Copied Page",
        sourcePageId: "page-1",
      }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "new-page_abcd",
        name: "Copied Page",
        routeKey: "new-page",
        order: 1,
        parentId: null,
      },
    });
    expect(createWorkspaceDemoPage).not.toHaveBeenCalled();
    expect(copyWorkspaceDemoPage).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, "demos", "new-page_abcd"))).toBe(false);
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "copy_demo_page",
        operations: [
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/config.schema.json",
            content: '{"type":"object","title":"source"}',
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/prototype.html",
            content: "<main>source</main>",
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "demos/new-page_abcd/prototype.css",
            content: ".source { color: red; }",
            expectedAbsent: true,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "workspace-tree.json",
          }),
        ],
      }),
    );
  });
});
