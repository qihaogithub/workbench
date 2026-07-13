import type { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const ensureMemoryFile = jest.fn();
const isLiveWorkspace = jest.fn();
const commitWorkspaceMutation = jest.fn();
const createTextWorkspaceMutation = jest.fn((input: unknown) => ({
  mutationId: "mutation-1",
  actor: "author-site",
  baseRevision: 0,
  operations: [],
  ...input as Record<string, unknown>,
}));

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/workspace-manager", () => ({
  isLiveWorkspace,
}));

jest.mock("@/lib/workspace-file-utils", () => ({
  isFileEditable: jest.fn((filePath: string) => filePath === "index.tsx"),
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
    createTextWorkspaceMutation,
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

describe("workspace file content route", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      revision: 2,
      resources: [],
      committedAt: 1,
    });

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-file-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "index.tsx"), "old code", "utf-8");

    ensureMemoryFile.mockImplementation((targetWorkspacePath: string) => {
      fs.writeFileSync(path.join(targetWorkspacePath, "memory.md"), "# memory", "utf-8");
    });

    jest.doMock("@/lib/fs-utils", () => ({
      createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
        success: false,
        error: { code, message: message || code, details },
      })),
      createApiSuccess: jest.fn((data: unknown) => ({
        success: true,
        data,
      })),
      ensureMemoryFile,
      findWorkspacePath: jest.fn(() => workspacePath),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-1",
        demoId: "project-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        expiresAt: Date.now() + 1000,
      })),
      isSessionExpired: jest.fn(() => false),
      sessionExists: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/fs-utils");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("live Workspace 读取缺失 memory.md 不执行读路径修补写入", async () => {
    isLiveWorkspace.mockReturnValue(true);
    const { GET } = await import("./route");

    const response = await GET(
      {} as NextRequest,
      { params: { sessionId: "session-1", filePath: ["memory.md"] } },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: { code: "FILE_READ_ERROR" },
    });
    expect(ensureMemoryFile).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, "memory.md"))).toBe(false);
  });

  it("非 live Workspace 保留 memory.md 读取修补兼容", async () => {
    isLiveWorkspace.mockReturnValue(false);
    const { GET } = await import("./route");

    const response = await GET(
      {} as NextRequest,
      { params: { sessionId: "session-1", filePath: ["memory.md"] } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureMemoryFile).toHaveBeenCalledWith(workspacePath);
    expect(body).toMatchObject({
      success: true,
      data: {
        path: "memory.md",
        content: "# memory",
      },
    });
  });

  it("GET 拒绝包含路径回退片段的工作区文件路径", async () => {
    isLiveWorkspace.mockReturnValue(true);
    const { GET } = await import("./route");

    const response = await GET(
      {} as NextRequest,
      { params: { sessionId: "session-1", filePath: ["demos", "..", "index.tsx"] } },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("PUT 通过 Authority 提交文件修改且不直接写入 workspace 文件", async () => {
    isLiveWorkspace.mockReturnValue(true);
    const { PUT } = await import("./route");

    const response = await PUT(
      jsonRequest({ content: "new code" }),
      { params: { sessionId: "session-1", filePath: ["index.tsx"] } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        path: "index.tsx",
        message: "文件已提交",
      },
    });
    expect(createTextWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      path: "index.tsx",
      content: "new code",
      previousContent: "old code",
      reason: "author_workspace_file_edit",
    }));
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      reason: "author_workspace_file_edit",
    }));
    expect(fs.readFileSync(path.join(workspacePath, "index.tsx"), "utf-8")).toBe("old code");
  });

  it("PUT 拒绝包含路径回退片段的可编辑文件路径且不提交 Authority", async () => {
    isLiveWorkspace.mockReturnValue(true);
    const { PUT } = await import("./route");

    const response = await PUT(
      jsonRequest({ content: "new code" }),
      { params: { sessionId: "session-1", filePath: ["demos", "..", "index.tsx"] } },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(workspacePath, "index.tsx"), "utf-8")).toBe("old code");
  });
});
