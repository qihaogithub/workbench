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

jest.mock("@/lib/editor-diagnostics/store", () => ({
  buildEditorDiagnosticExport: jest.fn(async (editorSessionId: string) => ({
    editorSessionId,
    exportedAt: 1,
    events: [],
    agentRunLogs: [],
    warnings: ["未找到后端诊断事件"],
  })),
}));

export {};

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

describe("editor diagnostics export route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("导出指定 editorSessionId 的诊断包", async () => {
    const { GET } = await import("./route");

    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/editor-diagnostics/export?editorSessionId=editor-session-1",
      ),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        editorSessionId: "editor-session-1",
        exportedAt: 1,
        events: [],
        agentRunLogs: [],
        warnings: ["未找到后端诊断事件"],
      },
    });
  });

  it("缺少 editorSessionId 时返回 INVALID_REQUEST", async () => {
    const { GET } = await import("./route");

    const response = await GET({
      nextUrl: new URL("http://localhost/api/editor-diagnostics/export"),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "缺少 editorSessionId",
      },
    });
  });
});
