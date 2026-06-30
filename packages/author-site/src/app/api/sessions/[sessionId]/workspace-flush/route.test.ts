class TestResponse {
  status: number;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
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

describe("workspace flush route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
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
    }));
    jest.doMock("@/lib/session-manager", () => ({
      getEditSession: jest.fn(() => ({
        userId: "user-1",
        demoId: "project-1",
        workspaceId: "workspace-1",
      })),
    }));
    jest.doMock("@/lib/workspace-flush", () => ({
      flushWorkspaceBeforeCriticalAction: jest.fn(async () => ({
        status: "flushed",
        flushedRooms: 2,
      })),
      getWorkspaceFlushErrorResponse: jest.fn(() => ({
        code: "AGENT_SERVICE_ERROR",
        message: "协同草稿同步失败",
        status: 502,
      })),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/session-manager");
    jest.dontMock("@/lib/workspace-flush");
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("通过服务端 flush 当前 Session 的 Workspace", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");

    const response = await POST(
      createJsonRequest({ projectId: "project-1", workspaceId: "workspace-1" }),
      { params: { sessionId: "session-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { status: "flushed", flushedRooms: 2 },
    });
    expect(workspaceFlush.flushWorkspaceBeforeCriticalAction).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
  });

  it("拒绝与 Session 不匹配的 Workspace", async () => {
    const { POST } = await import("./route");
    const workspaceFlush = await import("@/lib/workspace-flush");

    const response = await POST(
      createJsonRequest({ projectId: "project-1", workspaceId: "other-workspace" }),
      { params: { sessionId: "session-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Workspace 与 Session 不匹配" },
    });
    expect(workspaceFlush.flushWorkspaceBeforeCriticalAction).not.toHaveBeenCalled();
  });

  it("透传服务端 flush 错误", async () => {
    jest.doMock("@/lib/workspace-flush", () => ({
      flushWorkspaceBeforeCriticalAction: jest.fn(async () => {
        throw new Error("agent unavailable");
      }),
      getWorkspaceFlushErrorResponse: jest.fn(() => ({
        code: "AGENT_SERVICE_ERROR",
        message: "agent unavailable",
        status: 502,
      })),
    }));
    const { POST } = await import("./route");

    const response = await POST(
      createJsonRequest({ projectId: "project-1", workspaceId: "workspace-1" }),
      { params: { sessionId: "session-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      error: { code: "AGENT_SERVICE_ERROR", message: "agent unavailable" },
    });
  });
});
