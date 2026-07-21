import type { NextRequest } from "next/server";

jest.mock("@workbench/project-core", () => {
  class MockProjectTransferError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = "ProjectTransferError";
    }
  }
  return {
    ProjectTransferError: MockProjectTransferError,
    buildProjectManifest: jest.fn(() => ({
      projectId: "project-1",
      fileCount: 1,
      totalSize: 3,
      files: [],
    })),
    createProjectArchive: jest.fn(async () => Buffer.from("zip")),
  };
});

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message: string) => ({
    success: false,
    error: { code, message },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  getDataDir: jest.fn(() => "/tmp/data"),
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
    return JSON.parse(String(this.body));
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.body instanceof ArrayBuffer) return this.body;
    if (ArrayBuffer.isView(this.body)) {
      return Uint8Array.from(
        new Uint8Array(this.body.buffer, this.body.byteOffset, this.body.byteLength),
      ).buffer;
    }
    return Uint8Array.from(Buffer.from(String(this.body ?? ""))).buffer;
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

describe("project export route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("返回用于同步 diff 的项目清单", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/projects/project-1/export?manifest=1"),
      } as NextRequest,
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({ projectId: "project-1", fileCount: 1 }),
    });
  });

  it("返回 gzip 项目归档", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      { nextUrl: new URL("http://localhost/api/projects/project-1/export") } as NextRequest,
      { params: { projectId: "project-1" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("content-length")).toBe("3");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("zip");
  });
});
