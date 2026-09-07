import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

const commitWorkspaceMutation = jest.fn();
const resolveDesignSpecContext = jest.fn();
const requireDesignSpecAdmin = jest.fn();

jest.mock("@/lib/design-specs/route-helpers", () => ({
  resolveDesignSpecContext,
  requireDesignSpecAdmin,
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
  return { commitWorkspaceMutation, WorkspaceAuthorityClientError };
});

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message: string) => ({
    success: false,
    error: { code, message },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
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
    return JSON.parse(String(this.body ?? "null"));
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function request(url: string, body: unknown): NextRequest {
  return {
    nextUrl: new URL(url),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("design spec document rename API", () => {
  const originalResponse = global.Response;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "design-spec-route-"));
    workspacePath = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspacePath, "design-spec"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, "design-spec", "manifest.json"),
      JSON.stringify({
        version: 1,
        items: [{
          id: "ds_spec_1",
          title: "旧设计规范",
          createdAt: "2026-08-12T00:00:00.000Z",
          updatedAt: "2026-08-12T00:00:00.000Z",
        }],
      }, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "design-spec", "spec-ds_spec_1.json"),
      JSON.stringify({
        id: "ds_spec_1",
        title: "旧设计规范",
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
        autoManagedPageId: "page-1",
        entries: [{
          id: "entry-1",
          title: "头图规范",
          markdown: "保留正文",
          autoManagedFieldKey: "hero",
          target: { type: "page", pageIds: ["page-1"] },
        }],
      }, null, 2),
      "utf8",
    );
    resolveDesignSpecContext.mockResolvedValue({
      ctx: {
        workingDir: workspacePath,
        sessionId: "session-1",
        projectId: "project-1",
        live: false,
        liveContext: null,
        user: { role: "admin" },
      },
    });
    requireDesignSpecAdmin.mockReturnValue(null);
    commitWorkspaceMutation.mockResolvedValue({
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      revision: 2,
      resources: [],
      committedAt: 1,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.Response = originalResponse;
  });

  it("renames a document and preserves its content and identity", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      request(
        `http://localhost/api/design-specs/ds_spec_1?workingDir=${encodeURIComponent(workspacePath)}`,
        { title: "  新设计规范  " },
      ),
      { params: Promise.resolve({ docId: "ds_spec_1" }) },
    );
    const body = await response.json() as { success: boolean; data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "ds_spec_1",
        title: "新设计规范",
        autoManagedPageId: "page-1",
        entries: [{
          id: "entry-1",
          title: "头图规范",
          markdown: "保留正文",
          autoManagedFieldKey: "hero",
        }],
      },
    });
    expect(JSON.parse(fs.readFileSync(path.join(workspacePath, "design-spec", "manifest.json"), "utf8")).items[0].title)
      .toBe("新设计规范");
    expect(JSON.parse(fs.readFileSync(path.join(workspacePath, "design-spec", "spec-ds_spec_1.json"), "utf8")))
      .toMatchObject({ id: "ds_spec_1", title: "新设计规范", autoManagedPageId: "page-1" });
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });

  it("rejects empty titles before writing", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      request(`http://localhost/api/design-specs/ds_spec_1?workingDir=${workspacePath}`, { title: "  " }),
      { params: Promise.resolve({ docId: "ds_spec_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "INVALID_REQUEST" } });
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });

  it("requires an administrator", async () => {
    requireDesignSpecAdmin.mockReturnValue({ status: 403 });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      request(`http://localhost/api/design-specs/ds_spec_1?workingDir=${workspacePath}`, { title: "新名称" }),
      { params: Promise.resolve({ docId: "ds_spec_1" }) },
    );

    expect(response.status).toBe(403);
    expect(commitWorkspaceMutation).not.toHaveBeenCalled();
  });

  it("submits live rename as an atomic document and manifest mutation", async () => {
    resolveDesignSpecContext.mockResolvedValue({
      ctx: {
        workingDir: workspacePath,
        sessionId: "session-1",
        projectId: "project-1",
        live: true,
        liveContext: {
          projectId: "project-1",
          workspaceId: "workspace-1",
          sessionId: "session-1",
        },
        user: { role: "admin" },
      },
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      request(`http://localhost/api/design-specs/ds_spec_1?workingDir=${workspacePath}`, { title: "Live 新名称" }),
      { params: Promise.resolve({ docId: "ds_spec_1" }) },
    );

    expect(response.status).toBe(200);
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      reason: "rename_design_spec_document",
      projectId: "project-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      operations: [
        expect.objectContaining({ type: "put_text", path: "design-spec/spec-ds_spec_1.json" }),
        expect.objectContaining({ type: "put_text", path: "design-spec/manifest.json" }),
      ],
    }));
  });

  it("returns not found for an unsafe or missing document id", async () => {
    const { PATCH } = await import("./route");
    const unsafe = await PATCH(
      request(`http://localhost/api/design-specs/../secret?workingDir=${workspacePath}`, { title: "新名称" }),
      { params: Promise.resolve({ docId: "../secret" }) },
    );
    expect(unsafe.status).toBe(404);
    expect(resolveDesignSpecContext).not.toHaveBeenCalled();

    const missing = await PATCH(
      request(`http://localhost/api/design-specs/ds_missing?workingDir=${workspacePath}`, { title: "新名称" }),
      { params: Promise.resolve({ docId: "ds_missing" }) },
    );
    expect(missing.status).toBe(404);
  });
});
