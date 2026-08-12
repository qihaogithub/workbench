import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("resolveProjectWorkingDir", () => {
  let dataDir: string;
  let resolveProjectWorkingDir: (
    projectId: string,
  ) => Promise<string | null>;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-comment-ai-task-"));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
    const mod = await import("../../src/routes/comment-ai-task");
    resolveProjectWorkingDir = mod.resolveProjectWorkingDir;
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    vi.resetModules();
  });

  function writeProjectMeta(projectId: string, activeWorkspaceId?: string) {
    const projectDir = path.join(dataDir, "projects", projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "project.json"),
      JSON.stringify({
        id: projectId,
        name: "测试项目",
        projectType: "standard",
        workspacePath: path.join(projectDir, "workspace"),
        ...(activeWorkspaceId ? { activeWorkspaceId } : {}),
        demoPages: [],
        demoFolders: [],
        versions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    fs.mkdirSync(path.join(projectDir, "workspace"), { recursive: true });
  }

  function writeLiveWorkspace(projectId: string, workspaceId: string) {
    const wsPath = path.join(
      dataDir,
      "workspaces",
      "projects",
      projectId,
      workspaceId,
    );
    fs.mkdirSync(path.join(wsPath, "demos", "home"), { recursive: true });
    fs.writeFileSync(
      path.join(wsPath, ".workspace.json"),
      JSON.stringify({ scope: "live", projectId, workspaceId }),
    );
    fs.writeFileSync(
      path.join(wsPath, "demos", "home", "index.tsx"),
      "export default () => null;",
    );
    return wsPath;
  }

  it("存在 active live workspace 时解析到 live workspace 路径", () => {
    const projectId = "proj_test_active";
    const workspaceId = "live-active-1";
    writeProjectMeta(projectId, workspaceId);
    const livePath = writeLiveWorkspace(projectId, workspaceId);
    writeLiveWorkspace(projectId, "live-stale-2");

    return expect(resolveProjectWorkingDir(projectId)).resolves.toBe(livePath);
  });

  it("active live workspace 未命中时回退到项目基准工作区", () => {
    const projectId = "proj_test_miss";
    writeProjectMeta(projectId, "live-not-exist");
    const projectDir = path.join(dataDir, "projects", projectId);

    return expect(resolveProjectWorkingDir(projectId)).resolves.toBe(
      path.join(projectDir, "workspace"),
    );
  });

  it("无 activeWorkspaceId 时直接回退到项目基准工作区", () => {
    const projectId = "proj_test_no_active";
    writeProjectMeta(projectId);
    const projectDir = path.join(dataDir, "projects", projectId);

    return expect(resolveProjectWorkingDir(projectId)).resolves.toBe(
      path.join(projectDir, "workspace"),
    );
  });

  it("项目不存在时返回 null", async () => {
    const resolved = await resolveProjectWorkingDir("proj_not_exist");
    expect(resolved).toBeNull();
  });
});