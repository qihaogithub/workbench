import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createCreatePageTool } from "../../src/backends/pi-tools/create-page-tool";

const roots: string[] = [];

function makeWorkspace(tree: unknown = { folders: [], pages: [] }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "create-page-tool-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "demos"), { recursive: true });
  fs.writeFileSync(path.join(root, "workspace-tree.json"), JSON.stringify(tree, null, 2));
  return root;
}

const configSchema = JSON.stringify({
  $demo: {
    presentation: {
      version: 1,
      mode: "responsive-page",
      viewport: { width: 390, height: 844 },
      heightBehavior: "content",
      preset: "mobile",
      source: "user",
    },
  },
  type: "object",
  properties: {},
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("createPage", () => {
  it("publishes a complete prototype page and its tree record together", async () => {
    const root = makeWorkspace({ folders: [{ id: "folder_design" }], pages: [] });
    const tool = createCreatePageTool({ sessionId: "test", workingDir: root });

    const result = await tool.execute("create-1", {
      pageId: "home_1",
      name: "首页",
      parentId: "folder_design",
      order: 0,
      runtimeType: "prototype-html-css",
      source: "<main><h1>Home</h1></main>",
      prototypeCss: "main { color: rebeccapurple; }",
      configSchema,
    });

    expect(result.isError).not.toBe(true);
    expect(fs.readFileSync(path.join(root, "demos/home_1/prototype.html"), "utf8")).toContain("Home");
    expect(fs.readFileSync(path.join(root, "demos/home_1/prototype.css"), "utf8")).toContain("rebeccapurple");
    expect(fs.existsSync(path.join(root, "demos/home_1/config.schema.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "workspace-tree.json"), "utf8")).pages).toEqual([
      expect.objectContaining({ id: "home_1", name: "首页", routeKey: "page", parentId: "folder_design", order: 0, runtimeType: "prototype-html-css" }),
    ]);
    expect(result.details).toMatchObject({
      createdPage: { id: "home_1", runtimeType: "prototype-html-css" },
      receipt: null,
    });
  });

  it("rejects invalid schema without publishing a partial page", async () => {
    const root = makeWorkspace();
    const tool = createCreatePageTool({ sessionId: "test", workingDir: root });

    const result = await tool.execute("create-2", {
      pageId: "bad_page",
      name: "Bad",
      parentId: null,
      order: 0,
      runtimeType: "prototype-html-css",
      source: "<main>Bad</main>",
      prototypeCss: "",
      configSchema: "{}",
    });

    expect(result.isError).toBe(true);
    expect(fs.existsSync(path.join(root, "demos/bad_page"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, "workspace-tree.json"), "utf8")).pages).toEqual([]);
  });

  it("requires prototype CSS before publishing a prototype page", async () => {
    const root = makeWorkspace();
    const tool = createCreatePageTool({ sessionId: "test", workingDir: root });

    const result = await tool.execute("create-css", {
      pageId: "missing_css",
      name: "Missing CSS",
      parentId: null,
      order: 0,
      runtimeType: "prototype-html-css",
      source: "<main>Missing CSS</main>",
      configSchema,
    });

    expect(result.isError).toBe(true);
    expect(fs.existsSync(path.join(root, "demos/missing_css"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, "workspace-tree.json"), "utf8")).pages).toEqual([]);
  });

  it("rejects duplicate IDs and unknown parent folders", async () => {
    const root = makeWorkspace({
      folders: [],
      pages: [{ id: "taken", name: "Taken", parentId: null, order: 0, runtimeType: "prototype-html-css" }],
    });
    const tool = createCreatePageTool({ sessionId: "test", workingDir: root });
    const base = {
      name: "Page", order: 1, runtimeType: "prototype-html-css" as const,
      source: "<main>Page</main>", prototypeCss: "", configSchema,
    };

    const duplicate = await tool.execute("create-3", { ...base, pageId: "taken", parentId: null });
    const unknownParent = await tool.execute("create-4", { ...base, pageId: "new_page", parentId: "missing" });

    expect(duplicate.isError).toBe(true);
    expect(unknownParent.isError).toBe(true);
    expect(fs.existsSync(path.join(root, "demos/new_page"))).toBe(false);
  });
});
