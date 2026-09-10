/** @jest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

type FsUtilsModule = typeof import("../fs-utils");

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markdown-reference-workspace-"));
}

function loadFsUtils(dataDir: string): FsUtilsModule {
  jest.resetModules();
  process.env.DATA_DIR = dataDir;
  delete process.env.PROJECTS_DIR;
  return require("../fs-utils") as FsUtilsModule;
}

describe("Markdown 引用项目工作区解析", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalProjectsDir = process.env.PROJECTS_DIR;
  let dataDir: string;

  beforeEach(() => {
    dataDir = makeDataDir();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    jest.resetModules();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalProjectsDir === undefined) delete process.env.PROJECTS_DIR;
    else process.env.PROJECTS_DIR = originalProjectsDir;
  });

  it("两个项目都优先使用项目目录下的 workspace，而不是历史绝对路径", () => {
    const fsUtils = loadFsUtils(dataDir);
    const projects = [fsUtils.createProject("试点项目一"), fsUtils.createProject("试点项目二")];
    const { resolveMarkdownReferenceWorkspace } = require("../markdown-references") as typeof import("../markdown-references");

    for (const project of projects) {
      const localWorkspacePath = path.join(
        fsUtils.getProjectPath(project.id),
        "workspace",
      );
      const staleWorkspacePath = path.join(
        dataDir,
        "old-machine",
        project.id,
        "workspace",
      );
      fs.mkdirSync(staleWorkspacePath, { recursive: true });
      const meta = fsUtils.readProjectMeta(project.id);
      expect(meta).not.toBeNull();
      fsUtils.writeProjectMeta(project.id, {
        ...meta!,
        workspacePath: staleWorkspacePath,
      });

      const context = resolveMarkdownReferenceWorkspace(
        new NextRequest(`http://localhost/api/projects/${project.id}/markdown-references/candidates`),
        project.id,
      );

      expect(context?.workspacePath).toBe(localWorkspacePath);
    }
  });
});
