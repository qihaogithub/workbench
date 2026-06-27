import fs from "fs";
import os from "os";
import path from "path";
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
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("WorkspaceFilePersistence", () => {
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

  it("写入资源时更新文件内容并刷新 workspace 元数据时间", () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const workspacePath = path.join(tempDir, "workspaces", "user-1", "proj-1", "ws-1");

    persistence.writeResource(
      workspacePath,
      "demos/page-1/index.tsx",
      "page-code",
      "new content",
    );

    expect(fs.readFileSync(path.join(workspacePath, "demos", "page-1", "index.tsx"), "utf-8")).toBe(
      "new content",
    );
    const meta = JSON.parse(fs.readFileSync(path.join(workspacePath, ".workspace.json"), "utf-8")) as {
      updatedAt: number;
    };
    expect(meta.updatedAt).toBeGreaterThan(1);
  });

  it("允许知识文档协同并拒绝知识目录嵌套资源", () => {
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

    persistence.writeResource(
      workspacePath,
      "knowledge/产品规则.md",
      "knowledge-document",
      "# 新规则",
    );
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
