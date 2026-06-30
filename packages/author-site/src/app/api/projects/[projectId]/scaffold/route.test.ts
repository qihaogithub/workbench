import fs from "fs";
import type { NextRequest } from "next/server";
import os from "os";
import path from "path";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user_scaffold_test",
    username: "Scaffold Tester",
  })),
}));

jest.mock("@/lib/session-manager", () => ({
  getEditSession: jest.fn(),
  syncEditSessionToProjectWorkspace: jest.fn(),
}));

jest.mock("@/lib/workspace-flush", () => ({
  flushWorkspaceBeforeCriticalAction: jest.fn(async () => ({
    status: "no_active_room",
    flushedRooms: 0,
  })),
  getWorkspaceFlushErrorResponse: jest.fn((error: unknown) => ({
    code: "COLLAB_FLUSH_FAILED",
    message: error instanceof Error ? error.message : "flush failed",
    status: 502,
  })),
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

  private bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    return arrayBuffer;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.body instanceof Uint8Array) {
      return this.bufferToArrayBuffer(Buffer.from(this.body));
    }
    if (typeof this.body === "string") {
      return this.bufferToArrayBuffer(Buffer.from(this.body, "utf-8"));
    }
    return new ArrayBuffer(0);
  }

  async json(): Promise<unknown> {
    if (typeof this.body !== "string") return null;
    return JSON.parse(this.body);
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function mockRequest(url = "http://localhost/api"): NextRequest {
  return { nextUrl: new URL(url) } as NextRequest;
}

function mockSession(projectId: string, userId = "user_scaffold_test") {
  return {
    sessionId: "session_export",
    demoId: projectId,
    userId,
    workspaceId: "workspace_export",
    status: "editing",
    basedOnVersion: "v0",
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000,
    code: "",
    schema: "",
    workspacePath: "",
    demos: { demos: {}, projectConfigSchema: undefined },
  };
}

describe("project scaffold download route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "author-scaffold-"));
    process.env.DATA_DIR = tempDir;
    global.Response = TestResponse as unknown as typeof Response;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    global.Response = originalResponse;
  });

  async function createExportableProject(): Promise<string> {
    const { ProjectAdminService } = await import("@opencode-workbench/project-core");
    const service = new ProjectAdminService({ dataDir: tempDir });
    const created = service.createProject({ name: "Download project" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = edit.data?.editId ?? "";
    const page = service.createPage({
      editId,
      name: "Home",
      code: "export default function Demo(){ return <div>zip page</div>; }",
      schema: JSON.stringify({ type: "object", properties: {} }, null, 2),
    });
    expect(page.ok).toBe(true);
    expect(service.commitEdit(editId, "prepare zip download").ok).toBe(true);
    return projectId;
  }

  it("exports project scaffold zip", async () => {
    const projectId = await createExportableProject();

    const { GET } = await import("./route");
    const response = await GET(mockRequest(), { params: { projectId } });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(`${projectId}.zip`);
    expect(body.readUInt32LE(0)).toBe(0x04034b50);
    expect(body.includes(Buffer.from("opencode.project.json", "utf-8"))).toBe(true);
    expect(body.includes(Buffer.from("src/pages/", "utf-8"))).toBe(true);
  });

  it("syncs a valid edit session before exporting", async () => {
    const projectId = await createExportableProject();
    const sessionManager = await import("@/lib/session-manager");
    const workspaceFlush = await import("@/lib/workspace-flush");
    jest.mocked(sessionManager.getEditSession).mockReturnValue(mockSession(projectId));
    jest
      .mocked(sessionManager.syncEditSessionToProjectWorkspace)
      .mockReturnValue({ success: true, projectId });

    const { GET } = await import("./route");
    const response = await GET(
      mockRequest("http://localhost/api?sessionId=session_export"),
      { params: { projectId } },
    );

    expect(response.status).toBe(200);
    expect(workspaceFlush.flushWorkspaceBeforeCriticalAction).toHaveBeenCalledWith({
      projectId,
      workspaceId: "workspace_export",
      sessionId: "session_export",
    });
    expect(sessionManager.syncEditSessionToProjectWorkspace).toHaveBeenCalledWith(
      "session_export",
    );
  });

  it("rejects exporting another user's session", async () => {
    const sessionManager = await import("@/lib/session-manager");
    jest
      .mocked(sessionManager.getEditSession)
      .mockReturnValue(mockSession("project_forbidden", "other_user"));

    const { GET } = await import("./route");
    const response = await GET(
      mockRequest("http://localhost/api?sessionId=session_export"),
      { params: { projectId: "project_forbidden" } },
    );

    expect(response.status).toBe(403);
    expect(sessionManager.syncEditSessionToProjectWorkspace).not.toHaveBeenCalled();
  });
});
