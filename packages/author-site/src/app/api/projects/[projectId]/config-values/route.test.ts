import type { NextRequest } from "next/server";

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
  findWorkspacePath: jest.fn(() => "/tmp/workspace"),
  getProjectConfigValues: jest.fn(() => undefined),
  getProjectPath: jest.fn(() => "/tmp/project"),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    expiresAt: Date.now() + 1000,
  })),
  isSessionExpired: jest.fn(() => false),
  projectExists: jest.fn(() => true),
  saveProjectConfigValues: jest.fn(),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/workspace-manager", () => ({
  updateWorkspaceTimestamp: jest.fn(),
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

describe("project config values route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("写入共享配置运行值后推进 workspace 更新时间", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const workspaceManager = await import("@/lib/workspace-manager");

    const values = {
      modalImage: "/api/sessions/session-1/assets/popup.png",
    };
    const response = await PUT(
      jsonRequest({ sessionId: "session-1", values }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { values, exists: true },
    });
    expect(fsUtils.saveProjectConfigValues).toHaveBeenCalledWith(
      "/tmp/workspace",
      values,
    );
    expect(workspaceManager.updateWorkspaceTimestamp).toHaveBeenCalledWith(
      "workspace-1",
    );
  });
});
