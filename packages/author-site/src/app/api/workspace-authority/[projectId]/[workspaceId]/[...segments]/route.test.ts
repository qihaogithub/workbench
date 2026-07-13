jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string) => ({ success: false, error: { code, message: message ?? code } })),
}));
jest.mock("@/lib/runtime-config", () => ({ getServerAgentServiceUrl: jest.fn(() => "http://agent.internal") }));
jest.mock("@/lib/session-manager", () => ({
  getEditSession: jest.fn(() => ({ userId: "user-1", demoId: "project-1", workspaceId: "live-1" })),
}));

import { TextDecoder as NodeTextDecoder } from "node:util";

class TestResponse {
  status: number;
  ok: boolean;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.body = body ?? null;
    const headers = new Map<string, string>();
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers.set(key.toLowerCase(), value);
      }
    }
    this.headers = { get: (name) => headers.get(name.toLowerCase()) ?? null };
    if (body instanceof Uint8Array) this.buffer = Buffer.from(body);
    else if (body instanceof ArrayBuffer) this.buffer = Buffer.from(body);
    else if (typeof body === "string") this.buffer = Buffer.from(body);
    else this.buffer = Buffer.alloc(0);
  }

  async arrayBuffer() { return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength) as ArrayBuffer; }
  async json() { return JSON.parse(this.buffer.toString("utf-8")) as unknown; }
  static json(body: unknown, init?: ResponseInit) {
    return new TestResponse(JSON.stringify(body), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
    });
  }
}

function createRequest(url: string, init?: { method?: string; contentType?: string; body?: string }): Request {
  const bytes = new Uint8Array(Buffer.from(init?.body ?? ""));
  return {
    url,
    method: init?.method ?? "GET",
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? init?.contentType ?? null : null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  } as unknown as Request;
}

describe("workspace authority same-origin proxy", () => {
  const originalFetch = global.fetch;
  const originalResponse = global.Response;
  const originalTextDecoder = global.TextDecoder;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    global.TextDecoder = NodeTextDecoder as unknown as typeof TextDecoder;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.Response = originalResponse;
    global.TextDecoder = originalTextDecoder;
    jest.resetModules();
  });

  it("校验登录 Session 后代理 read 且不接受任意内部路径", async () => {
    const { GET } = await import("./route");
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ success: true, data: { revision: 2 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
    const context = { params: { projectId: "project-1", workspaceId: "live-1", segments: ["state"] } };
    const response = await GET(createRequest("http://author.test/api/workspace-authority/project-1/live-1/state?sessionId=session-1"), context);
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("http://agent.internal/api/workspace-authority/projects/project-1/workspaces/live-1/state?sessionId=session-1"),
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );

    const rejected = await GET(
      createRequest("http://author.test/api/workspace-authority/project-1/live-1/private?sessionId=session-1"),
      { params: { ...context.params, segments: ["private"] } },
    );
    expect(rejected.status).toBe(400);
  });

  it("mutation body 中的 Session 也必须匹配当前用户和 Workspace", async () => {
    const { POST } = await import("./route");
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ success: true, data: { committed: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
    const body = {
      mutationId: "mutation-1", projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", baseRevision: 1,
      actor: "author-site", reason: "test", operations: [],
    };
    const response = await POST(createRequest("http://author.test/api/workspace-authority/project-1/live-1/mutate", {
      method: "POST", contentType: "application/json", body: JSON.stringify(body),
    }), { params: { projectId: "project-1", workspaceId: "live-1", segments: ["mutate"] } });
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("http://agent.internal/api/workspace-authority/projects/project-1/workspaces/live-1/mutate?sessionId=session-1"),
      expect.objectContaining({ method: "POST", body: expect.any(Uint8Array) }),
    );
  });
});
