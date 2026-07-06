import { describe, expect, it } from "vitest";

import {
  applySketchScenePatchOperations,
  applySketchScenePatchOperationsWithResult,
  bindSketchSceneConfigField,
  buildSketchScenePreviewDocumentHtml,
  createDefaultSketchScene,
  getSketchNodeBounds,
  getSketchSceneHashSource,
  getSketchSelectionBounds,
  hitTestSketchScene,
  renderSketchSceneToSvgMarkup,
  resizeSketchNode,
  rotateSketchNode,
  translateSketchNodes,
  validateSketchSceneDocument,
  type SketchSceneDocument,
  type SketchSceneNode,
  type SketchScenePatchOperation,
} from "../src";

function testScene(nodes: SketchSceneNode[]): SketchSceneDocument {
  return {
    version: 1,
    pageSize: { width: 400, height: 300 },
    nodes,
    assets: [],
    bindings: {},
  };
}

describe("sketch-core", () => {
  it("validates default scenes and line geometry", () => {
    expect(validateSketchSceneDocument(createDefaultSketchScene()).valid).toBe(true);
    expect(validateSketchSceneDocument(createDefaultSketchScene({ width: 120, height: 90 })).valid).toBe(true);
    expect(validateSketchSceneDocument(createDefaultSketchScene({ width: 1, height: 1 })).valid).toBe(true);
    expect(
      validateSketchSceneDocument(
        testScene([
          {
            id: "arrow",
            type: "arrow",
            x: 10,
            y: 10,
            width: 120,
            height: 0,
          },
        ]),
      ).valid,
    ).toBe(true);
    expect(validateSketchSceneDocument(testScene([{ id: "bad", type: "rect", x: 0, y: 0, width: 0, height: 12 }])).valid).toBe(false);
  });

  it("accepts directed line-like vectors with negative width or height", () => {
    const scene = testScene([
      { id: "left-arrow", type: "arrow", x: 120, y: 80, width: -80, height: 0 },
      { id: "up-line", type: "line", x: 60, y: 90, width: 0, height: -50 },
    ]);

    expect(validateSketchSceneDocument(scene).valid).toBe(true);

    const svg = renderSketchSceneToSvgMarkup(scene);
    expect(svg).toContain('data-sketch-node-id="left-arrow"');
    expect(svg).toContain('x1="120" y1="80" x2="40" y2="80"');
    expect(svg).toContain('x1="60" y1="90" x2="60" y2="40"');
  });

  it("rejects directed line-like vectors whose end point is outside the page origin", () => {
    expect(
      validateSketchSceneDocument(testScene([{ id: "bad", type: "arrow", x: 20, y: 20, width: -40, height: 0 }])).valid,
    ).toBe(false);
    expect(
      validateSketchSceneDocument(testScene([{ id: "bad", type: "line", x: 20, y: 20, width: 0, height: -40 }])).valid,
    ).toBe(false);
  });

  it("rejects nodes with negative coordinates", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
    ]);

    expect(validateSketchSceneDocument(testScene([{ id: "bad", type: "rect", x: -1, y: 0, width: 80, height: 40 }])).valid).toBe(false);
    expect(validateSketchSceneDocument(testScene([{ id: "bad-line", type: "line", x: 0, y: -1, width: 80, height: 0 }])).valid).toBe(false);

    const next = applySketchScenePatchOperations(scene, [
      { op: "update", nodeId: "a", patch: { x: -4 } },
      { op: "add", node: { id: "bad-add", type: "rect", x: -8, y: 20, width: 80, height: 40 } },
    ]);

    expect(next).toBe(scene);
    expect(next.nodes).toEqual(scene.nodes);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects nodes with unknown runtime types", () => {
    const scene = testScene([]);
    const invalidNode = { id: "unknown", type: "widget", x: 10, y: 20, width: 80, height: 40 } as unknown as SketchSceneNode;

    expect(validateSketchSceneDocument(testScene([invalidNode])).valid).toBe(false);

    const next = applySketchScenePatchOperations(scene, [{ op: "add", node: invalidNode }]);

    expect(next.nodes).toEqual([]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects path nodes without path data", () => {
    const scene = testScene([]);
    const invalidPathNode = { id: "path", type: "path", x: 10, y: 20, width: 80, height: 40 } as SketchSceneNode;

    expect(validateSketchSceneDocument(testScene([invalidPathNode])).valid).toBe(false);

    const next = applySketchScenePatchOperations(scene, [{ op: "add", node: invalidPathNode }]);

    expect(next.nodes).toEqual([]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects image nodes without a static src or src binding", () => {
    const scene = testScene([]);
    const invalidImageNode = { id: "image", type: "image", x: 10, y: 20, width: 80, height: 40 } as SketchSceneNode;
    const boundImageNode: SketchSceneNode = {
      id: "bound-image",
      type: "image",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      bindings: { src: "heroImage" },
    };

    expect(validateSketchSceneDocument(testScene([invalidImageNode])).valid).toBe(false);
    expect(validateSketchSceneDocument(testScene([boundImageNode])).valid).toBe(true);

    const next = applySketchScenePatchOperations(scene, [{ op: "add", node: invalidImageNode }]);

    expect(next.nodes).toEqual([]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects invalid style and binding payloads", () => {
    const invalidStyleNode = {
      id: "bad-style",
      type: "rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      style: { lineDash: [4, Number.NaN] },
    } as unknown as SketchSceneNode;
    const invalidBindingNode = {
      id: "bad-binding",
      type: "text",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      bindings: { text: 123 },
    } as unknown as SketchSceneNode;
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
    ]);

    expect(validateSketchSceneDocument(testScene([invalidStyleNode])).valid).toBe(false);
    expect(validateSketchSceneDocument(testScene([invalidBindingNode])).valid).toBe(false);

    const next = applySketchScenePatchOperations(scene, [
      { op: "update", nodeId: "a", patch: { style: { strokeWidth: Number.NaN } } as Partial<SketchSceneNode> },
      { op: "update", nodeId: "a", patch: { bindings: { text: "headline", extra: "ignored" } } as Partial<SketchSceneNode> },
    ]);

    expect(next.nodes[0]).toEqual(scene.nodes[0]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects invalid optional node fields that can corrupt rendering state", () => {
    const invalidStateNode = {
      id: "bad-state",
      type: "rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      zIndex: Number.NaN,
      visible: "yes",
    } as unknown as SketchSceneNode;
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
    ]);

    expect(validateSketchSceneDocument(testScene([invalidStateNode])).valid).toBe(false);

    const next = applySketchScenePatchOperations(scene, [
      { op: "update", nodeId: "a", patch: { rotation: Number.NaN } },
      { op: "update", nodeId: "a", patch: { visible: "yes" } as unknown as Partial<SketchSceneNode> },
    ]);

    expect(next.nodes[0]).toEqual(scene.nodes[0]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("rejects group children that do not reference existing nodes", () => {
    const invalidGroup: SketchSceneNode = {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: ["missing"],
    };

    expect(validateSketchSceneDocument(testScene([invalidGroup])).valid).toBe(false);
  });

  it("rejects invalid group children graphs", () => {
    const child: SketchSceneNode = { id: "child", type: "rect", x: 10, y: 10, width: 40, height: 40 };
    const nonGroupWithChildren = {
      id: "rect",
      type: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: ["child"],
    } as unknown as SketchSceneNode;
    const duplicateChildren: SketchSceneNode = {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: ["child", "child"],
    };
    const cycleA: SketchSceneNode = {
      id: "cycle-a",
      type: "group",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: ["cycle-b"],
    };
    const cycleB: SketchSceneNode = {
      id: "cycle-b",
      type: "group",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: ["cycle-a"],
    };

    expect(validateSketchSceneDocument(testScene([child, nonGroupWithChildren])).valid).toBe(false);
    expect(validateSketchSceneDocument(testScene([child, duplicateChildren])).valid).toBe(false);
    expect(validateSketchSceneDocument(testScene([cycleA, cycleB])).valid).toBe(false);
  });

  it("requires semantic group nodes to stay hidden and unlocked", () => {
    const child: SketchSceneNode = { id: "child", type: "rect", x: 10, y: 10, width: 40, height: 40 };
    const validScene = testScene([
      child,
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["child"] },
    ]);
    const visibleGroupScene = testScene([
      child,
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: true, children: ["child"] },
    ]);
    const lockedGroupScene = testScene([
      child,
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, locked: true, children: ["child"] },
    ]);
    const defaultVisibleGroupScene = testScene([
      child,
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, children: ["child"] },
    ]);
    const emptyGroupScene = testScene([
      child,
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: [] },
    ]);

    expect(validateSketchSceneDocument(validScene).valid).toBe(true);
    expect(validateSketchSceneDocument(visibleGroupScene).valid).toBe(false);
    expect(validateSketchSceneDocument(lockedGroupScene).valid).toBe(false);
    expect(validateSketchSceneDocument(defaultVisibleGroupScene).valid).toBe(false);
    expect(validateSketchSceneDocument(emptyGroupScene).valid).toBe(false);

    const next = applySketchScenePatchOperations(validScene, [
      { op: "update", nodeId: "group", patch: { visible: true, locked: true } },
      { op: "add", node: { id: "empty-group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: [] } },
    ]);

    expect(next).toBe(validScene);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("keeps invalid visibility and lock operations from corrupting valid scenes", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "set-visible", nodeIds: ["a"], visible: "yes" },
      { op: "set-locked", nodeIds: ["a"], locked: "locked" },
    ] as unknown as SketchScenePatchOperation[]);

    expect(next).toBe(scene);
    expect(next.nodes[0]).toEqual(scene.nodes[0]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("applies auditable scene patch operations", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 10, width: 80, height: 40 },
      { id: "b", type: "text", x: 100, y: 10, width: 90, height: 30, text: "old" },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "update", nodeId: "b", patch: { text: "new" } },
      { op: "duplicate", nodeId: "a", newNodeId: "a2", offset: { x: 5, y: 7 } },
      { op: "set-locked", nodeIds: ["a"], locked: true },
      { op: "set-visible", nodeIds: ["b"], visible: false },
      { op: "group", groupId: "g", nodeIds: ["a", "b"], name: "group" },
      { op: "reorder", nodeIds: ["b", "a", "a2"] },
    ]);

    expect(next.nodes.map((node) => node.id)).toEqual(["b", "a", "a2", "g"]);
    expect(next.nodes.find((node) => node.id === "b")?.text).toBe("new");
    expect(next.nodes.find((node) => node.id === "b")?.visible).toBe(false);
    expect(next.nodes.find((node) => node.id === "a")?.locked).toBe(true);
    expect(next.nodes.find((node) => node.id === "a2")?.x).toBe(15);
    expect(next.nodes.find((node) => node.id === "g")?.children).toEqual(["a", "b"]);
    const ungrouped = applySketchScenePatchOperations(next, [{ op: "ungroup", groupId: "g" }]);
    expect(ungrouped.nodes.some((node) => node.id === "g")).toBe(false);
    expect(ungrouped.nodes.find((node) => node.id === "a")).toMatchObject({ id: "a", type: "rect" });
    expect(ungrouped.nodes.find((node) => node.id === "b")).toMatchObject({ id: "b", type: "text", text: "new" });
    expect(applySketchScenePatchOperationsWithResult(next, []).validation.valid).toBe(true);
  });

  it("persists reorder operations into zIndex so rendering follows layer commands", () => {
    const scene = testScene([
      { id: "back", type: "rect", x: 10, y: 10, width: 80, height: 40, zIndex: 99 },
      { id: "front", type: "rect", x: 20, y: 20, width: 80, height: 40, zIndex: 0 },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "reorder", nodeIds: ["back", "front"] },
    ]);
    const svg = renderSketchSceneToSvgMarkup(next);

    expect(next.nodes.map((node) => [node.id, node.zIndex])).toEqual([
      ["back", 0],
      ["front", 1],
    ]);
    expect(svg.indexOf('data-sketch-node-id="back"')).toBeLessThan(svg.indexOf('data-sketch-node-id="front"'));
  });

  it("rejects malformed reorder operations without normalizing existing zIndex values", () => {
    const scene: SketchSceneDocument = {
      ...testScene([
        { id: "a", type: "rect", x: 10, y: 10, width: 80, height: 40, zIndex: 5 },
        { id: "b", type: "rect", x: 20, y: 20, width: 80, height: 40, zIndex: 9 },
      ]),
      metadata: { updatedAt: 123 },
    };

    for (const nodeIds of [[], ["missing"], ["a", "a"], ["a", "b", "missing"]]) {
      const next = applySketchScenePatchOperations(scene, [{ op: "reorder", nodeIds }]);

      expect(next).toBe(scene);
      expect(next.nodes).toEqual(scene.nodes);
      expect(next.metadata).toEqual({ updatedAt: 123 });
      expect(validateSketchSceneDocument(next).valid).toBe(true);
    }
  });

  it("places added and duplicated nodes above the current layer stack", () => {
    const scene = testScene([
      { id: "base", type: "rect", x: 10, y: 10, width: 80, height: 40, zIndex: 5 },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "add", node: { id: "new", type: "rect", x: 30, y: 30, width: 80, height: 40, zIndex: 0 } },
      { op: "duplicate", nodeId: "base", newNodeId: "base-copy" },
    ]);
    const svg = renderSketchSceneToSvgMarkup(next);

    expect(next.nodes.find((node) => node.id === "new")?.zIndex).toBe(6);
    expect(next.nodes.find((node) => node.id === "base-copy")?.zIndex).toBe(7);
    expect(svg.indexOf('data-sketch-node-id="base"')).toBeLessThan(svg.indexOf('data-sketch-node-id="new"'));
    expect(svg.indexOf('data-sketch-node-id="new"')).toBeLessThan(svg.indexOf('data-sketch-node-id="base-copy"'));
  });

  it("normalizes duplicated nodes so copies are visible and editable", () => {
    const scene = testScene([
      { id: "hidden", type: "rect", x: 10, y: 20, width: 80, height: 40, locked: true, visible: false },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "duplicate", nodeId: "hidden", newNodeId: "hidden-copy" },
    ]);

    expect(next.nodes.find((node) => node.id === "hidden")).toMatchObject({
      locked: true,
      visible: false,
    });
    expect(next.nodes.find((node) => node.id === "hidden-copy")).toMatchObject({
      locked: false,
      visible: true,
      x: 34,
      y: 44,
    });
  });

  it("keeps duplicated semantic groups hidden", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
      { id: "group", type: "group", x: 10, y: 20, width: 80, height: 40, visible: false, children: ["a"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "duplicate", nodeId: "group", newNodeId: "group-copy" },
    ]);

    expect(next.nodes.find((node) => node.id === "group-copy")).toMatchObject({
      type: "group",
      visible: false,
      locked: false,
      children: ["a"],
    });
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("keeps semantic groups hidden when visibility patches target them", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
      { id: "group", type: "group", x: 10, y: 20, width: 80, height: 40, visible: false, children: ["a"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "set-visible", nodeIds: ["group", "a"], visible: true },
    ]);

    expect(next.nodes.find((node) => node.id === "group")).toMatchObject({ visible: false });
    expect(next.nodes.find((node) => node.id === "a")).toMatchObject({ visible: true });
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("does not render semantic groups even when visible is config-bound to true", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
      {
        id: "group",
        type: "group",
        x: 10,
        y: 20,
        width: 80,
        height: 40,
        visible: false,
        children: ["a"],
        bindings: { visible: "showGroup" },
      },
    ]);

    const svg = renderSketchSceneToSvgMarkup(scene, { showGroup: true });

    expect(validateSketchSceneDocument(scene).valid).toBe(true);
    expect(svg).toContain('data-sketch-node-id="a"');
    expect(svg).not.toContain('data-sketch-node-id="group"');
  });

  it("keeps semantic groups unlocked when lock patches target them", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
      { id: "group", type: "group", x: 10, y: 20, width: 80, height: 40, visible: false, children: ["a"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "set-locked", nodeIds: ["group", "a"], locked: true },
    ]);

    expect(next.nodes.find((node) => node.id === "group")).toMatchObject({ locked: false });
    expect(next.nodes.find((node) => node.id === "a")).toMatchObject({ locked: true });
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("keeps invalid add and update patches from corrupting valid scenes", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "add", node: { id: "bad", type: "rect", x: 0, y: 0, width: 0, height: 20 } },
      { op: "update", nodeId: "a", patch: { x: Number.NaN } },
    ]);

    expect(next).toBe(scene);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]).toMatchObject({ id: "a", x: 10, y: 20, width: 80, height: 40 });
    expect(validateSketchSceneDocument(next).valid).toBe(true);

    const result = applySketchScenePatchOperationsWithResult(scene, [
      { op: "update", nodeId: "a", patch: { width: 0 } },
    ]);

    expect(result.validation.valid).toBe(true);
    expect(result.scene.nodes[0]).toMatchObject({ id: "a", width: 80 });
  });

  it("rejects add patches that would replace existing node ids", () => {
    const scene: SketchSceneDocument = {
      ...testScene([
        { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40, text: "Original" },
      ]),
      metadata: { updatedAt: 123 },
    };

    const next = applySketchScenePatchOperations(scene, [
      { op: "add", node: { id: "a", type: "card", x: 100, y: 120, width: 160, height: 90, text: "Replacement" } },
    ]);

    expect(next).toBe(scene);
    expect(next.nodes).toEqual(scene.nodes);
    expect(next.metadata).toEqual({ updatedAt: 123 });
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("does not update scene metadata for no-op patches", () => {
    const scene: SketchSceneDocument = {
      ...testScene([{ id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 }]),
      metadata: { updatedAt: 123 },
    };

    const next = applySketchScenePatchOperations(scene, [
      { op: "update", nodeId: "missing", patch: { x: 20 } },
      { op: "update", nodeId: "a", patch: { x: 10 } },
    ]);

    expect(next).toBe(scene);
    expect(next.metadata).toEqual({ updatedAt: 123 });
  });

  it("keeps invalid duplicate and group patches from corrupting valid scenes", () => {
    const scene = testScene([
      { id: "line", type: "line", x: 10, y: 20, width: 0, height: 40 },
      { id: "box", type: "rect", x: 80, y: 20, width: 60, height: 40 },
    ]);

    const next = applySketchScenePatchOperations(scene, [
      { op: "duplicate", nodeId: "box", newNodeId: "bad-copy", offset: { x: Number.NaN, y: 0 } },
      { op: "group", groupId: "bad-group", nodeIds: ["missing"] },
    ]);

    expect(next.nodes.map((node) => node.id)).toEqual(["line", "box"]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("allows semantic groups around zero-axis line-like selections", () => {
    const scene = testScene([
      { id: "horizontal", type: "line", x: 10, y: 20, width: 80, height: 0 },
      { id: "vertical", type: "line", x: 120, y: 30, width: 0, height: 90 },
    ]);

    const groupedHorizontal = applySketchScenePatchOperations(scene, [
      { op: "group", groupId: "horizontal-group", nodeIds: ["horizontal"] },
    ]);
    const groupedVertical = applySketchScenePatchOperations(scene, [
      { op: "group", groupId: "vertical-group", nodeIds: ["vertical"] },
    ]);

    expect(groupedHorizontal.nodes.find((node) => node.id === "horizontal-group")).toMatchObject({
      type: "group",
      x: 10,
      y: 20,
      width: 80,
      height: 0,
      visible: false,
      children: ["horizontal"],
    });
    expect(groupedVertical.nodes.find((node) => node.id === "vertical-group")).toMatchObject({
      type: "group",
      x: 120,
      y: 30,
      width: 0,
      height: 90,
      visible: false,
      children: ["vertical"],
    });
    expect(validateSketchSceneDocument(groupedHorizontal).valid).toBe(true);
    expect(validateSketchSceneDocument(groupedVertical).valid).toBe(true);
  });

  it("keeps group children references consistent when grouping and deleting nodes", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 10, width: 40, height: 40 },
      { id: "b", type: "rect", x: 70, y: 10, width: 40, height: 40 },
    ]);

    const badGroup = applySketchScenePatchOperations(scene, [
      { op: "group", groupId: "bad-group", nodeIds: ["a", "missing"] },
    ]);
    const grouped = applySketchScenePatchOperations(scene, [
      { op: "group", groupId: "group", nodeIds: ["a", "b"] },
    ]);
    const next = applySketchScenePatchOperations(grouped, [{ op: "delete", nodeId: "a" }]);

    expect(badGroup).toBe(scene);
    expect(grouped.nodes.find((node) => node.id === "group")?.children).toEqual(["a", "b"]);
    expect(next.nodes.find((node) => node.id === "group")?.children).toEqual(["b"]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("keeps ungroup patches from deleting non-group nodes", () => {
    const scene: SketchSceneDocument = {
      ...testScene([
        { id: "a", type: "rect", x: 10, y: 10, width: 40, height: 40 },
        { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["a"] },
      ]),
      metadata: { updatedAt: 123 },
    };

    const next = applySketchScenePatchOperations(scene, [{ op: "ungroup", groupId: "a" }]);

    expect(next).toBe(scene);
    expect(next.nodes).toEqual(scene.nodes);
    expect(next.metadata).toEqual({ updatedAt: 123 });
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("removes semantic groups when deleting their last child", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 10, width: 40, height: 40 },
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["a"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [{ op: "delete", nodeId: "a" }]);

    expect(next.nodes.some((node) => node.id === "a")).toBe(false);
    expect(next.nodes.some((node) => node.id === "group")).toBe(false);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("cascades empty group cleanup through nested groups", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 10, width: 40, height: 40 },
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["a"] },
      { id: "root", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["group"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [{ op: "delete", nodeId: "a" }]);

    expect(next.nodes.map((node) => node.id)).toEqual([]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("removes emptied nested groups without deleting sibling children", () => {
    const scene = testScene([
      { id: "a", type: "rect", x: 10, y: 10, width: 40, height: 40 },
      { id: "b", type: "rect", x: 80, y: 10, width: 40, height: 40 },
      { id: "group", type: "group", x: 10, y: 10, width: 40, height: 40, visible: false, children: ["a"] },
      { id: "root", type: "group", x: 10, y: 10, width: 110, height: 40, visible: false, children: ["group", "b"] },
    ]);

    const next = applySketchScenePatchOperations(scene, [{ op: "delete", nodeId: "a" }]);

    expect(next.nodes.find((node) => node.id === "group")).toBeUndefined();
    expect(next.nodes.find((node) => node.id === "b")).toBeDefined();
    expect(next.nodes.find((node) => node.id === "root")?.children).toEqual(["b"]);
    expect(validateSketchSceneDocument(next).valid).toBe(true);
  });

  it("binds config values and renders them through SVG", () => {
    const scene = bindSketchSceneConfigField(
      testScene([{ id: "title", type: "text", x: 12, y: 16, width: 200, height: 40, text: "fallback" }]),
      "title",
      "text",
      "headline",
    );

    const svg = renderSketchSceneToSvgMarkup(scene, { headline: "Bound title" });
    expect(svg).toContain("Bound title");
    expect(svg).not.toContain("fallback");
  });

  it("preserves valid page size when rendering fallback SVG for invalid scenes", () => {
    const invalidScene = {
      version: 1,
      pageSize: { width: 320, height: 180 },
      nodes: [{ id: "bad", type: "widget", x: 0, y: 0, width: 100, height: 60 }],
    } as unknown as SketchSceneDocument;

    const svg = renderSketchSceneToSvgMarkup(invalidScene);

    expect(validateSketchSceneDocument(invalidScene).valid).toBe(false);
    expect(svg).toContain('width="320" height="180" viewBox="0 0 320 180"');
    expect(svg).toContain("手绘页面");
    expect(svg).not.toContain('data-sketch-node-id="bad"');
  });

  it("uses safe dimensions when building fallback preview HTML for invalid scenes", () => {
    const invalidPageScene = {
      version: 1,
      pageSize: { width: -1, height: Number.NaN },
      nodes: [{ id: "bad", type: "widget", x: 0, y: 0, width: 100, height: 60 }],
    } as unknown as SketchSceneDocument;

    const defaultHtml = buildSketchScenePreviewDocumentHtml({ scene: invalidPageScene });
    const previewHtml = buildSketchScenePreviewDocumentHtml({
      scene: invalidPageScene,
      previewSize: { width: 320, height: 180 },
    });

    expect(defaultHtml).toContain("width: 1440px; min-height: 900px");
    expect(defaultHtml).toContain('width="1440" height="900" viewBox="0 0 1440 900"');
    expect(defaultHtml).not.toContain("NaNpx");
    expect(defaultHtml).not.toContain("-1px");
    expect(previewHtml).toContain("width: 320px; min-height: 180px");
    expect(previewHtml).toContain('width="320" height="180" viewBox="0 0 320 180"');
  });

  it("ignores config binding values whose runtime type does not match the bound property", () => {
    const scene = testScene([
      {
        id: "card",
        type: "card",
        x: 12,
        y: 16,
        width: 120,
        height: 60,
        text: "fallback",
        style: { fill: "#ffffff", stroke: "#111827", color: "#111827" },
        bindings: {
          visible: "visibleValue",
          fill: "fillValue",
          stroke: "strokeValue",
          color: "colorValue",
          text: "textValue",
          src: "srcValue",
        },
      },
    ]);

    const svg = renderSketchSceneToSvgMarkup(scene, {
      visibleValue: "false",
      fillValue: { bad: true },
      strokeValue: 42,
      colorValue: false,
      textValue: ["bad"],
      srcValue: 123,
    });

    expect(svg).toContain('data-sketch-node-id="card"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#111827"');
    expect(svg).toContain('fill="#111827" font-size=');
    expect(svg).toContain(">fallback</tspan>");
    expect(svg).not.toContain("[object Object]");
  });

  it("renders arrow markers with the line stroke color", () => {
    const svg = renderSketchSceneToSvgMarkup(
      testScene([
        {
          id: "arrow",
          type: "arrow",
          x: 20,
          y: 30,
          width: 120,
          height: 0,
          style: { stroke: "#EF4444", strokeWidth: 3 },
        },
      ]),
    );

    expect(svg).toContain('stroke="#EF4444"');
    expect(svg).toContain('fill="context-stroke"');
    expect(svg.match(/<path d="M0,0 L0,6 L9,3 z" fill="context-stroke" \/>/g)).toHaveLength(1);
    expect(svg).not.toContain('<path d="M0,0 L0,6 L9,3 z" fill="#1F2937"');
  });

  it("does not render invalid path nodes as fallback rectangles", () => {
    const invalidPathScene = {
      ...testScene([]),
      nodes: [{ id: "path", type: "path", x: 10, y: 20, width: 80, height: 40 } as SketchSceneNode],
    };

    const svg = renderSketchSceneToSvgMarkup(invalidPathScene);

    expect(svg).not.toContain('data-sketch-node-id="path"');
  });

  it("keeps text tspans aligned with their rendered text anchor", () => {
    const svg = renderSketchSceneToSvgMarkup(
      testScene([
        { id: "title", type: "text", x: 12, y: 16, width: 200, height: 40, text: "Title" },
        { id: "card", type: "card", x: 100, y: 80, width: 160, height: 90, text: "Card" },
      ]),
    );

    expect(svg).toContain('<text data-sketch-node-id="title" opacity="1" x="12"');
    expect(svg).toContain('<tspan x="12" dy="0">Title</tspan>');
    expect(svg).toContain('<text data-sketch-node-label="card" opacity="1" x="180"');
    expect(svg).toContain('<tspan x="180" dy="0">Card</tspan>');
    expect(svg).not.toContain('<tspan x="0"');
  });

  it("renders textStyleRuns as nested SVG tspans for text and labels", () => {
    const svg = renderSketchSceneToSvgMarkup(
      testScene([
        {
          id: "title",
          type: "text",
          x: 20,
          y: 24,
          width: 220,
          height: 48,
          text: "Hello world",
          style: { color: "#111827", fontSize: 18 },
          textStyleRuns: [
            {
              start: 0,
              length: 5,
              style: {
                color: "#EF4444",
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "Inter",
                italic: true,
                textDecoration: "underline",
                lineHeight: 28,
                letterSpacing: 0.5,
              },
            },
          ],
        },
        {
          id: "button",
          type: "button",
          x: 80,
          y: 120,
          width: 140,
          height: 48,
          text: "Run now",
          textStyleRuns: [
            {
              start: 4,
              length: 3,
              style: { color: "#2563EB", textDecoration: "line-through" },
            },
          ],
        },
      ]),
    );

    expect(svg).toContain(
      '<tspan x="20" dy="0"><tspan fill="#EF4444" font-size="22" font-weight="700" font-family="Inter" font-style="italic" text-decoration="underline" letter-spacing="0.5" style="line-height:28px">Hello</tspan> world</tspan>',
    );
    expect(svg).toContain(
      '<tspan x="150" dy="0">Run <tspan fill="#2563EB" text-decoration="line-through">now</tspan></tspan>',
    );
  });

  it("renders control labels with the same transform as their shape", () => {
    const svg = renderSketchSceneToSvgMarkup(
      testScene([
        { id: "button", type: "button", x: 40, y: 60, width: 120, height: 48, text: "Go", rotation: 30 },
      ]),
    );
    const transform = 'transform="rotate(30 100 84)"';

    expect(svg).toContain(`<rect data-sketch-node-id="button" opacity="1" ${transform}`);
    expect(svg).toContain(`<text data-sketch-node-label="button" opacity="1" ${transform}`);
  });

  it("keeps visual hash stable when metadata changes", () => {
    const scene = testScene([{ id: "a", type: "rect", x: 10, y: 10, width: 80, height: 40, metadata: { draft: 1 } }]);
    const changedMetadata = {
      ...scene,
      metadata: { updatedAt: 123 },
      nodes: [{ ...scene.nodes[0], metadata: { draft: 2 } }],
    };

    expect(getSketchSceneHashSource(scene)).toBe(getSketchSceneHashSource(changedMetadata));
  });

  it("bases visual hash on rendered output instead of unused config data", () => {
    const scene = bindSketchSceneConfigField(
      testScene([{ id: "title", type: "text", x: 12, y: 16, width: 200, height: 40, text: "fallback" }]),
      "title",
      "text",
      "headline",
    );
    const groupScene = testScene([
      { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 },
      {
        id: "group",
        type: "group",
        x: 10,
        y: 20,
        width: 80,
        height: 40,
        visible: false,
        children: ["a"],
        bindings: { visible: "showGroup" },
      },
    ]);

    expect(getSketchSceneHashSource(scene, { headline: "A", unused: 1 })).toBe(
      getSketchSceneHashSource(scene, { headline: "A", unused: 2 }),
    );
    expect(getSketchSceneHashSource(scene, { headline: "A" })).not.toBe(
      getSketchSceneHashSource(scene, { headline: "B" }),
    );
    expect(getSketchSceneHashSource(groupScene, { showGroup: false })).toBe(
      getSketchSceneHashSource(groupScene, { showGroup: true }),
    );
  });

  it("computes hit testing and transforms", () => {
    const node: SketchSceneNode = { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 };
    const translated = translateSketchNodes([node], { x: 2.2, y: 3.8 })[0];
    const resized = resizeSketchNode(node, "se", { x: 10, y: 20 });
    const rotated = rotateSketchNode(node, 45.4);

    expect(getSketchNodeBounds(node)).toEqual({ x: 10, y: 20, width: 80, height: 40 });
    expect(getSketchSelectionBounds([node, { ...node, id: "b", x: 100 }])).toEqual({ x: 10, y: 20, width: 170, height: 40 });
    expect(hitTestSketchScene(testScene([node]), { x: 20, y: 30 })?.id).toBe("a");
    expect(translated).toMatchObject({ x: 12, y: 24 });
    expect(translateSketchNodes([node], { x: -20, y: -30 })[0]).toMatchObject({ x: 0, y: 0 });
    expect(resized).toMatchObject({ width: 90, height: 60 });
    expect(rotated.rotation).toBe(45);
  });

  it("clamps directed line-like translation by both start and end points", () => {
    const leftLine: SketchSceneNode = { id: "left-line", type: "line", x: 20, y: 30, width: -10, height: 0 };
    const upArrow: SketchSceneNode = { id: "up-arrow", type: "arrow", x: 40, y: 20, width: 0, height: -10 };

    const [translatedLeftLine] = translateSketchNodes([leftLine], { x: -30, y: 0 });
    const [translatedUpArrow] = translateSketchNodes([upArrow], { x: 0, y: -30 });

    expect(translatedLeftLine).toMatchObject({ x: 10, y: 30, width: -10, height: 0 });
    expect(translatedUpArrow).toMatchObject({ x: 40, y: 10, width: 0, height: -10 });
    expect(validateSketchSceneDocument(testScene([translatedLeftLine, translatedUpArrow])).valid).toBe(true);
  });

  it("clamps multi-node translation with one shared selection delta", () => {
    const edge: SketchSceneNode = { id: "edge", type: "rect", x: 4, y: 12, width: 40, height: 30 };
    const far: SketchSceneNode = { id: "far", type: "card", x: 80, y: 50, width: 60, height: 40 };
    const leftArrow: SketchSceneNode = { id: "left-arrow", type: "arrow", x: 20, y: 30, width: -10, height: 0 };

    const [translatedEdge, translatedFar, translatedLeftArrow] = translateSketchNodes([edge, far, leftArrow], { x: -10, y: 0 });

    expect(translatedEdge).toMatchObject({ x: 0, y: 12 });
    expect(translatedFar).toMatchObject({ x: 76, y: 50 });
    expect(translatedLeftArrow).toMatchObject({ x: 16, y: 30, width: -10, height: 0 });
    expect(validateSketchSceneDocument(testScene([translatedEdge, translatedFar, translatedLeftArrow])).valid).toBe(true);
  });

  it("computes bounds from the visual geometry of rotated nodes", () => {
    const node: SketchSceneNode = { id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45 };
    const bounds = getSketchNodeBounds(node);
    const selectionBounds = getSketchSelectionBounds([
      node,
      { id: "plain", type: "rect", x: 220, y: 100, width: 20, height: 20 },
    ]);

    expect(bounds.x).toBeCloseTo(100.5, 1);
    expect(bounds.y).toBeCloseTo(70.5, 1);
    expect(bounds.width).toBeCloseTo(99, 1);
    expect(bounds.height).toBeCloseTo(99, 1);
    expect(selectionBounds?.x).toBeCloseTo(100.5, 1);
    expect(selectionBounds?.y).toBeCloseTo(70.5, 1);
    expect(selectionBounds?.width).toBeCloseTo(139.5, 1);
    expect(selectionBounds?.height).toBeCloseTo(99, 1);
  });

  it("hit tests line-like nodes using stroke tolerance instead of zero-height bounds", () => {
    const scene = testScene([
      { id: "line", type: "line", x: 20, y: 40, width: 120, height: 0, style: { strokeWidth: 2 } },
      { id: "arrow", type: "arrow", x: 20, y: 80, width: 120, height: 60, style: { strokeWidth: 3 }, zIndex: 1 },
    ]);

    expect(hitTestSketchScene(scene, { x: 80, y: 44 })?.id).toBe("line");
    expect(hitTestSketchScene(scene, { x: 80, y: 112 })?.id).toBe("arrow");
    expect(hitTestSketchScene(scene, { x: 80, y: 58 })).toBeNull();
  });

  it("does not hit semantic groups even when config bindings resolve them visible", () => {
    const scene = testScene([
      { id: "child", type: "rect", x: 20, y: 20, width: 80, height: 60, zIndex: 0 },
      {
        id: "group",
        type: "group",
        x: 10,
        y: 10,
        width: 120,
        height: 90,
        visible: false,
        zIndex: 10,
        bindings: { visible: "showGroup" },
        children: ["child"],
      },
    ]);

    expect(hitTestSketchScene(scene, { x: 40, y: 40 }, { showGroup: true })?.id).toBe("child");
  });

  it("does not render or hit image nodes whose src binding is unresolved", () => {
    const scene = testScene([
      { id: "bound-image", type: "image", x: 20, y: 20, width: 100, height: 80, bindings: { src: "heroImage" } },
      { id: "back", type: "rect", x: 40, y: 40, width: 100, height: 80, zIndex: -1 },
    ]);

    expect(renderSketchSceneToSvgMarkup(scene)).not.toContain('data-sketch-node-id="bound-image"');
    expect(hitTestSketchScene(scene, { x: 60, y: 60 })?.id).toBe("back");
    expect(hitTestSketchScene(scene, { x: 60, y: 60 }, { heroImage: "data:image/png;base64,abc" })?.id).toBe("bound-image");
    expect(hitTestSketchScene(scene, { x: 60, y: 60 }, { heroImage: 123 })?.id).toBe("back");
  });

  it("hit tests the visually topmost overlapping node", () => {
    const scene = testScene([
      { id: "back", type: "rect", x: 20, y: 20, width: 100, height: 80 },
      { id: "front", type: "rect", x: 40, y: 40, width: 100, height: 80 },
    ]);
    const zIndexedScene = testScene([
      { id: "front", type: "rect", x: 40, y: 40, width: 100, height: 80, zIndex: 1 },
      { id: "back", type: "rect", x: 20, y: 20, width: 100, height: 80, zIndex: 2 },
    ]);

    expect(hitTestSketchScene(scene, { x: 60, y: 60 })?.id).toBe("front");
    expect(hitTestSketchScene(zIndexedScene, { x: 60, y: 60 })?.id).toBe("back");
  });

  it("hit tests against config-bound visibility like the renderer", () => {
    const scene = testScene([
      {
        id: "bound-hidden",
        type: "rect",
        x: 20,
        y: 20,
        width: 100,
        height: 80,
        bindings: { visible: "showLayer" },
        zIndex: 2,
      },
      { id: "back", type: "rect", x: 40, y: 40, width: 100, height: 80, zIndex: 1 },
    ]);

    expect(hitTestSketchScene(scene, { x: 60, y: 60 }, { showLayer: true })?.id).toBe("bound-hidden");
    expect(hitTestSketchScene(scene, { x: 60, y: 60 }, { showLayer: false })?.id).toBe("back");
  });

  it("hit tests rotated nodes against their visual geometry", () => {
    const scene = testScene([
      { id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45 },
    ]);

    expect(hitTestSketchScene(scene, { x: 150, y: 120 })?.id).toBe("rotated");
    expect(hitTestSketchScene(scene, { x: 100, y: 100 })).toBeNull();
    expect(hitTestSketchScene(scene, { x: 170, y: 166 })?.id).toBe("rotated");
  });

  it("keeps north and west resize anchored when clamped to minimum size", () => {
    const node: SketchSceneNode = { id: "a", type: "rect", x: 10, y: 20, width: 80, height: 40 };

    expect(resizeSketchNode(node, "w", { x: 120, y: 0 })).toMatchObject({
      x: 82,
      width: 8,
    });
    expect(resizeSketchNode(node, "n", { x: 0, y: 80 })).toMatchObject({
      y: 52,
      height: 8,
    });
    expect(resizeSketchNode(node, "nw", { x: 120, y: 80 })).toMatchObject({
      x: 82,
      y: 52,
      width: 8,
      height: 8,
    });
  });

  it("clamps north and west resize to the page origin while preserving the opposite edge", () => {
    const node: SketchSceneNode = { id: "a", type: "rect", x: 10, y: 12, width: 80, height: 40 };

    expect(resizeSketchNode(node, "w", { x: -24, y: 0 })).toMatchObject({
      x: 0,
      width: 90,
    });
    expect(resizeSketchNode(node, "n", { x: 0, y: -20 })).toMatchObject({
      y: 0,
      height: 52,
    });
    expect(resizeSketchNode(node, "nw", { x: -24, y: -20 })).toMatchObject({
      x: 0,
      y: 0,
      width: 90,
      height: 52,
    });
  });

  it("keeps line-like nodes valid when resize collapses both dimensions", () => {
    const node: SketchSceneNode = { id: "line", type: "line", x: 10, y: 20, width: 80, height: 0 };

    expect(resizeSketchNode(node, "w", { x: 80, y: 0 })).toMatchObject({
      width: 1,
      height: 0,
    });
    expect(validateSketchSceneDocument(testScene([resizeSketchNode(node, "w", { x: 80, y: 0 })])).valid).toBe(true);
  });

  it("preserves negative line-like direction when resize collapses to minimum length", () => {
    const leftLine: SketchSceneNode = { id: "left-line", type: "line", x: 20, y: 30, width: -10, height: 0 };
    const upArrow: SketchSceneNode = { id: "up-arrow", type: "arrow", x: 40, y: 20, width: 0, height: -10 };

    const resizedLeftLine = resizeSketchNode(leftLine, "e", { x: 10, y: 0 });
    const resizedUpArrow = resizeSketchNode(upArrow, "s", { x: 0, y: 10 });

    expect(resizedLeftLine).toMatchObject({ x: 20, y: 30, width: -1, height: 0 });
    expect(resizedUpArrow).toMatchObject({ x: 40, y: 20, width: 0, height: -1 });
    expect(validateSketchSceneDocument(testScene([resizedLeftLine, resizedUpArrow])).valid).toBe(true);
  });

  it("preserves diagonal line-like direction when resize collapses to minimum length", () => {
    const downRightLine: SketchSceneNode = { id: "down-right", type: "line", x: 20, y: 30, width: 10, height: 10 };
    const upLeftArrow: SketchSceneNode = { id: "up-left", type: "arrow", x: 40, y: 40, width: -10, height: -10 };

    const resizedDownRightLine = resizeSketchNode(downRightLine, "se", { x: -10, y: -10 });
    const resizedUpLeftArrow = resizeSketchNode(upLeftArrow, "se", { x: 10, y: 10 });

    expect(resizedDownRightLine).toMatchObject({ x: 20, y: 30, width: 1, height: 1 });
    expect(resizedUpLeftArrow).toMatchObject({ x: 40, y: 40, width: -1, height: -1 });
    expect(validateSketchSceneDocument(testScene([resizedDownRightLine, resizedUpLeftArrow])).valid).toBe(true);
  });

  it("clamps directed line-like resize endpoints to the page origin", () => {
    const leftLine: SketchSceneNode = { id: "left-line", type: "line", x: 20, y: 30, width: -10, height: 0 };
    const upArrow: SketchSceneNode = { id: "up-arrow", type: "arrow", x: 40, y: 20, width: 0, height: -10 };

    const resizedLeftLine = resizeSketchNode(leftLine, "e", { x: -30, y: 0 });
    const resizedUpArrow = resizeSketchNode(upArrow, "s", { x: 0, y: -30 });

    expect(resizedLeftLine).toMatchObject({ x: 20, y: 30, width: -20, height: 0 });
    expect(resizedUpArrow).toMatchObject({ x: 40, y: 20, width: 0, height: -20 });
    expect(validateSketchSceneDocument(testScene([resizedLeftLine, resizedUpArrow])).valid).toBe(true);
  });
});
