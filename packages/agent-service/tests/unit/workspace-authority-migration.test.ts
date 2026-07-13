import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { migrateWorkspaceAuthorities } from "../../src/workspace/workspace-authority-migration";

const roots: string[] = [];

function createLiveWorkspace(projectId: string, workspaceId: string) {
  const dataDir = roots[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), "workspace-authority-migration-"));
  if (!roots.length) roots.push(dataDir);
  const workspacePath = path.join(dataDir, "workspaces", "projects", projectId, workspaceId);
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({ scope: "live", projectId, workspaceId }));
  fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), `${projectId}:${workspaceId}`);
  return { dataDir, workspacePath };
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("workspace authority migration", () => {
  it("支持 project dry-run 且不写 Authority state", async () => {
    const first = createLiveWorkspace("project-1", "live-1");
    createLiveWorkspace("project-2", "live-2");

    const result = await migrateWorkspaceAuthorities({ dataDir: first.dataDir, projectId: "project-1", apply: false });

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ matched: 1, changed: 0, blocked: 0 });
    expect(result.items[0]?.action).toBe("would_bootstrap");
    expect(fs.existsSync(path.join(first.dataDir, "workspace-authority"))).toBe(false);
  });

  it("all apply 幂等建立 state 与 committed backup", async () => {
    const first = createLiveWorkspace("project-1", "live-1");
    createLiveWorkspace("project-1", "live-2");

    const applied = await migrateWorkspaceAuthorities({ dataDir: first.dataDir, all: true, apply: true });
    const repeated = await migrateWorkspaceAuthorities({ dataDir: first.dataDir, all: true, apply: true });

    expect(applied.summary).toEqual({ matched: 2, changed: 2, blocked: 0 });
    expect(applied.items.every((item) => item.action === "bootstrapped")).toBe(true);
    expect(repeated.summary).toEqual({ matched: 2, changed: 0, blocked: 0 });
    expect(repeated.items.every((item) => item.action === "already_bootstrapped")).toBe(true);
    expect(fs.readdirSync(path.join(first.dataDir, "workspace-authority", "live-1", "backups")).length).toBe(1);
  });
});
