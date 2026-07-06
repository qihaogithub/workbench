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
  } as NextRequest;
}

describe("resource version detail route", () => {
  const originalResponse = global.Response;
  const restorePageVersion = jest.fn();
  const flushAndSyncProjectWorkspace = jest.fn();
  const updateWorkspaceDemoFiles = jest.fn();
  const markWorkspaceBasedOnVersion = jest.fn();
  const syncActiveWorkspaceToCanonical = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;

    restorePageVersion.mockReturnValue({
      ok: true,
      data: {
        success: true,
        newVersionId: "v2",
        restoredAt: 1,
        files: {
          code: "export default function Demo(){ return <div>restored</div>; }",
          schema: "{}",
        },
      },
    });
    flushAndSyncProjectWorkspace.mockResolvedValue({
      status: "no_active_room",
      flushedRooms: 0,
      workspacePath: "/tmp/project/workspace",
    });
    updateWorkspaceDemoFiles.mockReturnValue(true);
    markWorkspaceBasedOnVersion.mockReturnValue(true);
    syncActiveWorkspaceToCanonical.mockReturnValue({
      success: true,
      workspacePath: "/tmp/project/workspace",
    });

    jest.doMock("@workbench/project-core", () => ({
      ProjectAdminService: jest.fn(() => ({
        restorePageVersion,
        resourceRestore: jest.fn(),
        resourceVersionGet: jest.fn(),
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
      getDataDir: jest.fn(() => "/tmp/data"),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "stale-workspace",
        expiresAt: Date.now() + 10000,
      })),
      getWorkspaceMeta: jest.fn(() => ({
        workspaceId: "live-workspace",
        projectId: "project-1",
        demoId: "project-1",
        scope: "live",
        status: "active",
        baseVersion: "v2",
        createdAt: 1,
        updatedAt: 2,
      })),
      isSessionExpired: jest.fn(() => false),
      markWorkspaceBasedOnVersion,
      sessionExists: jest.fn(() => true),
      updateWorkspaceDemoFiles,
    }));
    jest.doMock("@/lib/workspace-flush", () => ({
      flushAndSyncProjectWorkspace,
      getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
        code: "WORKSPACE_STALE",
        message: error instanceof Error ? error.message : "当前工作区已过期，请刷新项目后重试",
        status: 409,
      })),
    }));
    jest.doMock("@/lib/workspace-manager", () => ({
      syncActiveWorkspaceToCanonical,
    }));
  });

  afterEach(() => {
    jest.dontMock("@workbench/project-core");
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/workspace-flush");
    jest.dontMock("@/lib/workspace-manager");
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("恢复页面版本时优先使用请求中的当前 workspaceId", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ sessionId: "session-1", workspaceId: "live-workspace" }),
      {
        params: {
          projectId: "project-1",
          kind: "page",
          resourceId: "page-1",
          versionId: "prv_1",
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({ newVersionId: "v2" }),
    });
    expect(flushAndSyncProjectWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "live-workspace",
      sessionId: "session-1",
    });
    expect(updateWorkspaceDemoFiles).toHaveBeenCalledWith(
      "live-workspace",
      "page-1",
      expect.objectContaining({ schema: "{}" }),
    );
    expect(markWorkspaceBasedOnVersion).toHaveBeenCalledWith(
      "live-workspace",
      "v2",
    );
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith(
      "project-1",
      "live-workspace",
    );
  });
});
