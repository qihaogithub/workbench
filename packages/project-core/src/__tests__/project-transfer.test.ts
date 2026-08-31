import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildProjectManifest,
  createProjectArchive,
  diffProjectManifests,
  importProjectArchive,
} from "../project-transfer.js";

let sourceDir: string;
let targetDir: string;

beforeEach(() => {
  sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-transfer-source-"));
  targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-transfer-target-"));
});

afterEach(() => {
  fs.rmSync(sourceDir, { recursive: true, force: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
});

function writeProject(dataDir: string, projectId: string): void {
  const projectDir = path.join(dataDir, "projects", projectId);
  fs.mkdirSync(path.join(projectDir, "workspace", "demos", "page-1"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(projectDir, "content"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify({
      id: projectId,
      name: "同步项目",
      activeWorkspaceId: "workspace-stale",
      activeWorkspaceUpdatedAt: 1,
      canonicalSyncedWorkspaceId: "workspace-stale",
      canonicalSyncedRevision: 3,
      canonicalSyncedRootHash: "root-stale",
      versions: [{ versionId: "v1" }],
      publishedVersion: "v1",
      publishedAt: 1,
    }),
  );
  fs.writeFileSync(
    path.join(projectDir, "workspace", "demos", "page-1", "index.tsx"),
    "export default function Page() { return null }\n",
  );
  fs.writeFileSync(
    path.join(projectDir, "content", "state.json"),
    JSON.stringify({ headCommitId: "commit-1" }),
  );
}

describe("project transfer", () => {
  it("生成稳定清单并识别新增、删除和变更", () => {
    writeProject(sourceDir, "project-1");
    writeProject(targetDir, "project-1");
    const targetProjectDir = path.join(targetDir, "projects", "project-1");
    fs.writeFileSync(path.join(targetProjectDir, "extra.txt"), "remote only");
    fs.writeFileSync(
      path.join(targetProjectDir, "content", "state.json"),
      JSON.stringify({ headCommitId: "commit-2" }),
    );

    const local = buildProjectManifest(sourceDir, "project-1");
    const remote = buildProjectManifest(targetDir, "project-1");
    const diff = diffProjectManifests(local, remote);

    expect(local.files.map((file) => file.path)).toEqual([
      "content/state.json",
      "project.json",
      "workspace/demos/page-1/index.tsx",
    ]);
    expect(diff).toEqual({
      added: [],
      removed: ["extra.txt"],
      changed: ["content/state.json"],
      identical: false,
    });
  });

  it("导入全量归档、备份旧项目并清理目标环境悬空状态", async () => {
    writeProject(sourceDir, "project-1");
    writeProject(targetDir, "project-1");
    fs.writeFileSync(
      path.join(targetDir, "projects", "project-1", "old.txt"),
      "old target",
    );

    const archive = await createProjectArchive(sourceDir, "project-1");
    const result = await importProjectArchive(
      targetDir,
      "project-1",
      archive,
    );

    expect(result.fileCount).toBe(3);
    expect(result.backupPath).toBeDefined();
    expect(fs.existsSync(path.join(result.backupPath ?? "", "old.txt"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(
          targetDir,
          "projects",
          "project-1",
          "workspace",
          "demos",
          "page-1",
          "index.tsx",
        ),
      ),
    ).toBe(true);
    const imported = JSON.parse(
      fs.readFileSync(
        path.join(targetDir, "projects", "project-1", "project.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;
    expect(imported.activeWorkspaceId).toBeUndefined();
    expect(imported.canonicalSyncedWorkspaceId).toBeUndefined();
    expect(imported.versions).toEqual([]);
    expect(imported.publishedVersion).toBeUndefined();
    expect(typeof imported.updatedAt).toBe("number");
  });

  it("导入时以 workspace-tree.json 重建 project.json 页面投影", async () => {
    writeProject(sourceDir, "project-1");
    const projectDir = path.join(sourceDir, "projects", "project-1");
    const workspaceDir = path.join(projectDir, "workspace");
    const pageIds = ["page-1", "page-2", "page-3"];
    for (const pageId of pageIds.slice(1)) {
      const pageDir = path.join(workspaceDir, "demos", pageId);
      fs.mkdirSync(pageDir, { recursive: true });
      fs.writeFileSync(path.join(pageDir, "index.tsx"), "// page", "utf-8");
      fs.writeFileSync(path.join(pageDir, "config.schema.json"), "{}", "utf-8");
    }
    fs.writeFileSync(
      path.join(workspaceDir, "workspace-tree.json"),
      JSON.stringify({
        folders: [],
        pages: pageIds.map((id, order) => ({
          id,
          name: id,
          order,
          parentId: null,
          runtimeType: "high-fidelity-react",
        })),
      }),
      "utf-8",
    );
    const sourceMetaPath = path.join(projectDir, "project.json");
    const sourceMeta = JSON.parse(fs.readFileSync(sourceMetaPath, "utf-8"));
    sourceMeta.demoPages = [
      { id: "page-1", name: "旧投影", order: 0, parentId: null },
    ];
    fs.writeFileSync(sourceMetaPath, JSON.stringify(sourceMeta), "utf-8");

    const archive = await createProjectArchive(sourceDir, "project-1");
    await importProjectArchive(targetDir, "project-1", archive);

    const imported = JSON.parse(
      fs.readFileSync(
        path.join(targetDir, "projects", "project-1", "project.json"),
        "utf-8",
      ),
    ) as { demoPages?: Array<{ id: string }>; demoFolders?: unknown[] };
    expect(imported.demoPages?.map((page) => page.id)).toEqual(pageIds);
    expect(imported.demoFolders).toEqual([]);
  });
});
