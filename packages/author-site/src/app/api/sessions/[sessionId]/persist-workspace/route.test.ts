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
}));

jest.mock("@/lib/workspace-flush", () => ({
  flushAndSyncProjectWorkspace: jest.fn(async () => ({
    status: "no_active_room",
    flushedRooms: 0,
    workspacePath: "/tmp/project-1/workspace",
  })),
  getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
    code: "FILE_WRITE_ERROR",
    message: error instanceof Error ? error.message : "协同草稿同步失败",
    status: 500,
  })),
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

function emptyRequest(): NextRequest {
  return {} as NextRequest;
}

describe("session persist workspace route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("先 flush 协同草稿，再把 Session Workspace 同步到项目当前工作区", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");

    const response = await POST(emptyRequest(), {
      params: { sessionId: "session-1" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        sessionId: "session-1",
        projectId: "project-1",
        workspacePath: "/tmp/project-1/workspace",
        persistedAt: expect.any(Number),
      },
    });
    expect(workspaceFlush.flushAndSyncProjectWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
  });

  it("同步项目当前工作区失败时返回 FILE_WRITE_ERROR", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");
    jest
      .mocked(workspaceFlush.flushAndSyncProjectWorkspace)
      .mockRejectedValueOnce(new Error("Workspace source not found"));

    const response = await POST(emptyRequest(), {
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
  });
});
