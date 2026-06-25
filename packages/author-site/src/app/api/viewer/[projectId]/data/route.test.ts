import fs from "fs";
import type { NextRequest } from "next/server";
import os from "os";
import path from "path";

class TestResponse {
  status: number;
  headers: Headers & { getSetCookie: () => string[] };
  private readonly body: string;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.headers = {
      getSetCookie: () => [],
      get: () => null,
      set: () => undefined,
      append: () => undefined,
      delete: () => undefined,
      has: () => false,
      forEach: () => undefined,
      entries: function* () {},
      keys: function* () {},
      values: function* () {},
      [Symbol.iterator]: function* () {},
    } as Headers & { getSetCookie: () => string[] };
    this.body = typeof body === "string"
      ? body
      : body instanceof Uint8Array
        ? Buffer.from(body).toString("utf-8")
        : "";
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.body);
  }

  async text(): Promise<string> {
    return this.body;
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

describe("viewer project data route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "viewer-project-core-"));
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

  it("读取 CLI 提交后的项目数据", async () => {
    const { ProjectAdminService } = await import("@opencode-workbench/project-core");
    const { pullProjectScaffold, submitProjectScaffold } = await import("@opencode-workbench/project-scaffold");
    const { publishProject } = await import("@/lib/publish-manager");
    const service = new ProjectAdminService({ dataDir: tempDir });
    const created = service.createProject({ name: "CLI 写入项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = edit.data?.editId ?? "";
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>CLI page</div>; }",
      schema: JSON.stringify({ type: "object", properties: {} }, null, 2),
    });
    expect(page.ok).toBe(true);
    expect(service.commitEdit(editId, "viewer 兼容性测试").ok).toBe(true);

    const projectDir = path.join(tempDir, "local-project");
    const pulled = pullProjectScaffold(service, service.defaultActor(), { projectId, targetDir: projectDir });
    expect(pulled.ok).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "opencode.project.json"), "utf-8")) as {
      pages: Array<{ entry: string }>;
    };
    fs.writeFileSync(
      path.join(projectDir, manifest.pages[0]?.entry ?? ""),
      "export default function Demo(){ return <div>CLI submitted page</div>; }",
      "utf-8",
    );
    const submitted = submitProjectScaffold(service, service.defaultActor(), {
      projectDir,
      note: "CLI 提交后 Web 读取测试",
    });
    expect(submitted.ok).toBe(true);

    const { GET } = await import("./route");
    const response = await GET({} as NextRequest, { params: { projectId } });
    const body = await response.json() as {
      success: boolean;
      data?: {
        project: { id: string; name: string } | null;
        demoPages: Array<{ id: string; code: string; schema?: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.project?.name).toBe("CLI 写入项目");
    expect(body.data?.demoPages).toHaveLength(1);
    expect(body.data?.demoPages[0]?.code).toContain("CLI submitted page");

    const published = await publishProject(projectId);
    expect(published.demoCount).toBe(1);

    const { GET: getPublishedData } = await import("../../../../data/[...path]/route");
    const publishedResponse = await getPublishedData(
      { headers: new Headers() } as NextRequest,
      { params: { path: [projectId, "project.json"] } },
    );
    expect(publishedResponse.status).toBe(200);
    const publishedProject = JSON.parse(
      fs.readFileSync(path.join(tempDir, "published", projectId, "project.json"), "utf-8"),
    ) as {
      id: string;
      demoPages: Array<{ compiledJsPath: string; iframeHtmlPath?: string }>;
    };
    expect(publishedProject.id).toBe(projectId);
    expect(publishedProject.demoPages[0]?.compiledJsPath).toBe(
      `demos/${body.data?.demoPages[0]?.id}/compiled.js`,
    );
    expect(publishedProject.demoPages[0]?.iframeHtmlPath).toBe(
      `demos/${body.data?.demoPages[0]?.id}/iframe.html`,
    );
  });
});
