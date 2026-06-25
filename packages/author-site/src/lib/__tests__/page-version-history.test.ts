import fs from "fs";
import os from "os";
import path from "path";
import type { Project } from "@opencode-workbench/shared";

function makeTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "owb-page-versions-"));
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function importFsUtils(dataDir: string) {
  jest.resetModules();
  process.env.DATA_DIR = dataDir;
  process.env.PROJECTS_DIR = path.join(dataDir, "projects");
  process.env.SESSIONS_DIR = path.join(dataDir, "sessions");
  process.env.WORKSPACES_DIR = path.join(dataDir, "workspaces");
  process.env.SNAPSHOTS_DIR = path.join(dataDir, "snapshots");

  return import("../fs-utils");
}

function writeDemoPage(
  workspacePath: string,
  demoId: string,
  code: string,
  schema: string,
): void {
  const demoDir = path.join(workspacePath, "demos", demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, "index.tsx"), code, "utf-8");
  fs.writeFileSync(path.join(demoDir, "config.schema.json"), schema, "utf-8");
}

function writeProject(dataDir: string, projectId = "proj_page_versions"): string {
  const projectPath = path.join(dataDir, "projects", projectId);
  const workspacePath = path.join(projectPath, "workspace");
  fs.mkdirSync(workspacePath, { recursive: true });
  writeDemoPage(workspacePath, "home", "// home v1", '{"title":"v1"}');
  writeDemoPage(workspacePath, "about", "// about current", '{"title":"about"}');
  fs.writeFileSync(
    path.join(workspacePath, "workspace-tree.json"),
    JSON.stringify(
      {
        folders: [],
        pages: [
          { id: "home", name: "首页", order: 0, parentId: null },
          { id: "about", name: "关于", order: 1, parentId: null },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  const now = Date.now();
  const project: Project = {
    id: projectId,
    name: "页面版本测试项目",
    workspacePath,
    demoPages: [
      { id: "home", name: "首页", order: 0, parentId: null },
      { id: "about", name: "关于", order: 1, parentId: null },
    ],
    demoFolders: [],
    versions: [],
    pageVersions: {},
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(project, null, 2),
    "utf-8",
  );

  return workspacePath;
}

describe("页面级版本历史", () => {
  const originalEnv = { ...process.env };
  let dataDir: string;

  beforeEach(() => {
    dataDir = makeTempDataDir();
  });

  afterEach(() => {
    cleanup(dataDir);
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("可创建页面快照、读取历史文件，并按全局版本号递增", async () => {
    const workspacePath = writeProject(dataDir);
    const {
      createPageVersionSnapshot,
      getPageVersionHistory,
      readPageVersionFiles,
    } = await importFsUtils(dataDir);

    const first = createPageVersionSnapshot(
      "proj_page_versions",
      "home",
      "alice",
      "首个页面快照",
    );
    expect(first.success).toBe(true);
    expect(first.version?.versionId).toBe("v1");
    expect(first.version?.fileCount).toBe(2);
    expect(first.version?.savedBy).toBe("alice");

    writeDemoPage(workspacePath, "home", "// home v2", '{"title":"v2"}');
    const second = createPageVersionSnapshot(
      "proj_page_versions",
      "home",
      "alice",
      "第二个页面快照",
    );
    expect(second.version?.versionId).toBe("v2");

    const history = getPageVersionHistory("proj_page_versions", "home");
    expect(history.map((version) => version.versionId)).toEqual(["v2", "v1"]);

    const files = readPageVersionFiles("proj_page_versions", "home", "v1");
    expect(files).toEqual({
      code: "// home v1",
      schema: '{"title":"v1"}',
    });
  });

  it("恢复页面版本只替换目标页面，并生成项目级恢复记录", async () => {
    const workspacePath = writeProject(dataDir);
    const {
      createPageVersionSnapshot,
      getPageVersionHistory,
      readProjectMeta,
      restorePageVersion,
    } = await importFsUtils(dataDir);

    createPageVersionSnapshot("proj_page_versions", "home", "alice", "v1");
    writeDemoPage(workspacePath, "home", "// home v2", '{"title":"v2"}');
    createPageVersionSnapshot("proj_page_versions", "home", "alice", "v2");

    const restored = restorePageVersion(
      "proj_page_versions",
      "home",
      "v1",
      "bob",
    );
    expect(restored.success).toBe(true);
    expect(restored.newVersionId).toBe("v3");
    expect(restored.files).toEqual({
      code: "// home v1",
      schema: '{"title":"v1"}',
    });

    expect(
      fs.readFileSync(
        path.join(workspacePath, "demos", "home", "index.tsx"),
        "utf-8",
      ),
    ).toBe("// home v1");
    expect(
      fs.readFileSync(
        path.join(workspacePath, "demos", "about", "index.tsx"),
        "utf-8",
      ),
    ).toBe("// about current");

    const project = readProjectMeta("proj_page_versions");
    expect(project?.versions).toHaveLength(1);
    expect(project?.versions[0]).toMatchObject({
      versionId: "v3",
      savedBy: "bob",
      sessionId: "restore-page-home-v1",
    });
    expect(project?.versions[0].note).toContain("历史版本 v1");
    expect(getPageVersionHistory("proj_page_versions", "home")).toHaveLength(2);
  });

  it("创建页面快照时优先使用传入的临时 workspace 内容", async () => {
    const officialWorkspace = writeProject(dataDir);
    const sessionWorkspace = path.join(dataDir, "workspaces", "ws-current");
    fs.mkdirSync(sessionWorkspace, { recursive: true });
    writeDemoPage(
      sessionWorkspace,
      "home",
      "// home from session",
      '{"title":"session"}',
    );
    fs.writeFileSync(
      path.join(sessionWorkspace, "workspace-tree.json"),
      JSON.stringify(
        {
          folders: [],
          pages: [{ id: "home", name: "首页草稿", order: 0, parentId: null }],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { createPageVersionSnapshot, readPageVersionFiles } =
      await importFsUtils(dataDir);

    const result = createPageVersionSnapshot(
      "proj_page_versions",
      "home",
      "alice",
      "来自临时工作区",
      sessionWorkspace,
    );
    expect(result.success).toBe(true);
    expect(result.version?.demoName).toBe("首页草稿");

    expect(readPageVersionFiles("proj_page_versions", "home", "v1")).toEqual({
      code: "// home from session",
      schema: '{"title":"session"}',
    });
    expect(
      fs.readFileSync(
        path.join(officialWorkspace, "demos", "home", "index.tsx"),
        "utf-8",
      ),
    ).toBe("// home v1");
  });
});
