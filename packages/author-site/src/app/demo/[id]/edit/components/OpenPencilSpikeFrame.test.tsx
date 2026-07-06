import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  createDefaultSketchScene,
  createOpenPencilDirtyStateMessage,
  type OpenPencilUiState,
} from "@workbench/shared";
import {
  buildOpenPencilImageProxyUrl,
  OpenPencilInspectorPanel,
  OpenPencilSpikeFrame,
} from "./OpenPencilSpikeFrame";
import {
  buildOpenPencilPatchMergeConflictSummary,
  createOpenPencilMergeConflictError,
} from "../lib/openpencil-merge-conflict";
import { createOpenPencilSaveFailureError } from "../lib/openpencil-save-error";

const baseState: OpenPencilUiState = {
  pageId: "page-sketch",
  pageName: "草图页",
  bridgeStatus: "loaded",
  configKeyCount: 0,
  layerCount: 1,
  layers: [],
  selection: {
    count: 1,
    type: "TEXT",
    current: "标题",
  },
  inspector: {
    selectedNode: {
      id: "node-text-1",
      name: "标题",
      type: "TEXT",
      text: "Hello",
      textStyleRuns: [
        {
          start: 0,
          length: 5,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
          },
        },
      ],
      supportsText: true,
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      rotation: 0,
      supportsGeometry: true,
      supportsImageResource: false,
      bindings: {},
      supportsBindings: true,
    },
  },
  commands: {
    duplicateSelection: false,
    deleteSelection: false,
    groupSelection: false,
    ungroupSelection: false,
    zoomToSelection: false,
    undo: false,
    redo: false,
  },
};

describe("OpenPencilInspectorPanel 文本样式", () => {
  it("默认不在属性面板显示 Host Bridge 调试信息", () => {
    render(
      <OpenPencilInspectorPanel
        state={baseState}
        onUpdateNode={jest.fn()}
      />,
    );

    expect(screen.queryByText("Host Bridge")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Hello")).toBeInTheDocument();
  });

  it("只在调试入口显式开启时显示 Host Bridge 信息", () => {
    render(
      <OpenPencilInspectorPanel
        state={baseState}
        onUpdateNode={jest.fn()}
        showDebugInfo
      />,
    );

    expect(screen.getByText("Host Bridge")).toBeInTheDocument();
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(screen.getByText("page-sketch")).toBeInTheDocument();
  });

  it("将文本样式编辑作为整段 textStyleRuns 更新发送给 iframe", () => {
    const onUpdateNode = jest.fn();

    render(
      <OpenPencilInspectorPanel
        state={baseState}
        onUpdateNode={onUpdateNode}
      />,
    );

    fireEvent.change(screen.getByLabelText("文本字号"), {
      target: { value: "24" },
    });

    expect(onUpdateNode).toHaveBeenLastCalledWith("node-text-1", {
      textStyleRuns: [
        {
          start: 0,
          length: 5,
          style: {
            color: "#111827",
            fontSize: 24,
            fontWeight: 400,
          },
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "斜体" }));

    expect(onUpdateNode).toHaveBeenLastCalledWith("node-text-1", {
      textStyleRuns: [
        {
          start: 0,
          length: 5,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
            italic: true,
          },
        },
      ],
    });
  });

  it("将文本样式编辑应用到文本框选区并保留选区外 runs", () => {
    const onUpdateNode = jest.fn();

    render(
      <OpenPencilInspectorPanel
        state={baseState}
        onUpdateNode={onUpdateNode}
      />,
    );

    const textInput = screen.getByDisplayValue("Hello") as HTMLTextAreaElement;
    textInput.selectionStart = 1;
    textInput.selectionEnd = 4;
    fireEvent.select(textInput);

    fireEvent.change(screen.getByLabelText("文本字号"), {
      target: { value: "24" },
    });

    expect(onUpdateNode).toHaveBeenLastCalledWith("node-text-1", {
      textStyleRuns: [
        {
          start: 0,
          length: 1,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
          },
        },
        {
          start: 1,
          length: 3,
          style: {
            color: "#111827",
            fontSize: 24,
            fontWeight: 400,
          },
        },
        {
          start: 4,
          length: 1,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
          },
        },
      ],
    });
    expect(screen.getByText("选区样式 1-4")).toBeInTheDocument();
  });

  it("将文本样式编辑应用到 iframe 回传的画布文本选区", () => {
    const onUpdateNode = jest.fn();

    render(
      <OpenPencilInspectorPanel
        state={{
          ...baseState,
          inspector: {
            selectedNode: {
              ...baseState.inspector.selectedNode!,
              textSelectionRange: {
                start: 1,
                end: 4,
                source: "canvas",
              },
            },
          },
        }}
        onUpdateNode={onUpdateNode}
      />,
    );

    fireEvent.change(screen.getByLabelText("文本字号"), {
      target: { value: "24" },
    });

    expect(onUpdateNode).toHaveBeenLastCalledWith("node-text-1", {
      textStyleRuns: [
        {
          start: 0,
          length: 1,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
          },
        },
        {
          start: 1,
          length: 3,
          style: {
            color: "#111827",
            fontSize: 24,
            fontWeight: 400,
          },
        },
        {
          start: 4,
          length: 1,
          style: {
            color: "#111827",
            fontSize: 16,
            fontWeight: 400,
          },
        },
      ],
    });
    expect(screen.getByText("画布选区样式 1-4")).toBeInTheDocument();
  });
});

describe("OpenPencilSpikeFrame 保存错误", () => {
  it("无 patch 的 dirty-state 显示临时全量草稿并按全量草稿提交", async () => {
    const scene = createDefaultSketchScene();
    const onSceneCommit = jest.fn(async () => undefined);

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={scene}
        configData={{}}
        onSceneCommit={onSceneCommit}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene,
          }),
        }),
      );
    });

    expect(await screen.findByText(/临时全量草稿/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存手绘" }));
    });

    expect(onSceneCommit).toHaveBeenCalledWith(scene, undefined);
  });

  it("保存失败时显示可读错误并保留重试入口", async () => {
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onReloadLatestScene = jest.fn();
    const onMergeLatestSceneWithDraft = jest.fn(async () => createDefaultSketchScene());
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "合并后的标题" },
      },
    ];

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={createDefaultSketchScene()}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onReloadLatestScene={onReloadLatestScene}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene: createDefaultSketchScene(),
            patchBaseSceneKey: "stale-base",
            patchOperations,
          }),
        }),
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));

    expect(await screen.findByText("手绘保存失败")).toBeInTheDocument();
    expect(
      screen.getByText("手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载最新手绘内容" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "合并本次手绘改动" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "合并本次手绘改动" }));
    });

    expect(onReloadLatestScene).not.toHaveBeenCalled();
    expect(onMergeLatestSceneWithDraft).toHaveBeenCalledWith(
      {
        patchBaseSceneKey: "stale-base",
        patchOperations,
      },
      { conflictResolution: "strict" },
    );
  });

  it("合并失败时展示自动合并冲突摘要", async () => {
    const scene = createDefaultSketchScene();
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "missing-node",
        patch: { text: "无法合并" },
      },
    ];
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest.fn(async () => {
      throw createOpenPencilMergeConflictError(
        "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
        buildOpenPencilPatchMergeConflictSummary(scene, patchOperations),
      );
    });

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={scene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene,
            patchBaseSceneKey: "stale-base",
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    expect(await screen.findByRole("button", { name: "合并本次手绘改动" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "合并本次手绘改动" }));
    });

    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();
    expect(screen.getByText(/1 个操作，1 个无法自动重放/)).toBeInTheDocument();
    expect(screen.getByText("#1 update")).toBeInTheDocument();
    expect(screen.getByText("原因：目标图层不存在")).toBeInTheDocument();
    expect(screen.getByText("图层：missing-node")).toBeInTheDocument();
    expect(screen.getByText(/已不存在：missing-node/)).toBeInTheDocument();
  });

  it("合并失败时展示字段级冲突摘要", async () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, text: "协同侧标题" } : node,
      ),
    };
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
    ];
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest.fn(async () => {
      throw createOpenPencilMergeConflictError(
        "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
        buildOpenPencilPatchMergeConflictSummary(
          latestScene,
          patchOperations,
          { baseScene },
        ),
      );
    });

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={baseScene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene: latestScene,
            patchBaseSceneKey: JSON.stringify(baseScene),
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    expect(await screen.findByRole("button", { name: "合并本次手绘改动" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "合并本次手绘改动" }));
    });

    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();
    expect(screen.getByText("#1 update")).toBeInTheDocument();
    expect(screen.getByText("原因：同一字段已变更")).toBeInTheDocument();
    expect(screen.getByText("字段：title.text")).toBeInTheDocument();
    expect(screen.getByText(/字段冲突：title.text/)).toBeInTheDocument();
    expect(screen.getByText("基线：\"手绘页面\"")).toBeInTheDocument();
    expect(screen.getByText("最新：\"协同侧标题\"")).toBeInTheDocument();
    expect(screen.getByText("本次：\"本地侧标题\"")).toBeInTheDocument();
  });

  it("加载最新并手工处理时保留冲突参考", async () => {
    const scene = createDefaultSketchScene();
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "missing-node",
        patch: { text: "无法合并" },
      },
    ];
    const onReloadLatestScene = jest.fn(async () => undefined);
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest.fn(async () => {
      throw createOpenPencilMergeConflictError(
        "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
        buildOpenPencilPatchMergeConflictSummary(scene, patchOperations),
      );
    });

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={scene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onReloadLatestScene={onReloadLatestScene}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene,
            patchBaseSceneKey: "stale-base",
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "合并本次手绘改动" }));
    });
    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载最新并手工处理" }));
    });

    expect(onReloadLatestScene).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("手绘保存失败")).not.toBeInTheDocument();
    expect(screen.getByText("手工处理参考")).toBeInTheDocument();
    expect(
      screen.getByText("已加载最新手绘内容。请按下列冲突参考在画布中手工重做需要保留的改动。"),
    ).toBeInTheDocument();
    expect(screen.getByText("#1 update")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "关闭参考" }));
    });
    expect(screen.queryByText("手工处理参考")).not.toBeInTheDocument();
  });

  it("允许按默认选择跳过冲突操作后合并其余手绘改动", async () => {
    const scene = createDefaultSketchScene();
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "missing-node",
        patch: { text: "无法合并" },
      },
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "可合并" },
      },
    ];
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw createOpenPencilMergeConflictError(
          "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
          buildOpenPencilPatchMergeConflictSummary(scene, patchOperations),
        );
      })
      .mockResolvedValueOnce(scene);

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={scene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene,
            patchBaseSceneKey: "stale-base",
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "合并本次手绘改动" }));
    });
    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();
    expect(screen.getByText("已选择跳过 1 个冲突操作")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "按选择跳过并合并其余" }),
      );
    });

    expect(onMergeLatestSceneWithDraft).toHaveBeenLastCalledWith(
      {
        patchBaseSceneKey: "stale-base",
        patchOperations,
      },
      {
        conflictResolution: "skip-selected-operations",
        skipOperationIndices: [0],
      },
    );
  });

  it("允许逐项调整需要跳过的冲突操作", async () => {
    const scene = createDefaultSketchScene();
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "missing-a",
        patch: { text: "无法合并 A" },
      },
      {
        op: "update" as const,
        nodeId: "missing-b",
        patch: { text: "无法合并 B" },
      },
    ];
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw createOpenPencilMergeConflictError(
          "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
          buildOpenPencilPatchMergeConflictSummary(scene, patchOperations),
        );
      })
      .mockResolvedValueOnce(scene);

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={scene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene,
            patchBaseSceneKey: "stale-base",
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "合并本次手绘改动" }));
    });
    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();
    expect(screen.getByText("已选择跳过 2 个冲突操作")).toBeInTheDocument();

    const skipCheckboxes = screen.getAllByLabelText("跳过");
    await act(async () => {
      fireEvent.click(skipCheckboxes[1]);
    });
    expect(screen.getByText("已选择跳过 1 个冲突操作")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "按选择跳过并合并其余" }),
      );
    });

    expect(onMergeLatestSceneWithDraft).toHaveBeenLastCalledWith(
      {
        patchBaseSceneKey: "stale-base",
        patchOperations,
      },
      {
        conflictResolution: "skip-selected-operations",
        skipOperationIndices: [0],
      },
    );
  });

  it("允许按选择覆盖字段冲突后继续合并", async () => {
    const baseScene = createDefaultSketchScene();
    const latestScene = {
      ...baseScene,
      nodes: baseScene.nodes.map((node) =>
        node.id === "title" ? { ...node, text: "协同侧标题" } : node,
      ),
    };
    const patchOperations = [
      {
        op: "update" as const,
        nodeId: "title",
        patch: { text: "本地侧标题" },
      },
    ];
    const onSceneCommit = jest.fn(async () => {
      throw createOpenPencilSaveFailureError({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      });
    });
    const onMergeLatestSceneWithDraft = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw createOpenPencilMergeConflictError(
          "本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。",
          buildOpenPencilPatchMergeConflictSummary(
            latestScene,
            patchOperations,
            { baseScene },
          ),
        );
      })
      .mockResolvedValueOnce(latestScene);

    render(
      <OpenPencilSpikeFrame
        editorUrl="http://127.0.0.1:3410"
        pageId="page-sketch"
        pageName="草图页"
        scene={baseScene}
        configData={{}}
        onSceneCommit={onSceneCommit}
        onMergeLatestSceneWithDraft={onMergeLatestSceneWithDraft}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "http://127.0.0.1:3410",
          data: createOpenPencilDirtyStateMessage({
            pageId: "page-sketch",
            dirty: true,
            nodeCount: 1,
            scene: baseScene,
            patchBaseSceneKey: JSON.stringify(baseScene),
            patchOperations,
          }),
        }),
      );
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "保存手绘" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "合并本次手绘改动" }));
    });
    expect(await screen.findByText("自动合并摘要")).toBeInTheDocument();
    expect(screen.getByText("已选择覆盖 0 个字段冲突")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "按选择覆盖字段并合并" }),
    ).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("覆盖为本次"));
    });
    expect(screen.getByText("已选择覆盖 1 个字段冲突")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "按选择覆盖字段并合并" }),
      );
    });

    expect(onMergeLatestSceneWithDraft).toHaveBeenLastCalledWith(
      {
        patchBaseSceneKey: JSON.stringify(baseScene),
        patchOperations,
      },
      {
        conflictResolution: "override-selected-field-conflicts",
        overrideFieldConflictKeys: ["title.text"],
      },
    );
  });
});

describe("OpenPencilSpikeFrame 图片代理", () => {
  it("构造带审计上下文的同源图片代理地址", () => {
    const url = new URL(
      buildOpenPencilImageProxyUrl("http://localhost:3200", "page-sketch", {
        editorSessionId: "editor-session-1",
        projectId: "project-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        traceId: "trace-image-proxy",
      }),
    );

    expect(url.pathname).toBe("/api/openpencil/image-proxy");
    expect(url.searchParams.get("editorSessionId")).toBe("editor-session-1");
    expect(url.searchParams.get("projectId")).toBe("project-1");
    expect(url.searchParams.get("sessionId")).toBe("session-1");
    expect(url.searchParams.get("workspaceId")).toBe("workspace-1");
    expect(url.searchParams.get("pageId")).toBe("page-sketch");
    expect(url.searchParams.get("traceId")).toBe("trace-image-proxy");
  });
});
