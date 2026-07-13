import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceFilePersistence } from "../../src/collab/workspace-file-persistence";

let tempDir: string;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-persistence-"));
  const workspacePath = path.join(tempDir, "workspaces", "user-1", "proj-1", "ws-1");
  fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, "knowledge"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "old", "utf-8");
  fs.writeFileSync(path.join(workspacePath, "demos", "page-1", "prototype.html"), "<main>old</main>", "utf-8");
  fs.writeFileSync(path.join(workspacePath, "demos", "page-1", "prototype.css"), "main { color: black; }", "utf-8");
  fs.writeFileSync(path.join(workspacePath, "demos", "page-1", "config.schema.json"), "{}", "utf-8");
  fs.writeFileSync(path.join(workspacePath, "knowledge", "产品规则.md"), "# 产品规则", "utf-8");
  writeJson(path.join(workspacePath, ".workspace.json"), {
    workspaceId: "ws-1",
    demoId: "proj-1",
    userId: "user-1",
    updatedAt: 1,
  });
  writeJson(path.join(tempDir, "sessions", "user-1", "proj-1", "session-1", ".session.json"), {
    sessionId: "session-1",
    demoId: "proj-1",
    userId: "user-1",
    workspaceId: "ws-1",
    expiresAt: Date.now() + 60_000,
  });
  writeJson(path.join(tempDir, "sessions", "user-2", "proj-1", "session-2", ".session.json"), {
    sessionId: "session-2",
    demoId: "proj-1",
    userId: "user-2",
    workspaceId: "ws-1",
    expiresAt: Date.now() + 60_000,
  });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("WorkspaceFilePersistence", () => {
  it("从包目录启动且未设置 DATA_DIR 时解析到仓库根 data", () => {
    const originalCwd = process.cwd();
    const originalDataDir = process.env.DATA_DIR;
    const repoRoot = path.join(tempDir, "repo");
    const packageDir = path.join(repoRoot, "packages", "agent-service");
    const dataDir = path.join(repoRoot, "data");
    const workspacePath = path.join(dataDir, "workspaces", "user-1", "proj-1", "ws-root");

    fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf-8");
    fs.writeFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "root", "utf-8");
    writeJson(path.join(workspacePath, ".workspace.json"), {
      workspaceId: "ws-root",
      demoId: "proj-1",
      userId: "user-1",
      updatedAt: 1,
    });
    writeJson(path.join(dataDir, "sessions", "user-1", "proj-1", "session-root", ".session.json"), {
      sessionId: "session-root",
      demoId: "proj-1",
      userId: "user-1",
      workspaceId: "ws-root",
      expiresAt: Date.now() + 60_000,
    });

    try {
      delete process.env.DATA_DIR;
      process.chdir(packageDir);

      const persistence = new WorkspaceFilePersistence();
      const result = persistence.validateWorkspaceSession({
        projectId: "proj-1",
        workspaceId: "ws-root",
        sessionId: "session-root",
      });

      expect(fs.realpathSync(persistence.dataDir)).toBe(fs.realpathSync(dataDir));
      expect(result.ok).toBe(true);
      expect(result.workspacePath ? fs.realpathSync(result.workspacePath) : "").toBe(
        fs.realpathSync(workspacePath),
      );
    } finally {
      process.chdir(originalCwd);
      if (originalDataDir === undefined) {
        delete process.env.DATA_DIR;
      } else {
        process.env.DATA_DIR = originalDataDir;
      }
    }
  });

  it("校验 session 与 workspace 归属后允许页面代码协同", () => {
    const persistence = new WorkspaceFilePersistence(tempDir);

    const result = persistence.validateSession({
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
    });

    expect(result.ok).toBe(true);
    expect(result.workspacePath).toContain(path.join("workspaces", "user-1", "proj-1", "ws-1"));
  });

  it("允许 HTML/CSS 原型页源码进入独立协同房间", () => {
    const persistence = new WorkspaceFilePersistence(tempDir);

    expect(
      persistence.validateSession({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
        resourcePath: "demos/page-1/prototype.html",
        kind: "page-prototype-html",
      }).ok,
    ).toBe(true);
    expect(
      persistence.validateSession({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
        resourcePath: "demos/page-1/prototype.css",
        kind: "page-prototype-css",
      }).ok,
    ).toBe(true);
  });

  it("允许不同用户通过各自 session 协作同一个 workspace", () => {
    const persistence = new WorkspaceFilePersistence(tempDir);

    const result = persistence.validateSession({
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-2",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
    });

    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-2");
    expect(result.workspacePath).toContain(path.join("workspaces", "user-1", "proj-1", "ws-1"));
  });

  it("允许项目级 live workspace 作为共享协作边界", () => {
    const liveWorkspacePath = path.join(tempDir, "workspaces", "projects", "proj-1", "live-1");
    fs.mkdirSync(path.join(liveWorkspacePath, "demos", "page-1"), { recursive: true });
    fs.writeFileSync(path.join(liveWorkspacePath, "demos", "page-1", "index.tsx"), "live", "utf-8");
    writeJson(path.join(liveWorkspacePath, ".workspace.json"), {
      workspaceId: "live-1",
      demoId: "proj-1",
      projectId: "proj-1",
      scope: "live",
      status: "active",
      updatedAt: 1,
    });
    writeJson(path.join(tempDir, "sessions", "user-3", "proj-1", "session-3", ".session.json"), {
      sessionId: "session-3",
      demoId: "proj-1",
      userId: "user-3",
      workspaceId: "live-1",
      expiresAt: Date.now() + 60_000,
    });

    const persistence = new WorkspaceFilePersistence(tempDir);
    const result = persistence.validateSession({
      projectId: "proj-1",
      workspaceId: "live-1",
      sessionId: "session-3",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
    });

    expect(result.ok).toBe(true);
    expect(result.workspacePath).toContain(path.join("workspaces", "projects", "proj-1", "live-1"));
  });

  it("workspace 元数据缺失时仍可按嵌套目录名定位 workspace", () => {
    fs.rmSync(
      path.join(tempDir, "workspaces", "user-1", "proj-1", "ws-1", ".workspace.json"),
      { force: true },
    );
    const persistence = new WorkspaceFilePersistence(tempDir);

    const result = persistence.validateWorkspaceSession({
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
    });

    expect(result.ok).toBe(true);
    expect(result.workspacePath).toContain(path.join("workspaces", "user-1", "proj-1", "ws-1"));
  });

  it("拒绝跨 workspace 或越权资源路径", () => {
    const persistence = new WorkspaceFilePersistence(tempDir);

    expect(
      persistence.validateSession({
        projectId: "proj-1",
        workspaceId: "ws-other",
        sessionId: "session-1",
        resourcePath: "demos/page-1/index.tsx",
        kind: "page-code",
      }).ok,
    ).toBe(false);

    expect(
      persistence.validateSession({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
        resourcePath: "../project.json",
        kind: "page-code",
      }).ok,
    ).toBe(false);
  });

  it("协同资源只能通过 Authority durable receipt 写入", async () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const workspacePath = path.join(tempDir, "workspaces", "user-1", "proj-1", "ws-1");

    const result = await persistence.commitResource({
      projectId: "proj-1",
      workspaceId: "ws-1",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
      content: "new content",
      expectedHash: crypto.createHash("sha256").update("old").digest("hex"),
      sessionId: "session-1",
    });

    expect(fs.readFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "utf-8")).toBe(
      "new content",
    );
    expect(result.receipt.committed).toBe(true);
    expect(result.receipt.revision).toBe(2);
  });

  it("允许知识文档协同并拒绝知识目录嵌套资源", async () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const workspacePath = path.join(tempDir, "workspaces", "user-1", "proj-1", "ws-1");

    const valid = persistence.validateSession({
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      resourcePath: "knowledge/产品规则.md",
      kind: "knowledge-document",
    });

    expect(valid.ok).toBe(true);

    await persistence.commitResource({
      projectId: "proj-1",
      workspaceId: "ws-1",
      resourcePath: "knowledge/产品规则.md",
      kind: "knowledge-document",
      content: "# 新规则",
      expectedHash: crypto.createHash("sha256").update("# 产品规则").digest("hex"),
      sessionId: "session-1",
    });
    expect(fs.readFileSync(path.join(workspacePath, "knowledge", "产品规则.md"), "utf-8")).toBe(
      "# 新规则",
    );

    expect(
      persistence.validateSession({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
        resourcePath: "knowledge/templates/template-1/reading-map.json",
        kind: "knowledge-document",
      }).ok,
    ).toBe(false);
  });
});
