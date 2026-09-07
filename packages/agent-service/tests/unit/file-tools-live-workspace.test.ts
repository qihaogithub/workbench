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
    "export default function Home(){return <div>before</div>}",
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

function createLiveWorkspaceWithUnicodePage() {
  const workspacePath = createLiveWorkspace();
  const pageId = "闯关活动页-进行中_ec853d";
  const pageDir = path.join(workspacePath, "demos", pageId);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(pageDir + "/index.tsx", "export default function Page(){return <div>ok</div>}");
  fs.writeFileSync(pageDir + "/config.schema.json", "{}");
  fs.writeFileSync(path.join(workspacePath, "workspace-tree.json"), JSON.stringify({
    folders: [],
    pages: [{ id: pageId, name: "闯关活动页", order: 0, parentId: null }],
  }));
  return { workspacePath, pageId };
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

    expect(read.content[0].text).toBe("export default function Home(){return <div>before</div>}");
    expect(read.details).toMatchObject({ revision: 1, hash: hash("export default function Home(){return <div>before</div>}") });
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
      content: "export default function Home(){return <div>second</div>}",
    });
    const edited = await createEditFileTool(config).execute("edit", {
      path: "demos/home/index.tsx",
      edits: [{ old_string: "second", new_string: "third" }],
    });

    expect(written.isError).toBeFalsy();
    expect(written.details).toMatchObject({
      receipt: { committed: true, revision: 2, baseRevision: 1 },
    });
    expect(written.content[0].text).toContain(
      "Authority committed: revision=2; runtimeValidation=ok; previewProjection=not_verified.",
    );
    expect(edited.isError).toBeFalsy();
    expect(edited.details).toMatchObject({
      receipt: { committed: true, revision: 3, baseRevision: 2 },
    });
    expect(
      fs.readFileSync(
        path.join(workspacePath, "demos", "home", "index.tsx"),
        "utf-8",
      ),
    ).toBe("export default function Home(){return <div>third</div>}");
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
    expect(result.details).toHaveProperty("snapshotRevision");
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
    expect(result.details).toHaveProperty("diagnostics", [expect.objectContaining({
      code: "INCOMPLETE_PAGE",
      pageId: "broken",
    })]);
  });

  it("listPages 保留 Unicode 页面 ID，并返回精确路径", async () => {
    const { workspacePath, pageId } = createLiveWorkspaceWithUnicodePage();
    const result = await createListPagesTool({ sessionId: "session-1", workingDir: workspacePath }).execute("list", {});

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain(`id: ${pageId}`);
    expect(result.content[0].text).toContain(`demos/${pageId}/index.tsx`);
    expect(result.details).toMatchObject({ pages: [expect.objectContaining({ id: pageId })] });
  });

  it("writeFile 对新知识文档只创建待审核 proposal，不写 Workspace 或 manifest", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const result = await createWriteFileTool(config).execute("write-kb", {
      path: "knowledge/test-doc.md",
      content: "# 测试文档\n\n这是一份测试知识文档。",
    });

    expect(result.isError).toBeFalsy();
    expect(result.details).toHaveProperty("status", "awaiting_approval");
    expect(result.details).toHaveProperty("proposalId");
    expect(result.content[0].text).toContain("has not been changed");

    const docPath = path.join(workspacePath, "knowledge", "test-doc.md");
    expect(fs.existsSync(docPath)).toBe(false);

    const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(false);
  });

  it("writeFile 覆盖已有知识文档时保留原内容直到批准", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    fs.mkdirSync(path.join(workspacePath, "knowledge"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "knowledge", "existing.md"), "初始内容", "utf-8");

    // 再次写入（覆盖）
    const result = await createWriteFileTool(config).execute("write-2", {
      path: "knowledge/existing.md",
      content: "更新内容",
    });

    expect(result.isError).toBeFalsy();
    expect(result.details).toHaveProperty("status", "awaiting_approval");

    expect(fs.readFileSync(path.join(workspacePath, "knowledge", "existing.md"), "utf-8")).toBe("初始内容");
  });

  it("writeFile 使用 ./ 前缀路径创建 proposal 时规范化路径", async () => {
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
    expect(result.details).toMatchObject({ path: "knowledge/prefixed-doc.md", status: "awaiting_approval" });
    expect(fs.existsSync(path.join(workspacePath, "knowledge", "prefixed-doc.md"))).toBe(false);
  });
});
