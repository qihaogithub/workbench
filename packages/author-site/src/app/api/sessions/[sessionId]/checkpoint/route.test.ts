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
  createProjectVersionSnapshot: jest.fn(() => ({
    success: true,
    version: {
      versionId: "v1",
      savedAt: 100,
    },
  })),
}));

jest.mock("@/lib/session-manager", () => ({
  getEditSession: jest.fn((sessionId: string) => ({
    sessionId,
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    workspacePath: "/tmp/workspace-1",
    status: "editing",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
  syncEditSessionToProjectWorkspace: jest.fn(() => ({
    success: true,
    projectId: "project-1",
    workspacePath: "/tmp/project-1/workspace",
  })),
}));

jest.mock("@/lib/workspace-flush", () => ({
  flushWorkspaceBeforeCriticalAction: jest.fn(async () => ({
    status: "no_active_room",
    flushedRooms: 0,
  })),
  getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
    code: "AGENT_SERVICE_ERROR",
    message: error instanceof Error ? error.message : "协同草稿同步失败",
    status: 502,
  })),
}));

jest.mock("@/lib/preview-validation", () => ({
  validateWorkspacePreviewRuntime: jest.fn(() => ({ ok: true })),
}));

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

describe("session checkpoint route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("创建自动检查点前会先把 Session Workspace 同步到项目当前工作区", async () => {
    const { POST } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");

    const response = await POST(jsonRequest({ note: "停止编辑后自动保存记录" }), {
      params: { sessionId: "session-1" },
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        sessionId: "session-1",
        version: "v1",
        savedAt: 100,
      },
    });
    expect(sessionManager.syncEditSessionToProjectWorkspace).toHaveBeenCalledWith(
      "session-1",
    );
    expect(fsUtils.createProjectVersionSnapshot).toHaveBeenCalledWith(
      "project-1",
      "测试用户",
      {
        sessionId: "session-1",
        note: "停止编辑后自动保存记录",
        type: "auto_checkpoint",
      },
    );
  });

  it("同步项目当前工作区失败时不会创建自动检查点版本", async () => {
    const { POST } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const sessionManager = await import("@/lib/session-manager");
    jest
      .mocked(sessionManager.syncEditSessionToProjectWorkspace)
      .mockReturnValueOnce({
        success: false,
        error: "Workspace source not found",
      });

    const response = await POST(jsonRequest({}), {
      params: { sessionId: "session-1" },
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: "FILE_WRITE_ERROR",
        message: "Workspace source not found",
      },
    });
    expect(fsUtils.createProjectVersionSnapshot).not.toHaveBeenCalled();
  });
});
