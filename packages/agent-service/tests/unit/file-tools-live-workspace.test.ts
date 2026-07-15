import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEditFileTool } from "../../src/backends/pi-tools/edit-file-tool";
import {
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
} from "../../src/backends/pi-tools/file-tools";
import { createListPagesTool } from "../../src/backends/pi-tools/delete-page-tool";
import type { AgentConfig } from "../../src/core/types";

const roots: string[] = [];
const hash = (content: string) =>
  crypto.createHash("sha256").update(content).digest("hex");

function createLiveWorkspace() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "file-tools-live-workspace-"),
  );
  roots.push(root);
  const workspacePath = path.join(
    root,
    "data",
    "workspaces",
    "projects",
    "project-1",
    "workspace-1",
  );
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, ".workspace.json"),
    JSON.stringify({
      workspaceId: "workspace-1",
      projectId: "project-1",
      scope: "live",
      status: "active",
    }),
  );
  fs.writeFileSync(
    path.join(workspacePath, "demos", "home", "index.tsx"),
    "before",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "demos", "home", "config.schema.json"),
    "{}",
    "utf-8",
  );
  return workspacePath;
}

function createLiveWorkspaceWithPages() {
  const workspacePath = createLiveWorkspace();
  fs.mkdirSync(path.join(workspacePath, "demos", "about"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, "demos", "about", "index.tsx"),
    "about",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "demos", "about", "config.schema.json"),
    "{}",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "workspace-tree.json"),
    JSON.stringify({
      folders: [],
      pages: [
        { id: "home", name: "首页", order: 0, parentId: null },
        { id: "about", name: "关于", order: 1, parentId: null },
      ],
    }),
    "utf-8",
  );
  return workspacePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length)
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("live Workspace file tools", () => {
  it("readFile 返回 Authority committed revision 和 hash", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const read = await createReadFileTool(config).execute("read", {
      path: "demos/home/index.tsx",
    });

    expect(read.content[0].text).toBe("before");
    expect(read.details).toMatchObject({ revision: 1, hash: hash("before") });
  });

  it("writeFile/editFile 从 committed snapshot 取基线并只以 receipt 成功", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };
    const writeSpy = vi.spyOn(fs.promises, "writeFile");

    const written = await createWriteFileTool(config).execute("write", {
      path: "demos/home/index.tsx",
      content: "second",
    });
    const edited = await createEditFileTool(config).execute("edit", {
      path: "demos/home/index.tsx",
      edits: [{ old_string: "second", new_string: "third" }],
    });

    expect(written.isError).toBeFalsy();
    expect(written.details).toMatchObject({
      receipt: { committed: true, revision: 2, baseRevision: 1 },
    });
    expect(edited.isError).toBeFalsy();
    expect(edited.details).toMatchObject({
      receipt: { committed: true, revision: 3, baseRevision: 2 },
    });
    expect(
      fs.readFileSync(
        path.join(workspacePath, "demos", "home", "index.tsx"),
        "utf-8",
      ),
    ).toBe("third");
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("listFiles 在 live Workspace 下从 Authority snapshot 读取目录", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };
    const readdirSpy = vi.spyOn(fs.promises, "readdir");

    const result = await createListFilesTool(config).execute("list", {
      path: "demos/home",
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("file: index.tsx");
    expect(result.details).toHaveProperty("revision", 1);
    expect(readdirSpy).not.toHaveBeenCalled();
  });

  it("listPages 在 live Workspace 下从 Authority snapshot 读取页面列表", async () => {
    const workspacePath = createLiveWorkspaceWithPages();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const result = await createListPagesTool(config).execute("list", {});

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("id: home");
    expect(result.content[0].text).toContain("name: 首页");
    expect(result.content[0].text).toContain("id: about");
    expect(result.content[0].text).toContain("name: 关于");
    expect(result.details).toHaveProperty("revision");
  });

  it("listPages 在 live Workspace 下只返回有完整文件的页面", async () => {
    const workspacePath = createLiveWorkspace();
    fs.writeFileSync(
      path.join(workspacePath, "workspace-tree.json"),
      JSON.stringify({
        folders: [],
        pages: [
          { id: "home", name: "首页", order: 0, parentId: null },
          { id: "broken", name: "残缺页", order: 1, parentId: null },
        ],
      }),
      "utf-8",
    );
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const result = await createListPagesTool(config).execute("list", {});

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("id: home");
    expect(result.content[0].text).not.toContain("id: broken");
  });

  it("writeFile 创建新 knowledge/*.md 时透明同步 manifest.json", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const result = await createWriteFileTool(config).execute("write-kb", {
      path: "knowledge/test-doc.md",
      content: "# 测试文档\n\n这是一份测试知识文档。",
    });

    // writeFile 应成功
    expect(result.isError).toBeFalsy();
    expect(result.details).toHaveProperty("knowledgeDocumentCreated", true);

    // .md 文件应已写入工作区
    const docPath = path.join(workspacePath, "knowledge", "test-doc.md");
    expect(fs.existsSync(docPath)).toBe(true);
    expect(fs.readFileSync(docPath, "utf-8")).toContain("测试文档");

    // manifest.json 应已创建并包含新条目
    const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].fileName).toBe("test-doc.md");
    expect(manifest.items[0].title).toBe("test-doc");
    expect(manifest.items[0].source).toBe("user");
    expect(manifest.items[0].id).toMatch(/^kb_/);
  });

  it("writeFile 编辑已存在 knowledge/*.md 时不触发 manifest 同步", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    // 先创建文档
    await createWriteFileTool(config).execute("write-1", {
      path: "knowledge/existing.md",
      content: "初始内容",
    });

    // 再次写入（覆盖）
    const result = await createWriteFileTool(config).execute("write-2", {
      path: "knowledge/existing.md",
      content: "更新内容",
    });

    expect(result.isError).toBeFalsy();
    expect(result.details).toHaveProperty("knowledgeDocumentCreated", false);

    // manifest 应仍只有 1 个条目
    const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.items).toHaveLength(1);
  });

  it("writeFile 使用 ./ 前缀路径创建 knowledge 文档时归一化后触发 manifest 同步", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    // ./knowledge/ 前缀路径应被归一化处理
    const result = await createWriteFileTool(config).execute("write-kb-prefixed", {
      path: "./knowledge/prefixed-doc.md",
      content: "# 带前缀路径的文档",
    });

    expect(result.isError).toBeFalsy();
    expect(result.details).toHaveProperty("knowledgeDocumentCreated", true);

    // manifest.json 应已创建并包含新条目
    const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].fileName).toBe("prefixed-doc.md");
  });
});
