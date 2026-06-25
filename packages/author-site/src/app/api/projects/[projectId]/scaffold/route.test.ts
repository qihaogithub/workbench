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

  it("导出项目脚手架 zip", async () => {
    const { ProjectAdminService } = await import("@opencode-workbench/project-core");
    const service = new ProjectAdminService({ dataDir: tempDir });
    const created = service.createProject({ name: "下载项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = edit.data?.editId ?? "";
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>zip page</div>; }",
      schema: JSON.stringify({ type: "object", properties: {} }, null, 2),
    });
    expect(page.ok).toBe(true);
    expect(service.commitEdit(editId, "准备 zip 下载").ok).toBe(true);

    const { GET } = await import("./route");
    const response = await GET({} as NextRequest, { params: { projectId } });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(`${projectId}.zip`);
    expect(body.readUInt32LE(0)).toBe(0x04034b50);
    expect(body.includes(Buffer.from("opencode.project.json", "utf-8"))).toBe(true);
    expect(body.includes(Buffer.from("src/pages/", "utf-8"))).toBe(true);
  });
});
