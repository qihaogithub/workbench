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

const reorderDemoPages = jest.fn();

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
  findWorkspacePath: jest.fn(),
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
  reorderDemoPages,
  sessionExists: jest.fn(() => true),
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
    url: "http://localhost/api/projects/project-1/demo-pages/reorder",
    clone: () => ({ json: async () => body }),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("project demo-pages reorder route live Workspace writes", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-reorder-route-"));
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
        folders: [
          { id: "folder-1", name: "分组", parentId: null, order: 0 },
        ],
        pages: [
          { id: "page-1", name: "页面一", routeKey: "page-1", order: 0, parentId: null },
          { id: "page-2", name: "页面二", routeKey: "page-2", order: 1, parentId: "folder-1" },
        ],
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

  it("live Workspace 批量排序通过 Authority 只提交 workspace-tree", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      createRequest({
        sessionId: "session-1",
        pages: [
          { id: "page-1", order: 1, parentId: "folder-1" },
          { id: "page-2", order: 0, parentId: null },
        ],
        folders: [
          { id: "folder-1", order: 2, parentId: null },
        ],
      }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(reorderDemoPages).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "reorder_demo_pages",
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
      folders: [
        { id: "folder-1", name: "分组", parentId: null, order: 2 },
      ],
      pages: [
        { id: "page-1", name: "页面一", order: 1, parentId: "folder-1" },
        { id: "page-2", name: "页面二", order: 0, parentId: null },
      ],
    });
    expect(fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf-8")).toContain("\"order\": 0");
  });
});
