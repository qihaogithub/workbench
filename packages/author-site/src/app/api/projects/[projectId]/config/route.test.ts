import type { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const commitWorkspaceMutation = jest.fn();
const saveProjectConfigSchema = jest.fn();
const deleteProjectConfigSchema = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/schema-validator", () => ({
  validateNoSchemaConflictFromStrings: jest.fn(() => ({ ok: true, conflicts: [] })),
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

function jsonRequest(body: unknown, url = "http://localhost/api/projects/project-1/config"): NextRequest {
  return {
    url,
    json: async () => body,
    clone: () => ({ json: async () => body }),
  } as NextRequest;
}

describe("project config route", () => {
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

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-config-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const pageDir = path.join(workspacePath, "demos", "page-1");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), "{}", "utf-8");
    fs.writeFileSync(
      path.join(workspacePath, "project.config.schema.json"),
      "{\"type\":\"object\",\"properties\":{\"old\":{\"type\":\"string\"}}}",
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
      deleteProjectConfigSchema,
      findWorkspacePath: jest.fn(() => workspacePath),
      getDemoDirPath: jest.fn((_workspacePath: string, demoId: string) => path.join(workspacePath, "demos", demoId)),
      getProjectConfigSchema: jest.fn(() => undefined),
      getProjectPath: jest.fn(() => "/tmp/project"),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        expiresAt: Date.now() + 1000,
      })),
      isSessionExpired: jest.fn(() => false),
      listDemoPages: jest.fn(() => [{ id: "page-1", name: "页面 1", order: 0 }]),
      projectExists: jest.fn(() => true),
      saveProjectConfigSchema,
      sessionExists: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/fs-utils");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("live Workspace 更新项目级 Schema 时通过 Authority 提交", async () => {
    const { PUT } = await import("./route");
    const schema = "{\"type\":\"object\",\"properties\":{\"title\":{\"type\":\"string\"}}}";

    const response = await PUT(
      jsonRequest({ sessionId: "session-1", schema }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { schema, exists: true },
    });
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      reason: "update_project_config_schema",
      operations: [expect.objectContaining({
        type: "put_text",
        path: "project.config.schema.json",
        content: schema,
      })],
    }));
    expect(saveProjectConfigSchema).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(workspacePath, "project.config.schema.json"), "utf-8")).toContain("old");
  });

  it("live Workspace 删除项目级 Schema 时通过 Authority 提交", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(
      jsonRequest({ sessionId: "session-1" }),
      { params: { projectId: "project-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { removed: true, exists: false },
    });
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      reason: "delete_project_config_schema",
      operations: [expect.objectContaining({
        type: "delete_path",
        path: "project.config.schema.json",
        expectedHash: expect.any(String),
      })],
    }));
    expect(deleteProjectConfigSchema).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, "project.config.schema.json"))).toBe(true);
  });
});
