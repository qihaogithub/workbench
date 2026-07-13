import type { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

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

describe("resource version detail route", () => {
  const originalResponse = global.Response;
  const restorePageVersion = jest.fn();
  const resourceVersionGet = jest.fn();
  const flushWorkspaceBeforeCriticalAction = jest.fn();
  const flushAndSyncProjectWorkspace = jest.fn();
  const commitWorkspaceMutation = jest.fn();
  const updateWorkspaceDemoFiles = jest.fn();
  const markWorkspaceBasedOnVersion = jest.fn();
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "resource-restore-route-"));
    workspacePath = path.join(tempDir, "workspace");
    const pageDir = path.join(workspacePath, "demos", "page-1");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.tsx"), "old code", "utf-8");
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), "{\"type\":\"object\"}", "utf-8");
    fs.writeFileSync(path.join(workspacePath, "workspace-tree.json"), JSON.stringify({
      folders: [],
      pages: [{
        id: "page-1",
        name: "页面 1",
        order: 0,
        runtimeType: "high-fidelity-react",
      }],
    }, null, 2), "utf-8");

    restorePageVersion.mockReturnValue({
      ok: true,
      data: {
        success: true,
        newVersionId: "v2",
        restoredAt: 1,
        files: {
          code: "export default function Demo(){ return <div>restored</div>; }",
          schema: "{}",
        },
      },
    });
    resourceVersionGet.mockReturnValue({
      ok: true,
      data: {
        content: {
          code: "export default function Demo(){ return <div>restored</div>; }",
          schema: "{\"type\":\"object\",\"properties\":{\"title\":{\"type\":\"string\"}}}",
        },
        version: { id: "prv_1" },
      },
    });
    flushWorkspaceBeforeCriticalAction.mockResolvedValue({
      status: "no_active_room",
      flushedRooms: 0,
    });
    flushAndSyncProjectWorkspace.mockResolvedValue({
      status: "no_active_room",
      flushedRooms: 0,
      workspacePath: "/tmp/project/workspace",
      canonicalRevision: 10,
      canonicalRootHash: "root-hash-10",
    });
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "live-workspace",
      revision: 3,
      resources: [],
      committedAt: 1,
    });
    updateWorkspaceDemoFiles.mockReturnValue(true);
    markWorkspaceBasedOnVersion.mockReturnValue(true);
    jest.doMock("@workbench/project-core", () => ({
      ProjectAdminService: jest.fn(() => ({
        restorePageVersion,
        resourceRestore: jest.fn(),
        resourceVersionGet,
      })),
    }));
    jest.doMock("@/lib/auth/jwt", () => ({
      getAuthCookie: jest.fn(() => "token"),
      verifyToken: jest.fn(async () => ({
        userId: "user-1",
        username: "测试用户",
      })),
    }));
    jest.doMock("@/lib/fs-utils", () => ({
      createApiError: jest.fn((code: string, message?: string) => ({
        success: false,
        error: { code, message: message || code },
      })),
      createApiSuccess: jest.fn((data: unknown) => ({
        success: true,
        data,
      })),
      getDataDir: jest.fn(() => "/tmp/data"),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "stale-workspace",
        expiresAt: Date.now() + 10000,
      })),
      findWorkspacePath: jest.fn(() => workspacePath),
      getWorkspaceMeta: jest.fn(() => ({
        workspaceId: "live-workspace",
        projectId: "project-1",
        demoId: "project-1",
        scope: "live",
        status: "active",
        baseVersion: "v2",
        createdAt: 1,
        updatedAt: 2,
      })),
      getDemoDirPath: jest.fn((_workspacePath: string, demoId: string) => path.join(workspacePath, "demos", demoId)),
      getProjectConfigSchema: jest.fn(() => undefined),
      isSessionExpired: jest.fn(() => false),
      listDemoPages: jest.fn(() => [{
        id: "page-1",
        name: "页面 1",
        order: 0,
        runtimeType: "high-fidelity-react",
      }]),
      markWorkspaceBasedOnVersion,
      sessionExists: jest.fn(() => true),
      updateWorkspaceDemoFiles,
    }));
    jest.doMock("@/lib/workspace-flush", () => ({
      flushAndSyncProjectWorkspace,
      flushWorkspaceBeforeCriticalAction,
      getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
        code: "WORKSPACE_STALE",
        message: error instanceof Error ? error.message : "当前工作区已过期，请刷新项目后重试",
        status: 409,
      })),
    }));
    jest.doMock("@/lib/live-workspace-route-context", () => ({
      isLiveWorkspacePath: jest.fn(() => true),
    }));
    jest.doMock("@/lib/schema-validator", () => ({
      validateNoSchemaConflictFromStrings: jest.fn(() => ({ ok: true, conflicts: [] })),
    }));
    jest.doMock("@/lib/workspace-authority-client", () => {
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
  });

  afterEach(() => {
    jest.dontMock("@workbench/project-core");
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/workspace-flush");
    jest.dontMock("@/lib/live-workspace-route-context");
    jest.dontMock("@/lib/schema-validator");
    jest.dontMock("@/lib/workspace-authority-client");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("live Workspace 恢复页面版本时通过 Authority 提交且不直接同步 canonical", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ sessionId: "session-1", workspaceId: "live-workspace" }),
      {
        params: {
          projectId: "project-1",
          kind: "page",
          resourceId: "page-1",
          versionId: "prv_1",
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({
        newVersionId: "prv_1",
        files: expect.objectContaining({
          code: "export default function Demo(){ return <div>restored</div>; }",
        }),
      }),
    });
    expect(flushWorkspaceBeforeCriticalAction).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "live-workspace",
      sessionId: "session-1",
    });
    expect(restorePageVersion).not.toHaveBeenCalled();
    expect(updateWorkspaceDemoFiles).not.toHaveBeenCalled();
    expect(markWorkspaceBasedOnVersion).not.toHaveBeenCalled();
    expect(flushAndSyncProjectWorkspace).not.toHaveBeenCalled();

    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
    const mutation = commitWorkspaceMutation.mock.calls[0]?.[0];
    expect(mutation).toEqual(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "live-workspace",
      sessionId: "session-1",
      actor: "author-site",
      reason: "restore_page_version",
    }));
    expect(mutation.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/index.tsx",
        content: "export default function Demo(){ return <div>restored</div>; }",
      }),
      expect.objectContaining({
        type: "put_text",
        path: "demos/page-1/config.schema.json",
        content: "{\"type\":\"object\",\"properties\":{\"title\":{\"type\":\"string\"}}}",
      }),
    ]));
    expect(fs.readFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "utf-8")).toBe("old code");
  });

  it("非 live Workspace 恢复页面版本时不重复同步 canonical", async () => {
    const liveContext = await import("@/lib/live-workspace-route-context");
    jest.mocked(liveContext.isLiveWorkspacePath).mockReturnValueOnce(false);
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ sessionId: "session-1", workspaceId: "branch-workspace" }),
      {
        params: {
          projectId: "project-1",
          kind: "page",
          resourceId: "page-1",
          versionId: "prv_1",
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({
        newVersionId: "v2",
        files: expect.objectContaining({
          code: "export default function Demo(){ return <div>restored</div>; }",
        }),
      }),
    });
    expect(flushAndSyncProjectWorkspace).toHaveBeenCalledWith({
      projectId: "project-1",
      workspaceId: "branch-workspace",
      sessionId: "session-1",
    });
    expect(restorePageVersion).toHaveBeenCalledWith(
      "project-1",
      "page-1",
      "prv_1",
      expect.objectContaining({ source: "author-site" }),
      expect.objectContaining({
        sessionId: "session-1",
        workspaceId: "branch-workspace",
        workspaceRevision: 10,
        workspaceRootHash: "root-hash-10",
      }),
    );
    expect(updateWorkspaceDemoFiles).toHaveBeenCalledWith(
      "branch-workspace",
      "page-1",
      expect.objectContaining({
        code: "export default function Demo(){ return <div>restored</div>; }",
      }),
    );
    expect(markWorkspaceBasedOnVersion).toHaveBeenCalledWith("branch-workspace", "v2");
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });
});
