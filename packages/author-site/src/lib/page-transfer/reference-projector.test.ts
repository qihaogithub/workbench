import fs from "node:fs";
import os from "node:os";
import path from "node:path";

jest.mock("@workbench/project-core", () => ({
  PageTransferStore: jest.requireActual(
    "../../../../project-core/src/page-transfer/store",
  ).PageTransferStore,
  normalizeHtmlImport: jest.fn(),
}));
jest.mock("@/lib/compiler", () => ({
  compileCode: jest.fn((code: string) => ({ compiledCode: code })),
}));
jest.mock("@/lib/html-sandbox-execution", () => ({
  HTML_SANDBOX_POLICY_VERSION: 1,
  createHtmlSandboxExecution: jest.fn(),
  resolveHtmlSandboxPublicOrigin: jest.fn(),
}));
jest.mock("@/lib/fs-utils", () => ({
  getDataDir: () => process.env.DATA_DIR as string,
  getProjectPath: (projectId: string) =>
    path.join(process.env.DATA_DIR as string, "projects", projectId),
  projectExists: (projectId: string) =>
    fs.existsSync(
      path.join(
        process.env.DATA_DIR as string,
        "projects",
        projectId,
        "project.json",
      ),
    ),
  listDemoPages: (workspacePath: string) =>
    JSON.parse(
      fs.readFileSync(path.join(workspacePath, "workspace-tree.json"), "utf8"),
    ).pages,
  getProjectConfigSchema: (workspacePath: string) =>
    fs.existsSync(path.join(workspacePath, "project.config.schema.json"))
      ? fs.readFileSync(
          path.join(workspacePath, "project.config.schema.json"),
          "utf8",
        )
      : null,
  getProjectConfigValues: (workspacePath: string) =>
    fs.existsSync(path.join(workspacePath, "project.config.values.json"))
      ? JSON.parse(
          fs.readFileSync(
            path.join(workspacePath, "project.config.values.json"),
            "utf8",
          ),
        )
      : {},
}));
jest.mock("./adapters", () => ({
  buildGrantedPagePackage: jest.fn(() => ({ resources: [] })),
}));

describe("published reference projector", () => {
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reference-projector-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    jest.resetModules();
  });

  async function fixture() {
    const sourceProjectId = "source-project";
    const targetProjectId = "target-project";
    const sourcePageId = "source-page";
    const targetPageId = "target-page";
    const grantId = "grant-test";
    const sourceRoot = path.join(dataDir, "projects", sourceProjectId);
    const workspace = path.join(sourceRoot, "workspace");
    const demo = path.join(workspace, "demos", sourcePageId);
    fs.mkdirSync(demo, { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, "project.json"),
      JSON.stringify({
        id: sourceProjectId,
        name: "source",
        projectType: "standard",
        workspacePath: workspace,
        demoPages: [],
        demoFolders: [],
        versions: [],
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    fs.writeFileSync(
      path.join(workspace, "workspace-tree.json"),
      JSON.stringify({
        folders: [],
        pages: [
          {
            id: sourcePageId,
            name: "source",
            order: 0,
            parentId: null,
            runtimeType: "prototype-html-css",
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(demo, "config.schema.json"),
      JSON.stringify({ type: "object", properties: {} }),
    );
    fs.writeFileSync(path.join(demo, "prototype.html"), "<main>v1</main>");
    fs.writeFileSync(path.join(demo, "prototype.css"), "main{}");
    fs.writeFileSync(path.join(demo, "prototype.meta.json"), "{}");
    const published = path.join(dataDir, "published", targetProjectId);
    fs.mkdirSync(published, { recursive: true });
    fs.writeFileSync(
      path.join(published, "project.json"),
      JSON.stringify({
        id: targetProjectId,
        name: "target",
        publishedVersion: "v1",
        publishedAt: 1,
        demoFolders: [],
        demoPages: [
          {
            id: targetPageId,
            name: "target name",
            order: 0,
            parentId: null,
            runtimeType: "prototype-html-css",
            referenceId: grantId,
          },
        ],
      }),
    );
    const { PageTransferStore } = await import("@workbench/project-core");
    const store = new PageTransferStore({ dataDir });
    store.upsertGrant({
      id: grantId,
      sourceProjectId,
      sourcePageId,
      targetProjectId,
      targetPageId,
      status: "active",
      createdBy: "user-1",
    });
    store.close();
    return {
      sourceProjectId,
      targetProjectId,
      sourcePageId,
      targetPageId,
      grantId,
      demo,
    };
  }

  it("advances without target republish, retains last-known-good, and revocation fails closed", async () => {
    const input = await fixture();
    const projector = await import("./reference-projector");
    const first = projector.resolvePublishedReference({
      targetProjectId: input.targetProjectId,
      grantId: input.grantId,
      publishedVersion: "v1",
    });
    expect(first.prototypeHtml).toBe("<main>v1</main>");

    fs.writeFileSync(
      path.join(input.demo, "prototype.html"),
      "<main>v2</main>",
    );
    const second = projector.resolvePublishedReference({
      targetProjectId: input.targetProjectId,
      grantId: input.grantId,
      publishedVersion: "v1",
    });
    expect(second.prototypeHtml).toBe("<main>v2</main>");

    fs.rmSync(path.join(input.demo, "config.schema.json"));
    const fallback = projector.resolvePublishedReference({
      targetProjectId: input.targetProjectId,
      grantId: input.grantId,
      publishedVersion: "v1",
    });
    expect(fallback.prototypeHtml).toBe("<main>v2</main>");

    const { PageTransferStore } = await import("@workbench/project-core");
    const store = new PageTransferStore({ dataDir });
    store.revokeGrant(input.grantId);
    store.close();
    expect(() =>
      projector.resolvePublishedReference({
        targetProjectId: input.targetProjectId,
        grantId: input.grantId,
        publishedVersion: "v1",
      }),
    ).toThrow("引用授权已撤销或失效");
  });
});
