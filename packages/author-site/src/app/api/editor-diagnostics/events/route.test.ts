jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

export {};

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

jest.mock("@/lib/editor-diagnostics/store", () => ({
  appendEditorDiagnosticEvents: jest.fn(async (events: unknown[]) => ({
    written: events.length,
    editorSessionId: "editor-session-1",
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

function jsonRequest(body: unknown): Request {
  return {
    json: jest.fn(async () => body),
  } as unknown as Request;
}

describe("editor diagnostics events route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("批量写入诊断事件", async () => {
    const { POST } = await import("./route");
    const store = await import("@/lib/editor-diagnostics/store");

    const response = await POST(
      jsonRequest({
        events: [
          {
            id: "evt-1",
            editorSessionId: "editor-session-1",
            projectId: "project-1",
            timestamp: 1,
            category: "system",
            name: "started",
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        written: 1,
        editorSessionId: "editor-session-1",
      },
    });
    expect(store.appendEditorDiagnosticEvents).toHaveBeenCalledTimes(1);
  });

  it("拒绝空事件列表", async () => {
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ events: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "诊断事件不能为空",
      },
    });
  });
});
