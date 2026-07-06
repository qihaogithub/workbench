import { createDefaultSketchScene } from "@workbench/shared";

import {
  buildOpenPencilPatchMergeConflictSummary,
  createOpenPencilMergeConflictError,
  filterOpenPencilPatchOperationsForMergeResolution,
  getOpenPencilMergeFieldConflictKey,
  getOpenPencilMergeConflictSummary,
  hasOpenPencilPatchMergeConflicts,
} from "./openpencil-merge-conflict";

describe("openpencil merge conflict", () => {
  it("标记缺失目标节点和重复新增节点", () => {
    const scene = createDefaultSketchScene();
    const summary = buildOpenPencilPatchMergeConflictSummary(scene, [
      {
        op: "update",
        nodeId: "missing-node",
        patch: { text: "无法合并" },
      },
      {
        op: "add",
        node: {
          ...scene.nodes[0],
          id: "title",
        },
      },
    ]);

    expect(summary).toMatchObject({
      operationCount: 2,
      latestNodeCount: scene.nodes.length,
      missingNodeIds: ["missing-node"],
      duplicateNodeIds: ["title"],
      fieldConflicts: [],
      incompatibleOperationCount: 2,
    });
    expect(summary.affectedNodeIds).toEqual(["missing-node", "title"]);
    expect(summary.operationConflicts).toEqual([
      {
        operationIndex: 0,
        operationType: "update",
        affectedNodeIds: ["missing-node"],
        reasons: ["missing-node"],
        fields: [],
      },
      {
        operationIndex: 1,
        operationType: "add",
        affectedNodeIds: ["title"],
        reasons: ["duplicate-node"],
        fields: [],
      },
    ]);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(true);
  });

  it("允许目标仍存在的更新 patch 自动重放", () => {
    const scene = createDefaultSketchScene();
    const summary = buildOpenPencilPatchMergeConflictSummary(scene, [
      {
        op: "update",
        nodeId: "title",
        patch: { text: "可以合并" },
      },
    ]);

    expect(summary.missingNodeIds).toEqual([]);
    expect(summary.duplicateNodeIds).toEqual([]);
    expect(summary.fieldConflicts).toEqual([]);
    expect(summary.incompatibleOperationCount).toBe(0);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(false);
  });

  it("标记 stale base 后同一字段已被最新内容改动的更新 patch", () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, text: "协同侧标题" } : node,
      ),
    };
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      [
        {
          op: "update",
          nodeId: "title",
          patch: { text: "本地侧标题" },
        },
      ],
      { baseScene },
    );

    expect(summary.fieldConflicts).toEqual([
      {
        nodeId: "title",
        fields: ["text"],
        details: [
          {
            field: "text",
            baseValue: "\"手绘页面\"",
            latestValue: "\"协同侧标题\"",
            draftValue: "\"本地侧标题\"",
          },
        ],
      },
    ]);
    expect(summary.operationConflicts).toEqual([
      {
        operationIndex: 0,
        operationType: "update",
        affectedNodeIds: ["title"],
        reasons: ["same-field-change"],
        fields: ["title.text"],
      },
    ]);
    expect(summary.incompatibleOperationCount).toBe(1);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(true);
  });

  it("允许 stale base 后不同字段的更新 patch 自动重放", () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, x: node.x + 12 } : node,
      ),
    };
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      [
        {
          op: "update",
          nodeId: "title",
          patch: { text: "本地侧标题" },
        },
      ],
      { baseScene },
    );

    expect(summary.fieldConflicts).toEqual([]);
    expect(summary.incompatibleOperationCount).toBe(0);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(false);
  });

  it("允许用户选择覆盖指定同字段冲突", () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, text: "协同侧标题" } : node,
      ),
    };
    const operations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
    ];

    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      operations,
      {
        baseScene,
        ignoredFieldConflictKeys: [
          getOpenPencilMergeFieldConflictKey("title", "text"),
        ],
      },
    );

    expect(summary.fieldConflicts).toEqual([]);
    expect(summary.operationConflicts).toEqual([]);
    expect(summary.incompatibleOperationCount).toBe(0);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(false);
  });

  it("只覆盖用户选择的字段冲突，未选择字段仍阻断合并", () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title"
          ? { ...node, text: "协同侧标题", x: node.x + 24 }
          : node,
      ),
    };
    const operations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题", x: 144 },
      },
    ];

    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      operations,
      {
        baseScene,
        ignoredFieldConflictKeys: [
          getOpenPencilMergeFieldConflictKey("title", "text"),
        ],
      },
    );

    expect(summary.fieldConflicts).toEqual([
      {
        nodeId: "title",
        fields: ["x"],
        details: [
          {
            field: "x",
            baseValue: "96",
            latestValue: "120",
            draftValue: "144",
          },
        ],
      },
    ]);
    expect(summary.operationConflicts).toEqual([
      {
        operationIndex: 0,
        operationType: "update",
        affectedNodeIds: ["title"],
        reasons: ["same-field-change"],
        fields: ["title.x"],
      },
    ]);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(true);
  });

  it("同字段最终值已经一致时不标记冲突", () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, text: "相同标题" } : node,
      ),
    };
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      [
        {
          op: "update",
          nodeId: "title",
          patch: { text: "相同标题" },
        },
      ],
      { baseScene },
    );

    expect(summary.fieldConflicts).toEqual([]);
    expect(summary.operationConflicts).toEqual([]);
    expect(hasOpenPencilPatchMergeConflicts(summary)).toBe(false);
  });

  it("跳过冲突操作和触碰相同图层的后续操作，保留独立操作", () => {
    const baseScene = createDefaultSketchScene();
    const secondaryNode = {
      ...baseScene.nodes[0],
      id: "secondary",
      text: "辅助节点",
      x: baseScene.nodes[0].x + 160,
    };
    const latestScene = {
      ...baseScene,
      nodes: [
        ...baseScene.nodes.map((node) =>
          node.id === "title" ? { ...node, text: "协同侧标题" } : node,
        ),
        secondaryNode,
      ],
    };
    const operations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
      {
        op: "update" as const,
        nodeId: "title",
        patch: { x: 96 },
      },
      {
        op: "update" as const,
        nodeId: "secondary",
        patch: { text: "可合并" },
      },
    ];
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      operations,
      { baseScene },
    );

    const filtered = filterOpenPencilPatchOperationsForMergeResolution(
      operations,
      summary,
      "skip-conflicting-operations",
    );

    expect(filtered.operations).toEqual([operations[2]]);
    expect(filtered.skippedOperationIndices).toEqual([0, 1]);
    expect(filtered.skippedAffectedNodeIds).toEqual(["title"]);
  });

  it("按选择跳过部分冲突操作，未选择的冲突操作仍保留给后续校验", () => {
    const baseScene = createDefaultSketchScene();
    const secondaryNode = {
      ...baseScene.nodes[0],
      id: "secondary",
      text: "辅助节点",
      x: baseScene.nodes[0].x + 160,
    };
    const latestScene = {
      ...baseScene,
      nodes: [
        ...baseScene.nodes.map((node) =>
          node.id === "title" ? { ...node, text: "协同侧标题" } : node,
        ),
        { ...secondaryNode, text: "协同侧辅助" },
      ],
    };
    const operations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
      {
        op: "update" as const,
        nodeId: "secondary",
        patch: { text: "本地侧辅助" },
      },
      {
        op: "update" as const,
        nodeId: "title",
        patch: { x: 96 },
      },
    ];
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      operations,
      { baseScene: { ...baseScene, nodes: [...baseScene.nodes, secondaryNode] } },
    );

    const filtered = filterOpenPencilPatchOperationsForMergeResolution(
      operations,
      summary,
      "skip-selected-operations",
      { skipOperationIndices: [0] },
    );

    expect(filtered.operations).toEqual([operations[1]]);
    expect(filtered.skippedOperationIndices).toEqual([0, 2]);
    expect(filtered.skippedAffectedNodeIds).toEqual(["title"]);
  });

  it("按选择跳过全部冲突操作后保留独立安全操作", () => {
    const baseScene = createDefaultSketchScene();
    const secondaryNode = {
      ...baseScene.nodes[0],
      id: "secondary",
      text: "辅助节点",
      x: baseScene.nodes[0].x + 160,
    };
    const independentNode = {
      ...baseScene.nodes[0],
      id: "independent",
      text: "独立节点",
      x: baseScene.nodes[0].x + 320,
    };
    const baseWithExtraNodes = {
      ...baseScene,
      nodes: [...baseScene.nodes, secondaryNode, independentNode],
    };
    const latestScene = {
      ...baseWithExtraNodes,
      nodes: baseWithExtraNodes.nodes.map((node) => {
        if (node.id === "title") return { ...node, text: "协同侧标题" };
        if (node.id === "secondary") return { ...node, text: "协同侧辅助" };
        return node;
      }),
    };
    const operations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
      {
        op: "update" as const,
        nodeId: "secondary",
        patch: { text: "本地侧辅助" },
      },
      {
        op: "update" as const,
        nodeId: "independent",
        patch: { text: "可合并" },
      },
    ];
    const summary = buildOpenPencilPatchMergeConflictSummary(
      latestScene,
      operations,
      { baseScene: baseWithExtraNodes },
    );

    const filtered = filterOpenPencilPatchOperationsForMergeResolution(
      operations,
      summary,
      "skip-selected-operations",
      { skipOperationIndices: [0, 1] },
    );

    expect(filtered.operations).toEqual([operations[2]]);
    expect(filtered.skippedOperationIndices).toEqual([0, 1]);
    expect(filtered.skippedAffectedNodeIds).toEqual(["secondary", "title"]);
  });

  it("从错误对象读取合并冲突摘要", () => {
    const scene = createDefaultSketchScene();
    const summary = buildOpenPencilPatchMergeConflictSummary(scene, [
      {
        op: "delete",
        nodeId: "missing-node",
      },
    ]);
    const error = createOpenPencilMergeConflictError("无法自动合并", summary);

    expect(getOpenPencilMergeConflictSummary(error)).toBe(summary);
    expect(getOpenPencilMergeConflictSummary(new Error("普通错误"))).toBeNull();
  });
});
