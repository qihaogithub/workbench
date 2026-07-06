import type { SketchSceneDocument } from "@workbench/shared";
import {
  createOpenPencilPatchSummaryRecord,
  readOpenPencilPatchSummaryForScene,
} from "../lib/openpencil-patch-summary";

function sceneWithNodes(nodeIds: string[]): SketchSceneDocument {
  return {
    version: 1,
    pageSize: { width: 800, height: 600 },
    nodes: nodeIds.map((id, index) => ({
      id,
      type: "rect",
      x: index * 10,
      y: index * 10,
      width: 100,
      height: 60,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      style: {},
    })),
  };
}

describe("openpencil-patch-summary", () => {
  it("为 OpenPencil patch 保存生成版本摘要", () => {
    const baseSceneKey = JSON.stringify(sceneWithNodes(["base-1"]));
    const targetScene = sceneWithNodes(["base-1", "added-1"]);

    const record = createOpenPencilPatchSummaryRecord(targetScene, {
      patchBaseSceneKey: baseSceneKey,
      patchOperations: [
        { op: "delete", nodeId: "old-node" },
        { op: "reorder", nodeIds: ["base-1", "added-1"] },
      ],
    });

    expect(record?.summary).toEqual({
      operationCount: 2,
      hasBaseSceneKey: true,
      currentNodeCount: 1,
      targetNodeCount: 2,
    });
    expect(readOpenPencilPatchSummaryForScene(record, targetScene)).toBe(
      record?.summary,
    );
  });

  it("当前 scene 不匹配最近保存结果时不复用摘要", () => {
    const record = createOpenPencilPatchSummaryRecord(sceneWithNodes(["a"]), {
      patchOperations: [{ op: "delete", nodeId: "a" }],
    });

    expect(readOpenPencilPatchSummaryForScene(record, sceneWithNodes(["b"]))).toBeUndefined();
  });
});
