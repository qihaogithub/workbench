import type { NextRequest } from "next/server";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string) => ({
    success: false,
    error: { code, message: message || code },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  findWorkspacePath: jest.fn(() => "/tmp/live-workspace"),
  getProjectConfigValues: jest.fn(() => undefined),
  getProjectPath: jest.fn(() => "/tmp/project"),
  getWorkspaceMeta: jest.fn(() => ({
    workspaceId: "workspace-1",
    demoId: "project-1",
    userId: "user-1",
    createdAt: 1,
    updatedAt: 2,
  })),
  readProjectMeta: jest.fn(() => ({
    id: "project-1",
    name: "测试项目",
    activeWorkspaceId: undefined,
    activeWorkspaceUpdatedAt: undefined,
    canonicalSyncedWorkspaceId: undefined,
    canonicalSyncedAt: undefined,
  })),
  saveProjectConfigValues: jest.fn(),
  writeProjectMeta: jest.fn(),
}));

jest.mock("@/lib/session-manager", () => ({
  createEditSession: jest.fn(async () => ({
    sessionId: "session-resumed",
    workspaceId: "workspace-1",
    code: "",
    schema: "",
    tempWorkspace: "",
    demos: { demos: {}, projectConfigSchema: undefined },
  })),
  getEditSession: jest.fn((sessionId: string) => {
    if (sessionId !== "session-resumed") return null;
    return {
      sessionId,
      demoId: "project-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      status: "editing",
      basedOnVersion: "v0",
      createdAt: 1,
      expiresAt: Date.now() + 1000,
      code: "",
      schema: "",
      workspacePath: "",
      demos: { demos: {}, projectConfigSchema: undefined },
    };
  }),
}));

jest.mock("@/lib/workspace-flush", () => ({
  flushAndSyncProjectWorkspace: jest.fn(async () => ({
    status: "no_active_room",
    flushedRooms: 0,
    revision: 6,
    workspacePath: "/tmp/project-1/workspace",
    canonicalRevision: 6,
    canonicalRootHash: "root-hash-6",
  })),
  getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
    code: "AGENT_SERVICE_ERROR",
    message: error instanceof Error ? error.message : "协同草稿同步失败",
    status: 502,
  })),
}));

jest.mock("@/lib/publish-manager", () => {
  class MockPublishError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly details?: unknown,
    ) {
      super(message);
      this.name = "PublishError";
    }
  }
  return {
    PublishError: MockPublishError,
    publishProject: jest.fn(async (projectId: string) => ({
      projectId,
      publishedVersion: "v1",
      publishedAt: 100,
      demoCount: 1,
      duration: 10,
    })),
  };
});

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

describe("project publish route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("失效 Session 携带有效 Workspace 时续建 Session 后发布", async () => {
    const { POST } = await import("./route");
    const sessionManager = await import("@/lib/session-manager");
    const workspaceFlush = await import("@/lib/workspace-flush");
    const publishManager = await import("@/lib/publish-manager");

    const response = await POST(
      jsonRequest({ sessionId: "session-missing", workspaceId: "workspace-1" }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        projectId: "project-1",
        publishedVersion: "v1",
        publishedAt: 100,
        demoCount: 1,
        duration: 10,
      },
    });
    expect(sessionManager.createEditSession).toHaveBeenCalledWith(
      "user-1",
      "project-1",
      "workspace-1",
    );
    expect(workspaceFlush.flushAndSyncProjectWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-resumed",
    });
    expect(publishManager.publishProject).toHaveBeenCalledWith("project-1", {
      workspaceId: "workspace-1",
      workspaceRevision: 6,
      workspaceRootHash: "root-hash-6",
    });
  });

  it("发布前 canonical revision/rootHash 缺失时不会创建发布快照", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");
    const publishManager = await import("@/lib/publish-manager");
    jest
      .mocked(workspaceFlush.flushAndSyncProjectWorkspace)
      .mockResolvedValueOnce({
        status: "no_active_room",
        flushedRooms: 0,
        revision: 6,
        workspacePath: "/tmp/project-1/workspace",
      });

    const response = await POST(
      jsonRequest({ sessionId: "session-missing", workspaceId: "workspace-1" }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: {
        code: "WORKSPACE_STALE",
        message: "项目基准工作区尚未绑定 committed revision",
      },
    });
    expect(publishManager.publishProject).not.toHaveBeenCalled();
  });

  it("仅携带失效 Session 且没有 Workspace 时发布已有项目工作区", async () => {
    const { POST } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    const workspaceFlush = await import("@/lib/workspace-flush");
    const publishManager = await import("@/lib/publish-manager");

    const response = await POST(
      jsonRequest({ sessionId: "session-missing" }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        projectId: "project-1",
        publishedVersion: "v1",
        publishedAt: 100,
        demoCount: 1,
        duration: 10,
      },
    });
    expect(fsUtils.getWorkspaceMeta).not.toHaveBeenCalled();
    expect(sessionManager.createEditSession).not.toHaveBeenCalled();
    expect(workspaceFlush.flushAndSyncProjectWorkspace).not.toHaveBeenCalled();
    expect(publishManager.publishProject).toHaveBeenCalledWith("project-1");
  });

  it("activeWorkspaceId 指向已删除 workspace 时自动清理悬空引用并放行发布", async () => {
    const { POST } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const publishManager = await import("@/lib/publish-manager");
    // 悬空场景：project.json 记录的 activeWorkspaceId 已不存在，
    // 且 canonicalSyncedWorkspaceId 与其不一致（旧逻辑会永远 400 死循环）
    jest.mocked(fsUtils.readProjectMeta).mockReturnValueOnce({
      id: "project-1",
      name: "测试项目",
      activeWorkspaceId: "workspace-deleted",
      activeWorkspaceUpdatedAt: 999,
      canonicalSyncedWorkspaceId: "workspace-other",
      canonicalSyncedAt: 1,
    } as unknown as ReturnType<typeof fsUtils.readProjectMeta>);
    jest
      .mocked(fsUtils.getWorkspaceMeta)
      .mockReturnValueOnce(
        null as unknown as ReturnType<typeof fsUtils.getWorkspaceMeta>,
      );

    const response = await POST(jsonRequest({}), {
      params: { projectId: "project-1" },
    });
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fsUtils.writeProjectMeta).toHaveBeenCalledWith(
      "project-1",
      expect.not.objectContaining({ activeWorkspaceId: expect.anything() }),
    );
    expect(publishManager.publishProject).toHaveBeenCalledWith("project-1");
  });

  it("publishProject 抛出 PublishError 时透传 code/message/details", async () => {
    const { POST } = await import("./route");
    const publishManager = await import("@/lib/publish-manager");
    const details = {
      pages: [
        {
          pageId: "demo_x",
          name: "广场页面-平板",
          errors: [{ message: "顶层声明 PadSquare 重复" }],
        },
      ],
    };
    jest.mocked(publishManager.publishProject).mockRejectedValueOnce(
      new publishManager.PublishError(
        "PUBLISH_COMPILE_FAILED",
        "发布失败：1 个页面编译错误",
        details,
      ),
    );

    const response = await POST(jsonRequest({}), {
      params: { projectId: "project-1" },
    });
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string; details?: unknown };
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PUBLISH_COMPILE_FAILED");
  });

  it("发布前不再绕过同步边界补写共享配置运行值到 canonical workspace", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    const liveValues = {
      modalImage: "/api/sessions/session-1/assets/popup.png",
    };
    (
      fsUtils.getProjectConfigValues as jest.MockedFunction<
        typeof fsUtils.getProjectConfigValues
      >
    ).mockImplementation((workspacePath: string) =>
      workspacePath === "/tmp/live-workspace" ? liveValues : undefined,
    );

    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ sessionId: "session-missing", workspaceId: "workspace-1" }),
      { params: { projectId: "project-1" } },
    );

    expect(response.status).toBe(200);
    expect(fsUtils.saveProjectConfigValues).not.toHaveBeenCalled();
  });

  it("无 Session 发布项目工作区时必须已有 canonical revision 和 root hash", async () => {
    const fsUtils = await import("@/lib/fs-utils");
    (
      fsUtils.readProjectMeta as jest.MockedFunction<typeof fsUtils.readProjectMeta>
    ).mockReturnValueOnce({
      id: "project-1",
      name: "测试项目",
      activeWorkspaceId: "workspace-1",
      activeWorkspaceUpdatedAt: 2,
      canonicalSyncedWorkspaceId: "workspace-1",
      canonicalSyncedAt: 3,
    } as ReturnType<typeof fsUtils.readProjectMeta>);
    const { POST } = await import("./route");
    const publishManager = await import("@/lib/publish-manager");

    const response = await POST(
      jsonRequest({}),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "发布前需要同步当前共享工作区",
      },
    });
    expect(publishManager.publishProject).not.toHaveBeenCalled();
  });
});
