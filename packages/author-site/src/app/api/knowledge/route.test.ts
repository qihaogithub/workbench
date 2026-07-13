import fs from "fs";
import os from "os";
import path from "path";

import type { NextRequest } from "next/server";

const commitWorkspaceMutation = jest.fn(async (_request: unknown) => ({
  committed: true,
  mutationId: "mutation-test",
  projectId: "project-1",
  workspaceId: "workspace-1",
  baseRevision: 0,
  revision: 2,
  rootHash: "root-hash",
  actor: "author-site",
  resources: [],
  committedAt: Date.now(),
}));

class MockWorkspaceAuthorityClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

class TestResponse {
  status: number;
  ok: boolean;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.body = body ?? null;
    const headers = new Map<string, string>();
    if (init?.headers) {
      for (const [key, value] of Object.entries(
        init.headers as Record<string, string>,
      )) {
        headers.set(key.toLowerCase(), value);
      }
    }
    this.headers = {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    };
    if (body instanceof Uint8Array) {
      this.buffer = Buffer.from(body);
    } else if (typeof body === "string") {
      this.buffer = Buffer.from(body);
    } else {
      this.buffer = Buffer.alloc(0);
    }
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.buffer.toString("utf-8"));
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  }
}

function createRequest(url: string, body?: unknown): NextRequest {
  return {
    nextUrl: new URL(url),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("knowledge routes live Workspace writes", () => {
  const originalEnv = { ...process.env };
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.resetModules();
    commitWorkspaceMutation.mockClear();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspacePath, "knowledge"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, ".workspace.json"),
      JSON.stringify({ workspaceId: "workspace-1", scope: "live", status: "active" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "knowledge", "manifest.json"),
      JSON.stringify({
        version: 1,
        items: [{
          id: "kb-1",
          title: "Rules",
          source: "user",
          description: "Rules",
          fileName: "rules.md",
          addedAt: "2026-07-10T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
          sizeBytes: 3,
        }],
      }, null, 2),
      "utf-8",
    );
    fs.writeFileSync(path.join(workspacePath, "knowledge", "rules.md"), "old", "utf-8");
    process.env.DATA_DIR = tempDir;

    jest.doMock("@/lib/fs-utils", () => ({
      findWorkspacePath: jest.fn(() => workspacePath),
      getDataDir: jest.fn(() => tempDir),
      getSessionMeta: jest.fn((sessionId: string) => sessionId === "session-1"
        ? { sessionId, demoId: "project-1", workspaceId: "workspace-1" }
        : null),
    }));
    jest.doMock("@/lib/workspace-authority-client", () => ({
      commitWorkspaceMutation,
      WorkspaceAuthorityClientError: MockWorkspaceAuthorityClientError,
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/workspace-authority-client");
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    global.Response = originalResponse;
    jest.resetModules();
  });

  it("live Workspace 新增知识文档必须带有效 session", async () => {
    const { POST } = await import("./route");
    const request = createRequest(
      `http://localhost/api/knowledge?workingDir=${encodeURIComponent(workspacePath)}&projectId=project-1`,
      { title: "New Doc", content: "content" },
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "WORKSPACE_AUTHORITY_NOT_READY" },
    });
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspacePath, "knowledge", "New_Doc.md"))).toBe(false);
  });

  it("live Workspace 新增知识文档通过 Authority 一次性提交文档和 manifest", async () => {
    const { POST } = await import("./route");
    const request = createRequest(
      `http://localhost/api/knowledge?workingDir=${encodeURIComponent(workspacePath)}&projectId=project-1&sessionId=session-1`,
      { title: "New Doc", description: "Desc", content: "new content" },
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
    expect(commitWorkspaceMutation.mock.calls[0][0]).toMatchObject({
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      actor: "author-site",
      reason: "create_knowledge_document",
      operations: [
        { type: "put_text", path: "knowledge/New_Doc.md", content: "new content", expectedAbsent: true },
        { type: "put_text", path: "knowledge/manifest.json" },
      ],
    });
    expect(fs.existsSync(path.join(workspacePath, "knowledge", "New_Doc.md"))).toBe(false);
  });

  it("live Workspace 更新知识文档不直接写文件", async () => {
    const { PUT } = await import("./[docId]/route");
    const request = createRequest(
      `http://localhost/api/knowledge/kb-1?workingDir=${encodeURIComponent(workspacePath)}&projectId=project-1&sessionId=session-1`,
      { description: "Updated", content: "new" },
    );

    const response = await PUT(request, { params: Promise.resolve({ docId: "kb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
    expect(commitWorkspaceMutation.mock.calls[0][0]).toMatchObject({
      reason: "update_knowledge_document",
      operations: [
        { type: "put_text", path: "knowledge/rules.md", content: "new" },
        { type: "put_text", path: "knowledge/manifest.json" },
      ],
    });
    expect(fs.readFileSync(path.join(workspacePath, "knowledge", "rules.md"), "utf-8")).toBe("old");
  });

  it("live Workspace 删除知识文档通过 Authority 一次性提交删除和 manifest", async () => {
    const { DELETE } = await import("./[docId]/route");
    const request = createRequest(
      `http://localhost/api/knowledge/kb-1?workingDir=${encodeURIComponent(workspacePath)}&projectId=project-1&sessionId=session-1`,
    );

    const response = await DELETE(request, { params: Promise.resolve({ docId: "kb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(commitWorkspaceMutation).toHaveBeenCalledTimes(1);
    expect(commitWorkspaceMutation.mock.calls[0][0]).toMatchObject({
      reason: "delete_knowledge_document",
      operations: [
        { type: "delete_path", path: "knowledge/rules.md" },
        { type: "put_text", path: "knowledge/manifest.json" },
      ],
    });
    expect(fs.existsSync(path.join(workspacePath, "knowledge", "rules.md"))).toBe(true);
  });
});
