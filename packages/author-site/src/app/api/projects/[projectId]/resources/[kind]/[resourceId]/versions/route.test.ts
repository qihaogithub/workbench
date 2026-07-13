import type { NextRequest } from "next/server";

class TestResponse {
  status: number;
  headers: Headers;
  private readonly body: BodyInit | null | undefined;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
    this.body = body;
  }

  async json(): Promise<unknown> {
    if (typeof this.body !== "string") return null;
    return JSON.parse(this.body);
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function jsonRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    nextUrl: new URL("http://localhost/api/projects/project-1/resources/page/page-1/versions"),
  } as NextRequest;
}

describe("resource versions route", () => {
  const originalResponse = global.Response;
  const resourceVersionCreate = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    resourceVersionCreate.mockReturnValue({
      ok: true,
      data: {
        id: "prv_1",
        projectId: "project-1",
        kind: "page",
        resourceId: "page-1",
        contentHash: "hash",
        blobRefs: [],
        metadata: {},
        runtime: { schemaVersion: 1, materializerVersion: "test" },
        createdAt: 1,
        createdBy: "测试用户",
        source: "user",
      },
    });
    jest.doMock("@workbench/project-core", () => ({
      ProjectAdminService: jest.fn(() => ({
        resourceVersionCreate,
        resourceVersionList: jest.fn(),
      })),
    }));
    jest.doMock("@/lib/auth/jwt", () => ({
      getAuthCookie: jest.fn(() => "token"),
      verifyToken: jest.fn(async () => ({
        userId: "user-1",
        username: "测试用户",
      })),
    }));
    jest.doMock("@/lib/fs-utils", () => ({
      createApiError: jest.fn((code: string, message?: string) => ({
        success: false,
        error: { code, message: message || code },
      })),
      createApiSuccess: jest.fn((data: unknown) => ({
        success: true,
        data,
      })),
      findWorkspacePath: jest.fn(() => "/tmp/workspace-1"),
      getDataDir: jest.fn(() => "/tmp/data"),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        expiresAt: Date.now() + 10000,
      })),
      isSessionExpired: jest.fn(() => false),
      sessionExists: jest.fn(() => true),
    }));
    jest.doMock("@/lib/workspace-flush", () => ({
      flushAndSyncProjectWorkspace: jest.fn(async () => ({
        status: "flushed",
        flushedRooms: 1,
        canonicalRevision: 9,
        canonicalRootHash: "root-hash-9",
      })),
      getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
        code: "WORKSPACE_STALE",
        message: error instanceof Error ? error.message : "当前工作区已过期，请刷新项目后重试",
        status: 409,
      })),
    }));
    jest.doMock("@/lib/live-workspace-route-context", () => ({
      isLiveWorkspacePath: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    jest.dontMock("@workbench/project-core");
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/workspace-flush");
    jest.dontMock("@/lib/live-workspace-route-context");
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("创建 live 页面资源版本时先同步 canonical proof 并写入版本", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");

    const response = await POST(
      jsonRequest({
        sessionId: "session-1",
        note: "命名版本",
        sketchPatchSummary: {
          operationCount: 3,
          hasBaseSceneKey: true,
          currentNodeCount: 4,
          targetNodeCount: 5,
        },
      }),
      { params: { projectId: "project-1", kind: "page", resourceId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({ id: "prv_1" }),
    });
    expect(workspaceFlush.flushAndSyncProjectWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    expect(resourceVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        kind: "page",
        resourceId: "page-1",
        sourceWorkspacePath: "/tmp/workspace-1",
        workspaceId: "workspace-1",
        workspaceRevision: 9,
        workspaceRootHash: "root-hash-9",
        note: "命名版本",
        sketchPatchSummary: {
          operationCount: 3,
          hasBaseSceneKey: true,
          currentNodeCount: 4,
          targetNodeCount: 5,
        },
      }),
      expect.objectContaining({
        id: "user-1",
        role: "creator",
      }),
    );
  });

  it("拒绝非法 sketchPatchSummary", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        sessionId: "session-1",
        sketchPatchSummary: {
          operationCount: "3",
          hasBaseSceneKey: true,
        },
      }),
      { params: { projectId: "project-1", kind: "page", resourceId: "page-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "sketchPatchSummary 格式不合法",
      },
    });
    expect(resourceVersionCreate).not.toHaveBeenCalled();
  });
});
