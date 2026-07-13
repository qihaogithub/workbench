import type { NextRequest } from "next/server";

const commitWorkspaceMutation = jest.fn();

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
    createTextWorkspaceMutation: jest.fn((input) => ({
      mutationId: "mutation-1",
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      baseRevision: 0,
      actor: "author-site",
      reason: input.reason,
      operations: [{
        type: "put_text",
        path: input.path,
        content: input.content,
        expectedAbsent: input.previousContent === null,
      }],
    })),
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
  } as NextRequest;
}

describe("project config values route", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
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
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("live Workspace 写入共享配置运行值时通过 Authority 提交", async () => {
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
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      reason: "update_project_config_values",
      operations: [expect.objectContaining({
        type: "put_text",
        path: "project.config.values.json",
        content: JSON.stringify(values, null, 2),
      })],
    }));
    expect(fsUtils.saveProjectConfigValues).not.toHaveBeenCalled();
    expect(workspaceManager.updateWorkspaceTimestamp).not.toHaveBeenCalled();
  });
});
