import type { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const commitWorkspaceMutation = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/live-workspace-route-context", () => ({
  isLiveWorkspacePath: jest.fn(() => true),
}));

jest.mock("@/lib/workspace-authority-client", () => {
  class WorkspaceAuthorityClientError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    commitWorkspaceMutation,
    WorkspaceAuthorityClientError,
  };
});

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
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as NextRequest;
}

describe("project demo requirements route", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      revision: 2,
      resources: [],
      committedAt: 1,
    });
    global.Response = TestResponse as unknown as typeof Response;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-req-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const demoDir = path.join(workspacePath, "demos", "page-1");
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(
      path.join(demoDir, "config.schema.json"),
      JSON.stringify({
        type: "object",
        properties: { title: { type: "string", title: "页面标题" } },
      }),
      "utf-8",
    );

    jest.doMock("@/lib/fs-utils", () => ({
      createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
        success: false,
        error: { code, message: message || code, details },
      })),
      createApiSuccess: jest.fn((data: unknown) => ({
        success: true,
        data,
      })),
      findWorkspacePath: jest.fn(() => workspacePath),
      getDemoDirPath: jest.fn((_w: string, demoId: string) =>
        path.join(workspacePath, "demos", demoId),
      ),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        expiresAt: Date.now() + 1000,
      })),
      isSessionExpired: jest.fn(() => false),
      projectExists: jest.fn(() => true),
      sessionExists: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/fs-utils");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("写入配置要求时通过 Authority 提交 put_text", async () => {
    const { PUT } = await import("./route");
    const requirements = "@[页面标题](title) 需突出显示。";
    const response = await PUT(
      jsonRequest({ sessionId: "session-1", requirements }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        reason: "update_page_requirements",
        operations: [
          expect.objectContaining({
            type: "put_text",
            path: "demos/page-1/requirements.md",
            content: requirements,
          }),
        ],
      }),
    );
    expect(body.data.refs).toEqual([
      expect.objectContaining({ key: "title", resolved: true }),
    ]);
  });

  it("读取配置要求并解析引用状态", async () => {
    fs.writeFileSync(
      path.join(workspacePath, "demos", "page-1", "requirements.md"),
      "@[页面标题](title) @[已删除](gone)",
      "utf-8",
    );
    const { GET } = await import("./route");
    const response = await GET(
      {
        nextUrl: { searchParams: new URLSearchParams({ sessionId: "session-1" }) },
      } as unknown as NextRequest,
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.requirements).toContain("@[页面标题](title)");
    expect(body.data.refs).toEqual([
      expect.objectContaining({ key: "title", resolved: true }),
      expect.objectContaining({ key: "gone", resolved: false }),
    ]);
  });

  it("requirements 非字符串时返回 400", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(
      jsonRequest({ sessionId: "session-1", requirements: 123 }),
      { params: { projectId: "project-1", demoId: "page-1" } },
    );
    expect(response.status).toBe(400);
  });
});