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
import { createReadFileLinesTool } from "../../src/backends/pi-tools/read-file-lines-tool";
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
  it("readFile/readFileWithLines 返回 Authority committed revision 和 hash", async () => {
    const workspacePath = createLiveWorkspace();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };

    const read = await createReadFileTool(config).execute("read", {
      path: "demos/home/index.tsx",
    });
    const lines = await createReadFileLinesTool(config).execute("lines", {
      path: "demos/home/index.tsx",
    });

    expect(read.content[0].text).toBe("before");
    expect(read.details).toMatchObject({ revision: 1, hash: hash("before") });
    expect(lines.content[0].text).toContain("1→before");
    expect(lines.details).toMatchObject({ revision: 1, hash: hash("before") });
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
      old_string: "second",
      new_string: "third",
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
});
