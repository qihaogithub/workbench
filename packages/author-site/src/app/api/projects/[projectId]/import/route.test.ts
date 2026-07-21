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
    importProjectArchive: jest.fn(async () => ({
      projectId: "project-1",
      backupPath: "/tmp/backup",
      importedFileCount: 2,
    })),
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

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function archiveRequest(
  data: Uint8Array,
  contentType = "application/gzip",
): NextRequest {
  let delivered = false;
  return {
    headers: new Headers({
      "content-type": contentType,
      "content-length": String(data.byteLength),
    }),
    body: {
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: data };
        },
        cancel: jest.fn(async () => undefined),
      }),
    },
  } as unknown as NextRequest;
}

describe("project import route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("读取 gzip 归档并交给 project-core 原子导入", async () => {
    const { POST } = await import("./route");
    const projectCore = await import("@workbench/project-core");
    const response = await POST(archiveRequest(Uint8Array.from(Buffer.from("archive"))), {
      params: { projectId: "project-1" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectCore.importProjectArchive).toHaveBeenCalledWith(
      "/tmp/data",
      "project-1",
      Buffer.from("archive"),
    );
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({ projectId: "project-1", importedFileCount: 2 }),
    });
  });

  it("拒绝非 gzip 请求", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      archiveRequest(Uint8Array.from(Buffer.from("archive")), "application/json"),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body).toEqual({
      success: false,
      error: expect.objectContaining({ code: "INVALID_REQUEST" }),
    });
  });
});
