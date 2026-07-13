import type { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const updateWorkspaceDemoFiles = jest.fn();
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
  } as NextRequest;
}

describe("legacy session files route", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    updateWorkspaceDemoFiles.mockReturnValue(true);
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      revision: 2,
      resources: [],
      committedAt: 1,
    });
    global.Response = TestResponse as unknown as typeof Response;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-session-files-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const demoDir = path.join(workspacePath, "demos", "page-1");
    fs.mkdirSync(demoDir, { recursive: true });
    fs.writeFileSync(path.join(demoDir, "index.tsx"), "old code", "utf-8");
    fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");

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
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        expiresAt: Date.now() + 1000,
      })),
      getWorkspaceDemoPageFiles: jest.fn(),
      getWorkspaceMultiDemoFiles: jest.fn(),
      isSessionExpired: jest.fn(() => false),
      listWorkspaceDemoPages: jest.fn(() => [{ id: "page-1", name: "页面 1", order: 0 }]),
      readFoldersMeta: jest.fn(() => []),
      sessionExists: jest.fn(() => true),
      updateWorkspaceDemoFiles,
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/fs-utils");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("live Workspace 兼容保存入口通过 Authority 提交到第一个页面", async () => {
    const { PUT } = await import("./route");
    const code = "export default function Page(){ return <div>new</div>; }";
    const schema = "{\"type\":\"object\"}";

    const response = await PUT(
      jsonRequest({ code, schema }),
      { params: { sessionId: "session-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(updateWorkspaceDemoFiles).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      actor: "author-site",
      reason: "update_session_files_legacy",
      operations: expect.arrayContaining([
        expect.objectContaining({
          type: "put_text",
          path: "demos/page-1/index.tsx",
          content: code,
        }),
        expect.objectContaining({
          type: "put_text",
          path: "demos/page-1/config.schema.json",
          content: schema,
        }),
      ]),
    }));
    expect(fs.readFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "utf-8")).toBe("old code");
  });
});
