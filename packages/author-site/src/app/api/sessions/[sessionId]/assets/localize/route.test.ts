import type { NextRequest } from "next/server";

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  findWorkspacePath: jest.fn(() => "/tmp/workspace-1"),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
  isSessionExpired: jest.fn(() => false),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/project-images", () => ({
  addProjectImage: jest.fn(),
}));

const commitWorkspaceMutation = jest.fn();
const stageWorkspaceBinary = jest.fn();

jest.mock("@/lib/workspace-authority-client", () => ({
  commitWorkspaceMutation,
  stageWorkspaceBinary,
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

describe("selected image localize route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    stageWorkspaceBinary.mockResolvedValue({
      stagingId: "staging-1",
      hash: "asset-hash",
      size: Buffer.from("image-bytes").length,
    });
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      revision: 2,
      resources: [],
      committedAt: 1,
    });
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("使用浏览器 Blob 通过 Authority 提交 workspace asset 并登记项目图片", async () => {
    const fs = await import("fs");
    const projectImages = await import("@/lib/project-images");
    const { POST } = await import("./route");
    const dataBase64 = Buffer.from("image-bytes").toString("base64");

    const response = await POST(
      jsonRequest({
        pageId: "page-1",
        runtimeType: "prototype-html-css",
        source: {
          kind: "selected-image",
          src: "https://cdn.example.com/hero.png",
          currentSrc: "https://cdn.example.com/hero.png",
          owId: "ow_1",
          domPath: "prototype-root > img:nth-of-type(1)",
        },
        browserBlob: {
          mimeType: "image/png",
          dataBase64,
        },
      }),
      { params: { sessionId: "session-1" } },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        workspacePath: expect.stringMatching(/^assets\/images\/[a-f0-9]{12}-hero\.png$/),
        relativePathFromPage: expect.stringMatching(/^\.\.\/\.\.\/assets\/images\/[a-f0-9]{12}-hero\.png$/),
        sourceType: "browser_blob",
        mimeType: "image/png",
      },
    });
    expect(stageWorkspaceBinary).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      content: Buffer.from("image-bytes"),
    }));
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      actor: "author-site",
      reason: "localize_selected_asset",
      operations: [expect.objectContaining({
        type: "put_binary",
        path: expect.stringMatching(/^assets\/images\/[a-f0-9]{12}-hero\.png$/),
        stagingId: "staging-1",
        hash: "asset-hash",
        size: Buffer.from("image-bytes").length,
        expectedAbsent: true,
      })],
    }));
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(projectImages.addProjectImage).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        createdBy: "user",
        sourceType: "browser_blob",
        url: expect.stringMatching(/^assets\/images\/[a-f0-9]{12}-hero\.png$/),
      }),
    );
  });

  it("浏览器不可读且远程 URL 为本地地址时要求上传原图", async () => {
    const fs = await import("fs");
    const projectImages = await import("@/lib/project-images");
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        source: {
          kind: "selected-image",
          src: "http://localhost/private.png",
          currentSrc: "http://localhost/private.png",
        },
        browserReadError: "Failed to fetch",
      }),
      { params: { sessionId: "session-1" } },
    );

    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "UPLOAD_FAILED",
        message: "无法本地化当前图片，需要上传原图",
        details: {
          browserReadError: "Failed to fetch",
          remoteError: "PRIVATE_NETWORK_BLOCKED",
        },
      },
    });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
    expect(projectImages.addProjectImage).not.toHaveBeenCalled();
  });
});
