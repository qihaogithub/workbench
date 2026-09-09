import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentConfig } from "../../src/core/types";
import { assertAiMutationAllowed } from "../../src/backends/pi-tools/ai-mutation-policy";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function config(role: "admin" | "editor" | null, workingDir: string): AgentConfig {
  return {
    sessionId: "session-1",
    projectId: "project-1",
    workingDir,
    authorAuthorization: {
      userId: "user-1",
      role,
      projectId: "project-1",
      expiresAt: Date.now() + 60_000,
      source: "author-session",
    },
  };
}

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-policy-"));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, "workspace-tree.json"), JSON.stringify({
    folders: [],
    pages: [
      { id: "template", isTemplatePage: true },
      { id: "ordinary", isTemplatePage: false },
    ],
  }));
  return dir;
}

describe("AI author mutation policy", () => {
  it("blocks editor writes to template pages, conventions and design specs", () => {
    const dir = workspace();
    expect(assertAiMutationAllowed(config("editor", dir), "demos/template/index.tsx").allowed).toBe(false);
    expect(assertAiMutationAllowed(config("editor", dir), "convention.md").category).toBe("convention");
    expect(assertAiMutationAllowed(config("editor", dir), "demos/ordinary/convention.md").allowed).toBe(false);
    expect(assertAiMutationAllowed(config("editor", dir), "design-spec/theme.md").category).toBe("design_spec");
  });

  it("allows editor writes to ordinary pages, memory and user knowledge", () => {
    const dir = workspace();
    for (const target of ["demos/ordinary/index.tsx", "memory.md", "knowledge/user-notes.md"]) {
      expect(assertAiMutationAllowed(config("editor", dir), target).allowed).toBe(true);
    }
  });

  it("allows ordinary config definitions while keeping visibility rules on the dedicated workflow", () => {
    const dir = workspace();
    const editor = config("editor", dir);
    expect(assertAiMutationAllowed(editor, "project.config.schema.json").allowed).toBe(true);
    expect(assertAiMutationAllowed(editor, "project.visibility-rules.json", { workflow: "visibility-draft" }).allowed).toBe(true);
    expect(assertAiMutationAllowed(editor, "project.config.schema.json", { workflow: "visibility-draft" }).allowed).toBe(true);
    expect(assertAiMutationAllowed(editor, "project.config.values.json").allowed).toBe(true);
    expect(assertAiMutationAllowed(editor, "project.visibility-rules.json", { workflow: "visibility-draft" }).allowed).toBe(true);
    expect(assertAiMutationAllowed(editor, "project.visibility-rules.json").allowed).toBe(false);
  });

  it("prevents an editor from changing template markers while allowing other tree edits", () => {
    const dir = workspace();
    const unchangedMarkers = JSON.stringify({ folders: [], pages: [
      { id: "template", isTemplatePage: true, name: "New name" },
      { id: "ordinary", isTemplatePage: false },
    ] });
    const removedMarker = JSON.stringify({ folders: [], pages: [
      { id: "template", isTemplatePage: false },
      { id: "ordinary", isTemplatePage: false },
    ] });
    expect(assertAiMutationAllowed(config("editor", dir), "workspace-tree.json", { content: unchangedMarkers }).allowed).toBe(true);
    expect(assertAiMutationAllowed(config("editor", dir), "workspace-tree.json", { content: removedMarker }).allowed).toBe(false);
  });

  it("allows administrators and rejects an unverified authoring session", () => {
    const dir = workspace();
    expect(assertAiMutationAllowed(config("admin", dir), "demos/template/index.tsx").allowed).toBe(true);
    expect(assertAiMutationAllowed(config(null, dir), "memory.md").category).toBe("unverified");
  });

  it("blocks expired admin grants and template-bound whiteboard mutations", () => {
    const dir = workspace();
    fs.mkdirSync(path.join(dir, "whiteboards"));
    fs.writeFileSync(path.join(dir, "whiteboards", "bindings.json"), JSON.stringify({
      bindings: [{
        whiteboardId: "template-board",
        target: { scope: "page", pageId: "template" },
      }],
    }));
    expect(assertAiMutationAllowed(config("editor", dir), "whiteboards/template-board.json").allowed).toBe(false);
    expect(assertAiMutationAllowed(config("editor", dir), "whiteboards/bindings.json", {
      content: JSON.stringify({ bindings: [] }),
    }).allowed).toBe(false);
    const expired = config("admin", dir);
    expired.authorAuthorization!.expiresAt = Date.now() - 1;
    expect(assertAiMutationAllowed(expired, "demos/template/index.tsx").category).toBe("unverified");
  });
});
