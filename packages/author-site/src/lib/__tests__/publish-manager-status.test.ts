import path from "path";
import fs from "fs";
import os from "os";

let tempDir: string;
let getPublishStatus: typeof import("../publish-manager").getPublishStatus;

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
});

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
});
