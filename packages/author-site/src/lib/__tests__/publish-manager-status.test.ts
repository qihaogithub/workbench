import path from "path";
import fs from "fs";
import os from "os";

let tempDir: string;
let getPublishStatus: typeof import("../publish-manager").getPublishStatus;
let publishProject: typeof import("../publish-manager").publishProject;

function setupProject(
  projectId: string,
  overrides: {
    versions?: Array<{ versionId: string }>;
    publishedVersion?: string | null;
    publishedAt?: number | null;
  } = {},
) {
  const projectDir = path.join(tempDir, "projects", projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  const project = {
    id: projectId,
    name: "测试项目",
    workspacePath: path.join(projectDir, "workspace"),
    demoPages: [],
    demoFolders: [],
    versions: (overrides.versions || []).map((v) => ({
      versionId: v.versionId,
      savedAt: Date.now(),
      savedBy: "测试用户",
      sessionId: "test-session",
      snapshotPath: path.join(tempDir, "snapshots", projectId, v.versionId),
      fileCount: 1,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    publishedVersion: overrides.publishedVersion === undefined
      ? undefined
      : (overrides.publishedVersion as string | undefined),
    publishedAt: overrides.publishedAt === undefined
      ? undefined
      : (overrides.publishedAt as number | undefined),
  };

  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify(project, null, 2),
  );
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-test-"));
  process.env.DATA_DIR = tempDir;
  jest.resetModules();
  getPublishStatus = require("../publish-manager").getPublishStatus;
  publishProject = require("../publish-manager").publishProject;
});

function setupPublishableProject(projectId: string) {
  const projectDir = path.join(tempDir, "projects", projectId);
  const workspacePath = path.join(projectDir, "workspace");
  const demoDir = path.join(workspacePath, "demos", "home");
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(
    path.join(demoDir, "index.tsx"),
    "export default function Demo() { return <div>hello</div>; }",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    JSON.stringify({ type: "object", properties: {} }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "workspace-tree.json"),
    JSON.stringify({
      folders: [],
      pages: [{ id: "home", name: "首页", order: 0, parentId: null }],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "app.graph.json"),
    JSON.stringify({ version: 1, entry: "home", pages: {}, actions: [], state: {} }),
    "utf-8",
  );

  const now = Date.now();
  const project = {
    id: projectId,
    name: "可发布项目",
    workspacePath,
    demoPages: [{ id: "home", name: "首页", order: 0, parentId: null }],
    demoFolders: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify(project, null, 2),
  );
}

function setupPageScreenshot(projectId: string, pageId: string) {
  const screenshotsDir = path.join(tempDir, "screenshots", projectId);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.writeFileSync(path.join(screenshotsDir, `${pageId}.png`), "png", "utf-8");
}

afterAll(() => {
  delete process.env.DATA_DIR;
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("getPublishStatus", () => {
  it("从未发布的项目应返回 never_published", () => {
    setupProject("proj-never", {
      versions: [{ versionId: "v1" }],
      publishedVersion: undefined,
    });

    const result = getPublishStatus("proj-never");
    expect(result.status).toBe("never_published");
    expect(result.publishedVersion).toBeNull();
    expect(result.hasUnpublishedChanges).toBe(false);
  });

  it("已发布且当前版本等于发布版本应返回 published", () => {
    setupProject("proj-published", {
      versions: [{ versionId: "v1" }, { versionId: "v2" }],
      publishedVersion: "v2",
    });

    const result = getPublishStatus("proj-published");
    expect(result.status).toBe("published");
    expect(result.publishedVersion).toBe("v2");
    expect(result.hasUnpublishedChanges).toBe(false);
  });

  it("已发布但当前版本超前应返回 unpublished_changes", () => {
    setupProject("proj-unpub", {
      versions: [
        { versionId: "v1" },
        { versionId: "v2" },
        { versionId: "v3" },
      ],
      publishedVersion: "v1",
    });

    const result = getPublishStatus("proj-unpub");
    expect(result.status).toBe("unpublished_changes");
    expect(result.publishedVersion).toBe("v1");
    expect(result.hasUnpublishedChanges).toBe(true);
  });

  it("publishedVersion 指向不存在的版本号时应视为 never_published", () => {
    setupProject("proj-invalid", {
      versions: [{ versionId: "v1" }, { versionId: "v2" }],
      publishedVersion: "v99",
    });

    const result = getPublishStatus("proj-invalid");
    expect(result.status).toBe("never_published");
    expect(result.publishedVersion).toBeNull();
    expect(result.publishedAt).toBeNull();
    expect(result.hasUnpublishedChanges).toBe(false);
  });

  it("不存在的项目应抛出 PROJECT_NOT_FOUND 错误", () => {
    expect(() => getPublishStatus("proj-nonexistent")).toThrow(
      "PROJECT_NOT_FOUND",
    );
  });

  it("已发布版本存在于版本列表中且不是最新时应正确识别", () => {
    setupProject("proj-middle", {
      versions: [
        { versionId: "v1" },
        { versionId: "v2" },
        { versionId: "v3" },
      ],
      publishedVersion: "v2",
    });

    const result = getPublishStatus("proj-middle");
    expect(result.status).toBe("unpublished_changes");
    expect(result.publishedVersion).toBe("v2");
    expect(result.currentVersion).toBe("v3");
  });

  it("发布前应创建发布快照并指向该版本", async () => {
    setupPublishableProject("proj-publish-snapshot");

    const result = await publishProject("proj-publish-snapshot");
    expect(result.publishedVersion).toBe("v1");

    const project = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "projects", "proj-publish-snapshot", "project.json"),
        "utf-8",
      ),
    );
    expect(project.publishedVersion).toBe("v1");
    expect(project.versions).toHaveLength(1);
    expect(project.versions[0]).toMatchObject({
      versionId: "v1",
      type: "publish_snapshot",
      note: "发布快照",
    });
  });

  it("发布时应将页面截图复制到发布包并写入静态路径", async () => {
    setupPublishableProject("proj-publish-screenshot");
    setupPageScreenshot("proj-publish-screenshot", "home");

    await publishProject("proj-publish-screenshot");

    const publishedProjectDir = path.join(
      tempDir,
      "published",
      "proj-publish-screenshot",
    );
    const project = JSON.parse(
      fs.readFileSync(path.join(publishedProjectDir, "project.json"), "utf-8"),
    );
    expect(project.demoPages[0].screenshotPath).toBe("screenshots/home.png");
    expect(
      fs.existsSync(path.join(publishedProjectDir, "screenshots", "home.png")),
    ).toBe(true);
  });

  it("发布 iframe 使用编译产物 URL 而不是内联模块代码", async () => {
    setupPublishableProject("proj-publish-module-url");

    await publishProject("proj-publish-module-url");

    const iframeHtml = fs.readFileSync(
      path.join(
        tempDir,
        "published",
        "proj-publish-module-url",
        "demos",
        "home",
        "iframe.html",
      ),
      "utf-8",
    );
    const publishedProject = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "published", "proj-publish-module-url", "project.json"),
        "utf-8",
      ),
    );

    expect(iframeHtml).toContain("const initialCode = null;");
    expect(iframeHtml).toMatch(
      new RegExp(
        'const initialCodeUrl = "/data/proj-publish-module-url/demos/home/compiled[.]js[?]v=[0-9]+";',
      ),
    );
    expect(iframeHtml).toContain("loadModuleFromUrl(initialCodeUrl, updateVersion);");
    expect(iframeHtml).not.toContain(
      "const initialCode = \"import",
    );
    expect(publishedProject.demoPages[0].compiledJsPath).toBe(
      "demos/home/compiled.js",
    );
    expect(publishedProject.demoPages[0].iframeHtmlPath).toMatch(
      /^demos\/home\/iframe\.html\?v=\d+$/,
    );
  });

  it("发布共享配置上传图时应写入本地化运行值并覆盖页面默认值", async () => {
    const projectId = "proj-publish-config-values";
    setupPublishableProject(projectId);
    const workspacePath = path.join(tempDir, "projects", projectId, "workspace");
    const demoDir = path.join(workspacePath, "demos", "home");
    const sessionAssetUrl = "/api/sessions/session-config/assets/popup.png";
    const sessionAssetDir = path.join(
      tempDir,
      "sessions",
      "session-config",
      "assets",
      "images",
    );

    fs.mkdirSync(sessionAssetDir, { recursive: true });
    fs.writeFileSync(path.join(sessionAssetDir, "popup.png"), "uploaded-image");
    fs.writeFileSync(
      path.join(workspacePath, "project.config.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          modalImage: {
            type: "string",
            format: "image",
            default: "project-default",
          },
        },
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(workspacePath, "project.config.values.json"),
      JSON.stringify({ modalImage: sessionAssetUrl }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(demoDir, "config.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          modalImage: {
            type: "string",
            format: "image",
            default: "page-default",
          },
        },
      }),
      "utf-8",
    );

    await publishProject(projectId);

    const publishedProjectDir = path.join(tempDir, "published", projectId);
    const configValues = JSON.parse(
      fs.readFileSync(path.join(publishedProjectDir, "config-values.json"), "utf-8"),
    ) as { modalImage?: string };
    const publishedProject = JSON.parse(
      fs.readFileSync(path.join(publishedProjectDir, "project.json"), "utf-8"),
    ) as { projectConfigValues?: { modalImage?: string } };
    const iframeHtml = fs.readFileSync(
      path.join(publishedProjectDir, "demos", "home", "iframe.html"),
      "utf-8",
    );
    const publishedModalImage = configValues.modalImage;

    expect(publishedModalImage).toBeDefined();
    expect(publishedModalImage).toMatch(
      /^\/data\/proj-publish-config-values\/assets\/images\/[a-f0-9]{24}\.png$/,
    );
    expect(publishedProject.projectConfigValues?.modalImage).toBe(
      publishedModalImage,
    );
    expect(iframeHtml).toContain(`"modalImage":"${publishedModalImage}"`);
    expect(iframeHtml).not.toContain(sessionAssetUrl);
    expect(iframeHtml).not.toContain("page-default");
    expect(
      fs.existsSync(
        path.join(
          publishedProjectDir,
          publishedModalImage?.replace(`/data/${projectId}/`, "") ?? "",
        ),
      ),
    ).toBe(true);
  });

  it("发布快照创建后应推进已同步 live workspace 的版本基线", async () => {
    setupPublishableProject("proj-publish-live-base");
    const projectPath = path.join(tempDir, "projects", "proj-publish-live-base");
    const workspacePath = path.join(projectPath, "workspace");
    const liveWorkspaceId = "live-publish-base";
    const liveWorkspacePath = path.join(
      tempDir,
      "workspaces",
      "projects",
      "proj-publish-live-base",
      liveWorkspaceId,
    );
    const now = Date.now();

    fs.mkdirSync(path.dirname(liveWorkspacePath), { recursive: true });
    fs.cpSync(workspacePath, liveWorkspacePath, { recursive: true });
    fs.writeFileSync(
      path.join(liveWorkspacePath, ".workspace.json"),
      JSON.stringify(
        {
          workspaceId: liveWorkspaceId,
          demoId: "proj-publish-live-base",
          projectId: "proj-publish-live-base",
          scope: "live",
          status: "active",
          baseVersion: "v0",
          createdAt: now,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const projectFile = path.join(projectPath, "project.json");
    const project = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
    fs.writeFileSync(
      projectFile,
      JSON.stringify(
        {
          ...project,
          activeWorkspaceId: liveWorkspaceId,
          activeWorkspaceUpdatedAt: now,
          canonicalSyncedWorkspaceId: liveWorkspaceId,
          canonicalSyncedAt: now + 1,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await publishProject("proj-publish-live-base");

    expect(result.publishedVersion).toBe("v1");
    const workspaceMeta = JSON.parse(
      fs.readFileSync(path.join(liveWorkspacePath, ".workspace.json"), "utf-8"),
    );
    expect(workspaceMeta.baseVersion).toBe("v1");
  });

  it("重新发布会替换旧发布目录并排除临时目录索引", async () => {
    setupPublishableProject("proj-republish-clean");

    await publishProject("proj-republish-clean");
    const publishedDir = path.join(tempDir, "published", "proj-republish-clean");
    fs.writeFileSync(path.join(publishedDir, "stale.js"), "old artifact", "utf-8");
    fs.mkdirSync(path.join(tempDir, "published", ".tmp", "stale-temp"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "published", ".tmp", "stale-temp", "project.json"),
      JSON.stringify({
        id: "stale-temp",
        name: "临时目录",
        publishedAt: Date.now(),
        publishedVersion: "v1",
        demoPages: [],
      }),
      "utf-8",
    );

    await publishProject("proj-republish-clean");

    expect(fs.existsSync(path.join(publishedDir, "stale.js"))).toBe(false);
    const index = JSON.parse(
      fs.readFileSync(path.join(tempDir, "published", "projects-index.json"), "utf-8"),
    ) as { projects: Array<{ id: string }> };
    expect(index.projects.map((project) => project.id)).toContain(
      "proj-republish-clean",
    );
    expect(index.projects.map((project) => project.id)).not.toContain(
      "stale-temp",
    );
  });
});
