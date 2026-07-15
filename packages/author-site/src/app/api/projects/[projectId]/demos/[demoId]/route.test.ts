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

const createDeletedWorkspaceDemoPageSnapshot = jest.fn();
const deleteWorkspaceDemoPage = jest.fn();
const restoreDeletedWorkspaceDemoPageSnapshot = jest.fn();
const writeDemoPageMeta = jest.fn();

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

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  createDeletedWorkspaceDemoPageSnapshot,
  deleteWorkspaceDemoPage,
  findWorkspacePath: jest.fn(),
  getDemoDirPath: jest.fn((workspacePath: string, demoId: string) => path.join(workspacePath, "demos", demoId)),
  getProjectPath: jest.fn(() => "/tmp/project-1"),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
  isSessionExpired: jest.fn(() => false),
  projectExists: jest.fn(() => true),
  readDemoPageMeta: jest.fn(),
  readFoldersMeta: jest.fn(() => []),
  restoreDeletedWorkspaceDemoPageSnapshot,
  sessionExists: jest.fn(() => true),
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
    url: "http://localhost/api/projects/project-1/demos/page-1",
    clone: () => ({ json: async () => body }),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("project demo route live Workspace page metadata writes", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-demo-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "prototype.html"),
      "<main>page</main>",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "prototype.css"),
      ".page { color: red; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "config.schema.json"),
      "{\"type\":\"object\"}",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, ".workspace.json"),
      JSON.stringify({ workspaceId: "workspace-1", scope: "live", status: "active" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "workspace-tree.json"),
      JSON.stringify({
        folders: [{ id: "folder-1", name: "分组", parentId: null, order: 0 }],
        pages: [{
          id: "page-1",
          name: "旧名称",
          routeKey: "old-page",
          order: 0,
          parentId: null,
        }],
      }, null, 2),
      "utf-8",
    );
    const fsUtils = await import("@/lib/fs-utils");
    jest.mocked(fsUtils.findWorkspacePath).mockReturnValue(workspacePath);
    createDeletedWorkspaceDemoPageSnapshot.mockReturnValue({
      snapshotId: "snapshot-1",
      page: {
        id: "page-1",
        name: "旧名称",
        routeKey: "old-page",
        order: 0,
        parentId: null,
      },
    });
  });

  afterEach(() => {
    global.Response = originalResponse;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("live Workspace 更新页面元数据通过 Authority 只提交 workspace-tree", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      createRequest({
        sessionId: "session-1",
        name: "新名称",
        order: 3,
        parentId: "folder-1",
      }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "page-1",
        name: "新名称",
        routeKey: "old-page",
        order: 3,
        parentId: "folder-1",
      },
    });
    expect(writeDemoPageMeta).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "update_demo_page_meta",
        operations: [
          expect.objectContaining({
            type: "put_text",
            path: "workspace-tree.json",
          }),
        ],
      }),
    );
    const mutation = commitWorkspaceMutation.mock.calls[0]?.[0];
    const treeOperation = mutation?.operations?.[0];
    expect(treeOperation?.type).toBe("put_text");
    if (treeOperation?.type !== "put_text") {
      throw new Error("Expected workspace-tree put_text operation");
    }
    expect(JSON.parse(treeOperation.content)).toMatchObject({
      pages: [{
        id: "page-1",
        name: "新名称",
        routeKey: "old-page",
        order: 3,
        parentId: "folder-1",
      }],
    });
    expect(fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf-8")).toContain("旧名称");
  });

  it("live Workspace 删除页面通过 Authority 一次性提交页面文件删除和 workspace-tree", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(
      createRequest({ sessionId: "session-1" }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        snapshotId: "snapshot-1",
        page: { id: "page-1", name: "旧名称" },
      },
    });
    expect(createDeletedWorkspaceDemoPageSnapshot).toHaveBeenCalledWith("workspace-1", "page-1");
    expect(deleteWorkspaceDemoPage).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "delete_demo_page",
      }),
    );
    const mutation = commitWorkspaceMutation.mock.calls[0]?.[0];
    expect(mutation?.operations).toEqual([
      expect.objectContaining({
        type: "delete_path",
        path: "demos/page-1/config.schema.json",
      }),
      expect.objectContaining({
        type: "delete_path",
        path: "demos/page-1/prototype.css",
      }),
      expect.objectContaining({
        type: "delete_path",
        path: "demos/page-1/prototype.html",
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
    expect(JSON.parse(treeOperation.content)).toMatchObject({ pages: [] });
    expect(fs.existsSync(path.join(workspacePath, "demos", "page-1", "prototype.html"))).toBe(false);
    expect(fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf-8")).toContain("旧名称");
  });

  it("live Workspace 恢复删除页面通过 Authority 一次性提交页面文件和 workspace-tree", async () => {
    fs.rmSync(path.join(workspacePath, "demos", "page-1"), { recursive: true, force: true });
    fs.writeFileSync(
      path.join(workspacePath, "workspace-tree.json"),
      JSON.stringify({
        folders: [{ id: "folder-1", name: "分组", parentId: null, order: 0 }],
        pages: [],
      }, null, 2),
      "utf-8",
    );
    const snapshotPath = path.join(workspacePath, ".workbench", "undo", "deleted-pages", "snapshot-1");
    fs.mkdirSync(path.join(snapshotPath, "demos", "page-1"), { recursive: true });
    fs.writeFileSync(
      path.join(snapshotPath, "page.json"),
      JSON.stringify({
        id: "page-1",
        name: "旧名称",
        routeKey: "old-page",
        order: 0,
        parentId: "folder-1",
      }, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(snapshotPath, "demos", "page-1", "prototype.html"),
      "<main>restored</main>",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(snapshotPath, "demos", "page-1", "prototype.css"),
      ".restored { color: green; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(snapshotPath, "demos", "page-1", "config.schema.json"),
      "{\"type\":\"object\",\"title\":\"restored\"}",
      "utf-8",
    );
    const { POST } = await import("./route");

    const response = await POST(
      createRequest({
        sessionId: "session-1",
        action: "restoreDeletedSnapshot",
        snapshotId: "snapshot-1",
      }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "page-1",
        name: "旧名称",
        routeKey: "old-page",
        order: 0,
        parentId: "folder-1",
      },
    });
    expect(restoreDeletedWorkspaceDemoPageSnapshot).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "restore_demo_page",
      }),
    );
    const mutation = commitWorkspaceMutation.mock.calls[0]?.[0];
    expect(mutation?.operations).toEqual([
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/config.schema.json",
        content: "{\"type\":\"object\",\"title\":\"restored\"}",
        expectedAbsent: true,
      }),
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/prototype.css",
        content: ".restored { color: green; }",
        expectedAbsent: true,
      }),
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/prototype.html",
        content: "<main>restored</main>",
        expectedAbsent: true,
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
        name: "旧名称",
        routeKey: "old-page",
        order: 0,
        parentId: "folder-1",
      }],
    });
    expect(fs.existsSync(path.join(workspacePath, "demos", "page-1", "prototype.html"))).toBe(false);
    expect(fs.existsSync(snapshotPath)).toBe(false);
  });
});
