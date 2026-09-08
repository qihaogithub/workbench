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

describe("auth register route compatibility", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    jest.doMock("@/lib/user", () => ({
      createUser: jest.fn(async () => ({
        id: "user-1",
        username: "alice",
        role: "editor",
      })),
      findUserByUsername: jest.fn(() => null),
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

  it("keeps the existing controlled registration API contract", async () => {
    const { POST } = await import("./route");
    const user = await import("@/lib/user");
    const jwt = await import("@/lib/auth/jwt");

    const response = await POST(
      createJsonRequest({ username: "alice", password: "secret123" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(user.createUser).toHaveBeenCalledWith({
      username: "alice",
      password: "secret123",
    });
    expect(jwt.createToken).toHaveBeenCalledWith({
      userId: "user-1",
      username: "alice",
      role: "editor",
    });
    expect(jwt.setAuthCookie).toHaveBeenCalledWith("token-1");
    expect(body).toEqual({
      success: true,
      data: { user: { id: "user-1", username: "alice", role: "editor" } },
    });
  });
});

export {};
