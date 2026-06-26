import fs from "fs";
import os from "os";
import path from "path";

type FsUtilsModule = typeof import("../fs-utils");

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "project-templates-"));
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function loadFsUtils(dataDir: string): FsUtilsModule {
  jest.resetModules();
  process.env.DATA_DIR = dataDir;
  delete process.env.PROJECTS_DIR;
  delete process.env.TEMPLATES_DIR;
  return require("../fs-utils") as FsUtilsModule;
}

function addPageToProject(
  fsUtils: FsUtilsModule,
  projectId: string,
  name = "模板页面",
): void {
  const project = fsUtils.readProjectMeta(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const workspacePath = path.join(
    fsUtils.getProjectPath(projectId),
    "workspace",
  );
  const demoId = fsUtils.generateDemoPageId(name);
  const demoDir = path.join(workspacePath, "demos", demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(
    path.join(demoDir, "index.tsx"),
    "export default function Page() { return null; }",
    "utf-8",
  );
  fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");

  const page = fsUtils.writeDemoPageMeta(workspacePath, demoId, {
    name,
    order: 0,
    parentId: null,
  });
  fsUtils.writeProjectMeta(projectId, {
    ...project,
    demoPages: [page],
  });
}

describe("项目模板", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalProjectsDir = process.env.PROJECTS_DIR;
  const originalTemplatesDir = process.env.TEMPLATES_DIR;
  let dataDir: string;

  beforeEach(() => {
    dataDir = makeDataDir();
  });

  afterEach(() => {
    cleanup(dataDir);
    jest.resetModules();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalProjectsDir === undefined) delete process.env.PROJECTS_DIR;
    else process.env.PROJECTS_DIR = originalProjectsDir;
    if (originalTemplatesDir === undefined) delete process.env.TEMPLATES_DIR;
    else process.env.TEMPLATES_DIR = originalTemplatesDir;
  });

  it("保存模板会复制 workspace 并写入模板元数据", () => {
    const fsUtils = loadFsUtils(dataDir);
    const project = fsUtils.createProject("源项目");
    addPageToProject(fsUtils, project.id);

    const template = fsUtils.saveProjectAsTemplate(project.id, {
      category: "营销活动",
      name: "活动模板",
      description: "适合快速创建营销活动页",
    });

    const templatePath = fsUtils.getTemplatePath(template.id);
    expect(fs.existsSync(path.join(templatePath, "template.json"))).toBe(true);
    expect(fs.existsSync(path.join(templatePath, "workspace"))).toBe(true);
    expect(template.sourceProjectId).toBe(project.id);
    expect(template.category).toBe("营销活动");
    expect(template.demoCount).toBeGreaterThanOrEqual(1);
    expect(template.demoPages?.length).toBe(template.demoCount);
    expect(
      fs.existsSync(
        path.join(dataDir, "knowledge", "templates", template.id, "reading-map.json"),
      ),
    ).toBe(true);
  });

  it("保存模板会在历史 workspacePath 失效时回退到项目目录", () => {
    const fsUtils = loadFsUtils(dataDir);
    const project = fsUtils.createProject("旧路径项目");
    addPageToProject(fsUtils, project.id);
    const meta = fsUtils.readProjectMeta(project.id);
    expect(meta).not.toBeNull();

    fsUtils.writeProjectMeta(project.id, {
      ...meta!,
      workspacePath: path.join(dataDir, "missing", "workspace"),
    });

    const template = fsUtils.saveProjectAsTemplate(project.id, {
      category: "历史数据",
      name: "旧路径模板",
      description: "覆盖旧绝对路径迁移后的保存模板场景",
    });

    expect(template.sourceProjectId).toBe(project.id);
    expect(
      fs.existsSync(path.join(fsUtils.getTemplatePath(template.id), "workspace")),
    ).toBe(true);
  });

  it("保存模板会排除 workspace 运行产物", () => {
    const fsUtils = loadFsUtils(dataDir);
    const project = fsUtils.createProject("含运行产物项目");
    const sourceRuntimePath = path.join(
      fsUtils.getProjectPath(project.id),
      "workspace",
      ".opencode",
    );
    fs.mkdirSync(sourceRuntimePath, { recursive: true });
    fs.writeFileSync(path.join(sourceRuntimePath, ".gitignore"), "*", "utf-8");

    const template = fsUtils.saveProjectAsTemplate(project.id, {
      category: "运行产物",
      name: "干净模板",
      description: "模板快照不包含运行目录",
    });

    expect(
      fs.existsSync(
        path.join(fsUtils.getTemplatePath(template.id), "workspace", ".opencode"),
      ),
    ).toBe(false);
  });

  it("从模板创建项目会生成新项目并保持模板快照不变", () => {
    const fsUtils = loadFsUtils(dataDir);
    const source = fsUtils.createProject("源项目");
    addPageToProject(fsUtils, source.id);
    const template = fsUtils.saveProjectAsTemplate(source.id, {
      category: "商品",
      name: "商品模板",
      description: "商品详情页模板",
    });
    const templateJsonPath = path.join(
      fsUtils.getTemplatePath(template.id),
      "template.json",
    );
    const beforeTemplateJson = fs.readFileSync(templateJsonPath, "utf-8");

    const created = fsUtils.createProject("从模板创建", template.id);
    const createdMeta = fsUtils.readProjectMeta(created.id);

    expect(created.id).not.toBe(source.id);
    expect(created.name).toBe("从模板创建");
    expect(createdMeta?.workspacePath).toBe(
      path.join(fsUtils.getProjectPath(created.id), "workspace"),
    );
    expect(createdMeta?.demoPages.length).toBe(template.demoCount);
    expect(fs.readFileSync(templateJsonPath, "utf-8")).toBe(beforeTemplateJson);
  });

  it("删除源项目后模板仍可用于创建", () => {
    const fsUtils = loadFsUtils(dataDir);
    const source = fsUtils.createProject("源项目");
    addPageToProject(fsUtils, source.id);
    const template = fsUtils.saveProjectAsTemplate(source.id, {
      category: "表单",
      name: "表单模板",
      description: "表单页面模板",
    });

    expect(fsUtils.deleteProject(source.id)).toBe(true);
    const created = fsUtils.createProject("独立模板项目", template.id);

    expect(created.name).toBe("独立模板项目");
    expect(fsUtils.projectExists(created.id)).toBe(true);
  });

  it("空白创建不再添加默认页面", () => {
    const fsUtils = loadFsUtils(dataDir);
    const project = fsUtils.createProject("空白项目");
    const meta = fsUtils.readProjectMeta(project.id);

    expect(project.name).toBe("空白项目");
    expect(meta?.demoPages).toEqual([]);
    expect(
      fs.existsSync(path.join(fsUtils.getProjectPath(project.id), "workspace")),
    ).toBe(true);
  });
});
