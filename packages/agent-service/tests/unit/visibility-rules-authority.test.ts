import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceMutationAuthority } from "../../src/workspace/workspace-mutation-authority";

const roots: string[] = [];

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-authority-"));
  roots.push(root);
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, "workspace-tree.json"), JSON.stringify({
    folders: [], pages: [{ id: "home", name: "首页", routeKey: "home", order: 0, parentId: null }],
  }));
  fs.writeFileSync(path.join(workspacePath, "project.config.schema.json"), JSON.stringify({
    type: "object", properties: { enabled: { type: "boolean", default: false } },
  }));
  fs.writeFileSync(path.join(workspacePath, "demos/home/config.schema.json"), JSON.stringify({ type: "object", properties: {} }));
  fs.writeFileSync(path.join(workspacePath, "demos/home/index.tsx"), '<div data-region-id="hero" />');
  return {
    workspacePath,
    authority: new WorkspaceMutationAuthority({
      dataDir: path.join(root, "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "w1" ? workspacePath : null,
    }),
  };
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});
describe("visibility rules Authority semantic gate", () => {
  it("accepts declared page/region targets in a single mutation", async () => {
    const { authority, workspacePath } = setup();
    const base = await authority.getState("p1", "w1");
    const rules = JSON.stringify({ version: 1, rules: [
      { id: "hide-hero", source: { scope: "project", fieldKey: "enabled" }, condition: { kind: "truthy" }, target: { type: "region", pageId: "home", regionId: "hero" }, effect: "hidden" },
    ] });
    const receipt = await authority.mutate({
      mutationId: "visibility-valid", projectId: "p1", workspaceId: "w1", baseRevision: base.revision, baseRootHash: base.rootHash,
      actor: "ai", reason: "config_visibility_draft_commit",
      operations: [{ type: "put_text", path: "project.visibility-rules.json", content: rules, expectedAbsent: true }],
    });
    expect(receipt.resources[0].path).toBe("project.visibility-rules.json");
    expect(fs.readFileSync(path.join(workspacePath, "project.visibility-rules.json"), "utf8")).toBe(rules);
  });

  it("rejects missing page/region targets before touching the rules file", async () => {
    const { authority, workspacePath } = setup();
    const base = await authority.getState("p1", "w1");
    const rules = JSON.stringify({ version: 1, rules: [
      { id: "bad", source: { scope: "project", fieldKey: "enabled" }, condition: { kind: "truthy" }, target: { type: "region", pageId: "missing", regionId: "hero" }, effect: "hidden" },
    ] });
    await expect(authority.mutate({
      mutationId: "visibility-invalid", projectId: "p1", workspaceId: "w1", baseRevision: base.revision, baseRootHash: base.rootHash,
      actor: "ai", reason: "config_visibility_draft_commit",
      operations: [{ type: "put_text", path: "project.visibility-rules.json", content: rules, expectedAbsent: true }],
    })).rejects.toMatchObject({ code: "WORKSPACE_INVALID_OPERATION" });
    expect(fs.existsSync(path.join(workspacePath, "project.visibility-rules.json"))).toBe(false);
  });

  it("rejects a visibility draft whose revision/root cursor changed after approval", async () => {
    const { authority, workspacePath } = setup();
    const base = await authority.getState("p1", "w1");
    await authority.mutate({
      mutationId: "unrelated-change", projectId: "p1", workspaceId: "w1", baseRevision: base.revision,
      actor: "ai", reason: "ordinary_write",
      operations: [{ type: "put_text", path: "memory.md", content: "changed", expectedAbsent: true }],
    });
    await expect(authority.mutate({
      mutationId: "stale-visibility", projectId: "p1", workspaceId: "w1", baseRevision: base.revision, baseRootHash: base.rootHash,
      actor: "ai", reason: "config_visibility_draft_commit",
      operations: [{ type: "put_text", path: "project.visibility-rules.json", content: JSON.stringify({ version: 1, rules: [] }), expectedAbsent: true }],
    })).rejects.toMatchObject({ code: "WORKSPACE_RESOURCE_CONFLICT" });
    expect(fs.existsSync(path.join(workspacePath, "project.visibility-rules.json"))).toBe(false);
  });
});
