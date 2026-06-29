class TestResponse {
  status: number;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.body = body ?? null;
    this.headers = {
      get: () => null,
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
    return new TestResponse(JSON.stringify(body), init);
  }
}

function createJsonRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

describe("auth login route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    jest.doMock("@/lib/user", () => ({
      verifyUserPassword: jest.fn(async () => ({
        id: "user-1",
        username: "qihao",
        createdAt: 0,
      })),
    }));
    jest.doMock("@/lib/auth/jwt", () => ({
      createToken: jest.fn(async () => "token-1"),
      setAuthCookie: jest.fn(),
    }));
    jest.doMock("@/lib/fs-utils", () => ({
      createApiSuccess: jest.fn((data) => ({ success: true, data })),
      createApiError: jest.fn((code, message) => ({
        success: false,
        error: { code, message },
      })),
    }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("@/lib/user");
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    global.Response = originalResponse;
  });

  it("登录时会忽略用户名首尾空白", async () => {
    const { POST } = await import("./route");
    const user = await import("@/lib/user");
    const jwt = await import("@/lib/auth/jwt");

    const response = await POST(
      createJsonRequest({ username: " qihao  ", password: "130015" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(user.verifyUserPassword).toHaveBeenCalledWith("qihao", "130015");
    expect(jwt.createToken).toHaveBeenCalledWith({
      userId: "user-1",
      username: "qihao",
    });
    expect(jwt.setAuthCookie).toHaveBeenCalledWith("token-1");
    expect(body).toEqual({
      success: true,
      data: { user: { id: "user-1", username: "qihao" } },
    });
  });

  it("用户名只有空白时返回输入错误", async () => {
    const { POST } = await import("./route");
    const user = await import("@/lib/user");

    const response = await POST(
      createJsonRequest({ username: "   ", password: "130015" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(user.verifyUserPassword).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "用户名和密码不能为空",
      },
    });
  });
});

export {};
