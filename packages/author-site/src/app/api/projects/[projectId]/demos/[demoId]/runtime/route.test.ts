import fs from "fs";
import os from "os";
import path from "path";

import type { NextRequest } from "next/server";
import type { WorkspaceMutationRequest } from "@workbench/shared/contracts";

const commitWorkspaceMutation = jest.fn(async (_request: WorkspaceMutationRequest) => ({
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

const updateWorkspaceDemoFiles = jest.fn(() => true);
const writeDemoPageMeta = jest.fn();
const validateDemoPageFilesRuntime = jest.fn(() => ({ ok: true, issues: [] }));

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

jest.mock("@/lib/workspace-authority-client", () => ({
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError: MockWorkspaceAuthorityClientError,
}));

jest.mock("@/lib/authoring-feature-flags", () => ({
  isSketchSceneAuthoringEnabled: jest.fn(() => true),
}));

jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: jest.fn(() => ({
    validateDemoPageFilesRuntime,
  })),
}));

jest.mock("@/lib/schema-validator", () => ({
  validateNoSchemaConflictFromStrings: jest.fn(() => ({ ok: true })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  findWorkspacePath: jest.fn(),
  getDemoDirPath: jest.fn((workspacePath: string, demoId: string) => path.join(workspacePath, "demos", demoId)),
  getProjectConfigSchema: jest.fn(() => "{}"),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
  getWorkspaceDemoPageFiles: jest.fn(),
  isSessionExpired: jest.fn(() => false),
  listDemoPages: jest.fn(() => [{
    id: "page-1",
    name: "首页",
    routeKey: "home",
    order: 0,
    parentId: null,
  }]),
  projectExists: jest.fn(() => true),
  readDemoPageMeta: jest.fn(() => ({
    id: "page-1",
    name: "首页",
    routeKey: "home",
    order: 0,
    parentId: null,
  })),
  sessionExists: jest.fn(() => true),
  updateWorkspaceDemoFiles,
  writeDemoPageMeta,
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
    url: "http://localhost/api/projects/project-1/demos/page-1/runtime",
    clone: () => ({ json: async () => body }),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("demo runtime route live Workspace writes", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-runtime-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const demoDir = path.join(workspacePath, "demos", "page-1");
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({
      workspaceId: "workspace-1",
      projectId: "project-1",
      scope: "live",
      status: "active",
    }, null, 2), "utf-8");
    fs.writeFileSync(path.join(workspacePath, "workspace-tree.json"), JSON.stringify({
      folders: [],
      pages: [{
        id: "page-1",
        name: "首页",
        routeKey: "home",
        order: 0,
        parentId: null,
      }],
    }, null, 2), "utf-8");
    fs.writeFileSync(path.join(demoDir, "index.tsx"), "old react", "utf-8");
    fs.writeFileSync(path.join(demoDir, "prototype.html"), "<main>old</main>", "utf-8");
    fs.writeFileSync(path.join(demoDir, "prototype.css"), ".old {}", "utf-8");
    fs.writeFileSync(path.join(demoDir, "prototype.meta.json"), "{\"source\":\"old\"}", "utf-8");
    fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{\"type\":\"object\"}", "utf-8");

    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
    jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
      code: "old react",
      schema: "{\"type\":\"object\"}",
      prototypeHtml: "<main>old</main>",
      prototypeCss: ".old {}",
      prototypeMeta: { source: "old" },
      sketchScene: "{\"version\":1,\"pageSize\":{\"width\":800,\"height\":600},\"nodes\":[]}",
      sketchMeta: {},
    });
  });

  afterEach(() => {
    global.Response = originalResponse;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("live Workspace 切换运行时通过 Authority 一次性提交页面文件和 workspace-tree", async () => {
    const { PUT } = await import("./route");

    const response = await PUT(
      createRequest({
        sessionId: "session-1",
        targetRuntimeType: "prototype-html-css",
        prototypeHtml: "<main>new</main>",
        prototypeCss: ".new {}",
        prototypeMeta: { source: "switch" },
      }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        meta: {
          id: "page-1",
          runtimeType: "prototype-html-css",
        },
      },
    });
    expect(updateWorkspaceDemoFiles).not.toHaveBeenCalled();
    expect(writeDemoPageMeta).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "switch_demo_page_runtime",
      }),
    );
    const mutation = commitWorkspaceMutation.mock.calls[0]?.[0];
    expect(mutation?.operations).toEqual([
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/prototype.html",
        content: "<main>new</main>",
      }),
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/prototype.css",
        content: ".new {}",
      }),
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/prototype.meta.json",
        content: JSON.stringify({ source: "switch" }, null, 2),
      }),
      expect.objectContaining({
        type: "put_text",
        path: "workspace-tree.json",
      }),
    ]);
    const treeOperation = mutation?.operations?.[3];
    expect(treeOperation?.type).toBe("put_text");
    if (treeOperation?.type !== "put_text") {
      throw new Error("Expected workspace-tree put_text operation");
    }
    expect(JSON.parse(treeOperation.content)).toMatchObject({
      pages: [{
        id: "page-1",
        runtimeType: "prototype-html-css",
      }],
    });
    expect(fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf-8")).not.toContain("prototype-html-css");
    expect(fs.readFileSync(path.join(workspacePath, "demos", "page-1", "prototype.html"), "utf-8")).toBe("<main>old</main>");
  });
});
