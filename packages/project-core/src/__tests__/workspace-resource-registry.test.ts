import { describe, expect, it } from "vitest";
import { createDefaultSketchScene } from "@workbench/sketch-core";

import {
  createWorkspaceResourceRegistry,
  hashWorkspaceContent,
  normalizeWorkspaceResourcePath,
} from "../workspace-resource-registry";

describe("WorkspaceResourceRegistry", () => {
  it("将知识 manifest 作为受管文本资源，允许与知识文档组成原子 mutation", () => {
    const registry = createWorkspaceResourceRegistry();
    expect(registry.describe("knowledge/manifest.json")).toMatchObject({
      kind: "knowledge-manifest",
      text: true,
    });
    expect(() => registry.assertTextWrite("knowledge/manifest.json", '{"items":[]}')).not.toThrow();
    expect(registry.describe("knowledge/nested/manifest.json")).toBeNull();
  });

  it("将手绘页面 meta 作为受管文本资源", () => {
    const registry = createWorkspaceResourceRegistry();
    expect(registry.describe("demos/page-1/sketch.meta.json")).toMatchObject({
      kind: "page-sketch-meta",
      text: true,
    });
    expect(() => registry.assertTextWrite("demos/page-1/sketch.meta.json", "{}")).not.toThrow();
  });

  it("将项目级配置运行值作为受管文本资源", () => {
    const registry = createWorkspaceResourceRegistry();
    expect(registry.describe("project.config.values.json")).toMatchObject({
      kind: "project-config-values",
      text: true,
    });
    expect(() => registry.assertTextWrite("project.config.values.json", "{}")).not.toThrow();
  });

  it("覆盖所有活动 Workspace 资源 adapter", () => {
    const registry = createWorkspaceResourceRegistry();
    const cases = [
      ["demos/page-1/index.tsx", "page-code", "text"],
      ["demos/page-1/prototype.html", "page-prototype-html", "text"],
      ["demos/page-1/prototype.css", "page-prototype-css", "text"],
      ["demos/page-1/prototype.meta.json", "page-prototype-meta", "json-object"],
      ["demos/page-1/config.schema.json", "page-schema", "json-object"],
      ["demos/page-1/sketch.scene.json", "page-sketch-scene", "sketch-scene"],
      ["demos/page-1/sketch.meta.json", "page-sketch-meta", "json-object"],
      ["project.config.schema.json", "project-schema", "json-object"],
      ["project.config.values.json", "project-config-values", "json-object"],
      ["workspace-tree.json", "workspace-tree", "workspace-tree"],
      [".canvas-layout.json", "canvas-layout", "json-object"],
      ["knowledge/guide.md", "knowledge-document", "text"],
      ["knowledge/manifest.json", "knowledge-manifest", "json-object"],
      ["assets/image.png", "asset", "binary"],
    ] as const;

    for (const [resourcePath, kind, validation] of cases) {
      expect(registry.describe(resourcePath)).toMatchObject({ kind, validation });
    }
    expect(registry.describe("other/unmanaged.txt")).toBeNull();
  });

  it("规范化安全路径并拒绝越界路径", () => {
    expect(normalizeWorkspaceResourcePath("/demos/page-1/index.tsx")).toBe("demos/page-1/index.tsx");
    expect(normalizeWorkspaceResourcePath("demos\\page-1\\index.tsx")).toBe("demos/page-1/index.tsx");
    expect(normalizeWorkspaceResourcePath("../secret.txt")).toBeNull();
    expect(normalizeWorkspaceResourcePath("demos/../secret.txt")).toBeNull();
  });

  it("校验 JSON、页面树、Sketch 和二进制资源内容", () => {
    const registry = createWorkspaceResourceRegistry();
    expect(() => registry.assertTextWrite("project.config.values.json", "[]")).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.assertTextWrite("project.config.values.json", "not-json")).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.assertTextWrite("workspace-tree.json", '{"pages":[],"folders":[]}')).not.toThrow();
    expect(() => registry.assertTextWrite("workspace-tree.json", '{"pages":[]}')).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.assertTextWrite(
      "demos/page-1/sketch.scene.json",
      JSON.stringify(createDefaultSketchScene()),
    )).not.toThrow();
    expect(() => registry.assertTextWrite("demos/page-1/sketch.scene.json", "{}")).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.assertBinaryWrite("assets/image.png", Buffer.from([1, 2, 3]))).not.toThrow();
    expect(() => registry.assertBinaryWrite("assets/image.png", Buffer.alloc(0))).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.assertBinaryWrite("demos/page-1/index.tsx", Buffer.from("x"))).toThrow("WORKSPACE_INVALID_OPERATION");
  });

  it("生成与输入顺序无关且内容敏感的 root manifest", () => {
    const registry = createWorkspaceResourceRegistry();
    const resources = {
      "workspace-tree.json": '{"pages":[],"folders":[]}',
      "demos/page-1/index.tsx": "export default function Page() { return null; }",
      "assets/image.png": Buffer.from([1, 2, 3]),
    };
    const first = registry.createRootManifest(resources);
    const reordered = registry.createRootManifest({
      "assets/image.png": resources["assets/image.png"],
      "demos/page-1/index.tsx": resources["demos/page-1/index.tsx"],
      "workspace-tree.json": resources["workspace-tree.json"],
    });

    expect(first).toEqual(reordered);
    expect(first.resources.map((entry) => entry.path)).toEqual([
      "assets/image.png",
      "demos/page-1/index.tsx",
      "workspace-tree.json",
    ]);
    expect(first.resourceHashes["assets/image.png"]).toBe(hashWorkspaceContent(Buffer.from([1, 2, 3])));
    expect(registry.createRootManifest({ ...resources, "demos/page-1/index.tsx": "changed" }).rootHash)
      .not.toBe(first.rootHash);
    expect(() => registry.createRootManifest({ "assets/image.png": "not-binary" })).toThrow("WORKSPACE_INVALID_OPERATION");
    expect(() => registry.createRootManifest({ "unmanaged.txt": "x" })).toThrow("WORKSPACE_INVALID_OPERATION");
  });
});
