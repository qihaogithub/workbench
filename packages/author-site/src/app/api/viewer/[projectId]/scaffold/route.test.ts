import fs from "fs";
import type { NextRequest } from "next/server";
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

function mockRequest(): NextRequest {
  return { nextUrl: new URL("http://localhost/api") } as NextRequest;
}

describe("public viewer project scaffold route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "viewer-scaffold-"));
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

  async function createProjectWithVersions(versionCount: number): Promise<{
    projectId: string;
    versionIds: string[];
  }> {
    const { ProjectAdminService } = await import("@opencode-workbench/project-core");
    const service = new ProjectAdminService({ dataDir: tempDir });
    const created = service.createProject({ name: "Published project" });
    const projectId = created.data?.id ?? "";
    const versionIds: string[] = [];

    for (let index = 0; index < versionCount; index += 1) {
      const edit = service.beginEdit(projectId);
      const editId = edit.data?.editId ?? "";
      if (index === 0) {
        const page = service.createPage({
          editId,
          name: "Home",
          code: "export default function Demo(){ return <div>viewer zip</div>; }",
          schema: JSON.stringify({ type: "object", properties: {} }, null, 2),
        });
        expect(page.ok).toBe(true);
      } else {
        const pageId = service.getProject(projectId).data?.pages[0]?.id ?? "";
        const updated = service.updatePage({
          editId,
          pageId,
          code: `export default function Demo(){ return <div>viewer zip ${index}</div>; }`,
        });
        expect(updated.ok).toBe(true);
      }
      const committed = service.commitEdit(editId, `version ${index}`);
      expect(committed.ok).toBe(true);
      versionIds.push(committed.data?.version.versionId ?? "");
    }

    return { projectId, versionIds };
  }

  function setPublishedVersion(projectId: string, versionId: string): void {
    const projectPath = path.join(tempDir, "projects", projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    fs.writeFileSync(
      projectPath,
      JSON.stringify(
        {
          ...project,
          publishedVersion: versionId,
          publishedAt: Date.now(),
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  it("exports zip for a published project without unpublished changes", async () => {
    const { projectId, versionIds } = await createProjectWithVersions(1);
    setPublishedVersion(projectId, versionIds[0]);

    const { GET } = await import("./route");
    const response = await GET(mockRequest(), { params: { projectId } });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(body.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("does not export a never-published project", async () => {
    const { projectId } = await createProjectWithVersions(1);

    const { GET } = await import("./route");
    const response = await GET(mockRequest(), { params: { projectId } });

    expect(response.status).toBe(404);
  });

  it("rejects projects with unpublished changes", async () => {
    const { projectId, versionIds } = await createProjectWithVersions(2);
    setPublishedVersion(projectId, versionIds[0]);

    const { GET } = await import("./route");
    const response = await GET(mockRequest(), { params: { projectId } });

    expect(response.status).toBe(409);
  });
});
