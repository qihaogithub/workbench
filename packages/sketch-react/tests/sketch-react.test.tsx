import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSketchNodeBounds,
  validateSketchSceneDocument,
  type SketchSceneDocument,
  type SketchSceneNode,
} from "@workbench/sketch-core";

import {
  SketchEditorCanvas,
  SketchEditorToolbar,
  SketchLayerPanel,
  SketchPropertyPanel,
  SketchPageEditor,
  SketchPagePreview,
  useSketchEditorState,
  useSketchHistory,
  type SketchEditorSelection,
} from "../src";
import { SketchPagePreview as LightweightSketchPagePreview } from "../src/preview";

const scene: SketchSceneDocument = {
  version: 1,
  pageSize: { width: 400, height: 300 },
  nodes: [
    {
      id: "title",
      type: "text",
      x: 20,
      y: 30,
      width: 200,
      height: 40,
      text: "Fallback",
      bindings: { text: "headline" },
    },
    {
      id: "card",
      type: "card",
      x: 60,
      y: 100,
      width: 160,
      height: 90,
      text: "Card",
    },
  ],
};

function ControlledEditor({
  initialScene = scene,
  onSelectionChange,
  mode = "edit",
}: {
  initialScene?: SketchSceneDocument;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
  mode?: "edit" | "preview";
}) {
  const [value, setValue] = React.useState(initialScene);
  return (
    <>
      <SketchPageEditor
        scene={value}
        configData={{ headline: "Bound headline" }}
        previewSize={{ width: 400, height: 300 }}
        mode={mode}
        onSceneChange={setValue}
        onSelectionChange={onSelectionChange}
      />
      <output data-testid="scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

function ControlledPartsEditor({
  initialScene,
  configData = {},
}: {
  initialScene: SketchSceneDocument;
  configData?: Record<string, unknown>;
}) {
  const [value, setValue] = React.useState(initialScene);
  const controller = useSketchEditorState(value, setValue, undefined, configData);
  return (
    <>
      <SketchLayerPanel scene={value} controller={controller} configData={configData} />
      <SketchEditorCanvas scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <output data-testid="scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

function PartsSelectionCallbackHarnessWithConfig({
  initialScene,
  configData,
}: {
  initialScene: SketchSceneDocument;
  configData: Record<string, unknown>;
}) {
  const [events, setEvents] = React.useState<SketchEditorSelection[]>([]);
  const controller = useSketchEditorState(
    initialScene,
    undefined,
    (selection) => {
      setEvents((current) => [...current, selection]);
    },
    configData,
  );
  return (
    <>
      <SketchLayerPanel scene={initialScene} controller={controller} configData={configData} />
      <output data-testid="selection-events">{JSON.stringify(events)}</output>
    </>
  );
}

function ControlledPartsEditorWithToolbar({
  initialScene,
  configData = {},
}: {
  initialScene: SketchSceneDocument;
  configData?: Record<string, unknown>;
}) {
  const [value, setValue] = React.useState(initialScene);
  const controller = useSketchEditorState(value, setValue, undefined, configData);
  return (
    <>
      <SketchLayerPanel scene={value} controller={controller} configData={configData} />
      <SketchEditorCanvas scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <SketchEditorToolbar scene={value} controller={controller} configData={configData} />
      <output data-testid="scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

function ControlledPartsEditorWithToolbarAndProperties({
  initialScene,
  configData = {},
}: {
  initialScene: SketchSceneDocument;
  configData?: Record<string, unknown>;
}) {
  const [value, setValue] = React.useState(initialScene);
  const controller = useSketchEditorState(value, setValue, undefined, configData);
  return (
    <>
      <SketchLayerPanel scene={value} controller={controller} configData={configData} />
      <SketchEditorCanvas scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <SketchEditorToolbar scene={value} controller={controller} configData={configData} />
      <SketchPropertyPanel scene={value} controller={controller} configData={configData} />
      <output data-testid="scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

function InlineSelectionCallbackHarness() {
  const [value, setValue] = React.useState(scene);
  const [events, setEvents] = React.useState<SketchEditorSelection[]>([]);
  return (
    <>
      <SketchPageEditor
        scene={value}
        previewSize={{ width: 400, height: 300 }}
        onSceneChange={setValue}
        onSelectionChange={(selection) => {
          setEvents((current) => [...current, selection]);
        }}
      />
      <output data-testid="selection-count">{events.length}</output>
      <output data-testid="selection-events">{JSON.stringify(events)}</output>
    </>
  );
}

function InlineConfigSelectionCallbackHarness() {
  const [value, setValue] = React.useState(scene);
  const [events, setEvents] = React.useState<SketchEditorSelection[]>([]);
  return (
    <>
      <SketchPageEditor
        scene={value}
        configData={{ headline: "Bound headline" }}
        previewSize={{ width: 400, height: 300 }}
        onSceneChange={setValue}
        onSelectionChange={(selection) => {
          setEvents((current) => [...current, selection]);
        }}
      />
      <output data-testid="selection-count">{events.length}</output>
    </>
  );
}

function PartsSelectionCallbackHarness({ initialScene }: { initialScene: SketchSceneDocument }) {
  const [events, setEvents] = React.useState<SketchEditorSelection[]>([]);
  const controller = useSketchEditorState(initialScene, undefined, (selection) => {
    setEvents((current) => [...current, selection]);
  });
  return (
    <>
      <SketchLayerPanel scene={initialScene} controller={controller} />
      <output data-testid="selection-events">{JSON.stringify(events)}</output>
    </>
  );
}

function HistoryHarness() {
  const [value, setValue] = React.useState(scene);
  const history = useSketchHistory(value, setValue);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          history.applyOperations([{ op: "update", nodeId: "card", patch: { text: "changed" } }])
        }
      >
        change
      </button>
      <button type="button" onClick={history.undo}>
        undo
      </button>
      <button type="button" onClick={history.redo}>
        redo
      </button>
      <button
        type="button"
        onClick={() =>
          history.applyOperations([{ op: "update", nodeId: "missing", patch: { text: "noop" } }])
        }
      >
        noop
      </button>
      <button
        type="button"
        onClick={() =>
          setValue({
            ...scene,
            nodes: scene.nodes.map((node) =>
              node.id === "card" ? { ...node, text: "replacement", x: 140 } : node,
            ),
          })
        }
      >
        replace
      </button>
      <output data-testid="can-undo">{history.canUndo ? "yes" : "no"}</output>
      <output data-testid="history-json">{JSON.stringify(value)}</output>
    </>
  );
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  clientX: number,
  clientY: number,
  options: { altKey?: boolean; shiftKey?: boolean; pointerId?: number } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    altKey: { value: Boolean(options.altKey) },
    shiftKey: { value: Boolean(options.shiftKey) },
    pointerId: { value: options.pointerId ?? 1 },
  });
  fireEvent(target, event);
}

function getCanvasStage(): HTMLElement {
  const stage = document.querySelector("[data-sketch-stage]") as HTMLElement | null;
  expect(stage).not.toBeNull();
  return stage as HTMLElement;
}

function openCanvasContextMenu() {
  fireEvent.contextMenu(getCanvasStage(), { clientX: 120, clientY: 120 });
  return screen.getByRole("menu", { name: "草图右键菜单" });
}

function runCanvasContextMenuCommand(label: string) {
  const menu = openCanvasContextMenu();
  fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
}

function readRenderedScene(): SketchSceneDocument {
  return JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
}

function clickLayerNode(nodeId: string, options?: { shiftKey?: boolean }) {
  const row = getLayerRow(nodeId);
  const button = row.querySelector("button");
  expect(button).not.toBeNull();
  fireEvent.click(button as HTMLButtonElement, options);
}

function getLayerRow(nodeId: string): HTMLElement {
  const row = screen.getByTestId("sketch-layer-panel").querySelector(`[data-sketch-layer-row][data-sketch-layer-node-id="${nodeId}"]`);
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function openLayerContextMenu(nodeId: string) {
  fireEvent.contextMenu(getLayerRow(nodeId), { clientX: 120, clientY: 120 });
  return screen.getByRole("menu", { name: "草图图层菜单" });
}

describe("sketch-react", () => {
  afterEach(() => cleanup());

  it("renders bound config data in read-only preview", () => {
    render(
      <SketchPagePreview
        scene={scene}
        configData={{ headline: "Bound headline" }}
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.body.innerHTML).toContain("Bound headline");
    expect(document.body.innerHTML).not.toContain("Fallback");
  });

  it("does not draw preview selection chrome for hidden selected nodes", () => {
    const hiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 24, y: 36, width: 100, height: 60, visible: false },
      ],
    };

    const { unmount } = render(
      <SketchPagePreview
        scene={hiddenScene}
        selectedNodeId="hidden"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={hiddenScene}
        selectedNodeId="hidden"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
  });

  it("does not draw preview selection chrome for nodes hidden by config bindings", () => {
    const configHiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "bound-hidden", type: "rect", x: 24, y: 36, width: 100, height: 60, bindings: { visible: "showLayer" } },
      ],
    };

    const { unmount } = render(
      <SketchPagePreview
        scene={configHiddenScene}
        configData={{ showLayer: false }}
        selectedNodeId="bound-hidden"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bound-hidden"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={configHiddenScene}
        configData={{ showLayer: false }}
        selectedNodeId="bound-hidden"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bound-hidden"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
  });

  it("does not draw preview selection chrome for image nodes with unresolved src bindings", () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "bound-image", type: "image", x: 24, y: 36, width: 100, height: 60, bindings: { src: "heroImage" } },
      ],
    };

    const { unmount, rerender } = render(
      <SketchPagePreview
        scene={imageScene}
        selectedNodeId="bound-image"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bound-image"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();

    rerender(
      <SketchPagePreview
        scene={imageScene}
        configData={{ heroImage: "data:image/png;base64,abc" }}
        selectedNodeId="bound-image"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bound-image"]')).not.toBeNull();
    expect(screen.getByTestId("sketch-selection-box")).not.toBeNull();

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={imageScene}
        selectedNodeId="bound-image"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bound-image"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
  });

  it("shows and clears image load failure overlays in both preview entries", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "broken-image", type: "image", x: 24, y: 36, width: 100, height: 60, src: "https://example.invalid/missing.png", alt: "Broken" },
      ],
    };

    const { unmount } = render(
      <SketchPagePreview
        scene={imageScene}
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    const probe = document.querySelector('[data-sketch-image-probe-id="broken-image"]');
    expect(probe).not.toBeNull();
    expect(screen.queryByText("图片加载失败")).toBeNull();

    fireEvent.error(probe as Element);

    await waitFor(() => {
      expect(screen.getByText("图片加载失败")).toBeTruthy();
      expect(document.querySelector('[data-sketch-image-error-id="broken-image"]')).not.toBeNull();
    });

    fireEvent.load(probe as Element);

    await waitFor(() => {
      expect(screen.queryByText("图片加载失败")).toBeNull();
    });

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={imageScene}
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    const lightweightProbe = document.querySelector('[data-sketch-image-probe-id="broken-image"]');
    expect(lightweightProbe).not.toBeNull();
    fireEvent.error(lightweightProbe as Element);

    await waitFor(() => {
      expect(screen.getByText("图片加载失败")).toBeTruthy();
    });
  });

  it("keeps line-like preview selection chrome visible for zero-height bounds", () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 },
      ],
    };

    const { unmount } = render(
      <SketchPagePreview
        scene={lineScene}
        selectedNodeId="line"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.getByTestId("sketch-selection-box").style.height).toBe("8px");

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={lineScene}
        selectedNodeId="line"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.getByTestId("sketch-selection-box").style.height).toBe("8px");
  });

  it("keeps line-like preview selection chrome visible for zero-width bounds", () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line", type: "line", x: 40, y: 50, width: 0, height: 80 },
      ],
    };

    const { unmount } = render(
      <SketchPagePreview
        scene={lineScene}
        selectedNodeId="line"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.getByTestId("sketch-selection-box").style.width).toBe("8px");

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={lineScene}
        selectedNodeId="line"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(screen.getByTestId("sketch-selection-box").style.width).toBe("8px");
  });

  it("selects control nodes from text labels in the lightweight preview entry", () => {
    const selectionEvents: SketchEditorSelection[] = [];
    render(
      <LightweightSketchPagePreview
        scene={scene}
        previewSize={{ width: 400, height: 300 }}
        onSelectionChange={(selection) => selectionEvents.push(selection)}
      />,
    );

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.click(cardLabel as Element);

    expect(selectionEvents.at(-1)).toMatchObject({
      nodeIds: ["card"],
      bounds: { x: 60, y: 100, width: 160, height: 90 },
    });
  });

  it("uses validated fallback scenes for invalid preview inputs", () => {
    const invalidScene = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "bad", type: "widget", x: 10, y: 20, width: 80, height: 40, text: "Bad widget" }],
    } as unknown as SketchSceneDocument;

    const { unmount } = render(
      <SketchPagePreview
        scene={invalidScene}
        selectedNodeId="bad"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bad"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
    expect(document.body.innerHTML).toContain("手绘页面");

    unmount();

    render(
      <LightweightSketchPagePreview
        scene={invalidScene}
        selectedNodeId="bad"
        previewSize={{ width: 400, height: 300 }}
      />,
    );

    expect(document.querySelector('[data-sketch-node-id="bad"]')).toBeNull();
    expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
    expect(document.body.innerHTML).toContain("手绘页面");
  });

  it("emits scene changes from the controlled editor", () => {
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    fireEvent.change(screen.getByPlaceholderText("对象文本"), { target: { value: "Updated card" } });

    expect(screen.getByTestId("scene-json").textContent).toContain("Updated card");
    expect(selectionEvents.at(-1)?.nodeIds).toEqual(["card"]);
  });

  it("keeps editor preview mode read-only", async () => {
    render(<ControlledEditor mode="preview" />);

    expect(screen.queryByLabelText("矩形")).toBeNull();
    expect(screen.queryByPlaceholderText("对象文本")).toBeNull();

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const json = screen.getByTestId("scene-json").textContent ?? "";
      expect(json).toContain('"id":"card"');
      expect(json).toContain('"text":"Card"');
    });
  });

  it("scopes global keyboard shortcuts to the active editor canvas", async () => {
    const firstScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "first-card", type: "card", x: 60, y: 80, width: 140, height: 80, text: "First" }],
    };
    const secondScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "second-card", type: "card", x: 80, y: 100, width: 140, height: 80, text: "Second" }],
    };

    render(
      <div>
        <section data-testid="first-editor">
          <ControlledPartsEditor initialScene={firstScene} />
        </section>
        <section data-testid="second-editor">
          <ControlledPartsEditor initialScene={secondScene} />
        </section>
      </div>,
    );

    const firstEditor = within(screen.getByTestId("first-editor"));
    const secondEditor = within(screen.getByTestId("second-editor"));

    fireEvent.click(firstEditor.getByTitle("First"));
    fireEvent.click(secondEditor.getByTitle("Second"));
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const firstParsed = JSON.parse(firstEditor.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const secondParsed = JSON.parse(secondEditor.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(firstParsed.nodes.some((node) => node.id === "first-card")).toBe(true);
      expect(secondParsed.nodes.some((node) => node.id === "second-card")).toBe(false);
    });
  });

  it("supports select all, duplicate, and escape shortcuts inside the active editor", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    fireEvent.keyDown(window, { key: "a", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("2 selected")).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "d", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes).toHaveLength(4);
      expect(screen.getByText("2 selected")).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("No selection")).not.toBeNull();
    });
  });

  it("zooms and pans the canvas viewport without changing the scene", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    const originalScene = screen.getByTestId("scene-json").textContent;

    fireEvent.click(screen.getByLabelText("放大"));

    await waitFor(() => {
      expect(stage.style.transform).toContain("scale(1.15)");
    });

    fireEvent.keyDown(window, { key: " " });
    dispatchPointerEvent(stage, "pointerdown", 50, 50);
    dispatchPointerEvent(stage, "pointermove", 90, 80);
    dispatchPointerEvent(stage, "pointerup", 90, 80);
    fireEvent.keyUp(window, { key: " " });

    await waitFor(() => {
      expect(stage.style.transform).toContain("translate(67.6px, 57.6px)");
      expect(screen.getByTestId("scene-json").textContent).toBe(originalScene);
    });
  });

  it("edits text-like nodes inline from the canvas", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.doubleClick(cardLabel as Element);

    const editor = await screen.findByLabelText("画布文本编辑");
    fireEvent.change(editor, { target: { value: "Inline card" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")?.text).toBe("Inline card");
    });
  });

  it("edits shape text inline from the canvas", async () => {
    const shapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 40, y: 50, width: 140, height: 70 },
        { id: "ellipse", type: "ellipse", x: 220, y: 50, width: 120, height: 70 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={shapeScene} />);

    const rectNode = document.querySelector('[data-sketch-node-id="rect"]');
    expect(rectNode).not.toBeNull();
    fireEvent.doubleClick(rectNode as Element);

    const editor = await screen.findByLabelText("画布文本编辑");
    fireEvent.change(editor, { target: { value: "Shape label" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.text).toBe("Shape label");
    });
  });

  it("does not repeatedly emit unchanged selection when host callback identity changes", async () => {
    render(<InlineSelectionCallbackHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selection-count").textContent).toBe("1");
    });

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    await waitFor(() => {
      expect(screen.getByTestId("selection-count").textContent).toBe("2");
      const events = JSON.parse(screen.getByTestId("selection-events").textContent ?? "[]") as SketchEditorSelection[];
      expect(events.at(-1)?.nodeIds).toEqual(["card"]);
    });
  });

  it("does not repeatedly emit unchanged selection when config data identity changes", async () => {
    render(<InlineConfigSelectionCallbackHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selection-count").textContent).toBe("1");
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("selection-count").textContent).toBe("1");
  });

  it("clears canvas selection when clicking blank stage space", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointerup", 80, 120);

    await waitFor(() => {
      expect(screen.getByText("1 selected")).not.toBeNull();
    });

    dispatchPointerEvent(stage, "pointerdown", 360, 260);
    dispatchPointerEvent(stage, "pointerup", 360, 260);

    await waitFor(() => {
      expect(screen.getByText("No selection")).not.toBeNull();
    });
  });

  it("reports null bounds for hidden and semantic group selections", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
        { id: "hidden", type: "rect", x: 12, y: 18, width: 60, height: 40, visible: false, text: "Hidden rect" },
      ],
    };
    render(<PartsSelectionCallbackHarness initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("Hidden rect"));

    await waitFor(() => {
      const events = JSON.parse(screen.getByTestId("selection-events").textContent ?? "[]") as SketchEditorSelection[];
      expect(events.at(-1)).toEqual({ nodeIds: ["hidden"], bounds: null });
    });

    fireEvent.click(screen.getByTitle("分组"));

    await waitFor(() => {
      const events = JSON.parse(screen.getByTestId("selection-events").textContent ?? "[]") as SketchEditorSelection[];
      expect(events.at(-1)).toEqual({ nodeIds: ["group"], bounds: null });
    });
  });

  it("reports null bounds for selections hidden by config bindings", async () => {
    const configHiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "bound-hidden",
          type: "rect",
          x: 24,
          y: 36,
          width: 100,
          height: 60,
          text: "Config hidden",
          bindings: { visible: "showLayer" },
        },
      ],
    };
    render(
      <PartsSelectionCallbackHarnessWithConfig
        initialScene={configHiddenScene}
        configData={{ showLayer: false }}
      />,
    );

    fireEvent.click(screen.getByTitle("Config hidden"));

    await waitFor(() => {
      const events = JSON.parse(screen.getByTestId("selection-events").textContent ?? "[]") as SketchEditorSelection[];
      expect(events.at(-1)).toEqual({ nodeIds: ["bound-hidden"], bounds: null });
    });
  });

  it("keeps semantic group selection bounds null when visible bindings resolve true", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "group",
          type: "group",
          x: 60,
          y: 100,
          width: 160,
          height: 90,
          visible: false,
          bindings: { visible: "showGroup" },
          children: ["card"],
        },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(
      <PartsSelectionCallbackHarnessWithConfig
        initialScene={groupedScene}
        configData={{ showGroup: true }}
      />,
    );

    fireEvent.click(screen.getByTitle("分组"));

    await waitFor(() => {
      const events = JSON.parse(screen.getByTestId("selection-events").textContent ?? "[]") as SketchEditorSelection[];
      expect(events.at(-1)).toEqual({ nodeIds: ["group"], bounds: null });
    });
  });

  it("orders layer panel rows by visual zIndex order", () => {
    const layeredScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "front-by-index", type: "rect", x: 40, y: 40, width: 80, height: 40, text: "Front by index", zIndex: 1 },
        { id: "top", type: "rect", x: 20, y: 20, width: 80, height: 40, text: "Top", zIndex: 5 },
        { id: "back", type: "rect", x: 0, y: 0, width: 80, height: 40, text: "Back", zIndex: 0 },
        { id: "behind-by-index", type: "rect", x: 60, y: 60, width: 80, height: 40, text: "Behind by index", zIndex: 1 },
      ],
    };
    render(<ControlledPartsEditor initialScene={layeredScene} />);

    expect(
      Array.from(screen.getByTestId("sketch-layer-panel").querySelectorAll("[data-sketch-layer-row] > button")).map((button) =>
        button.getAttribute("title"),
      ),
    ).toEqual([
      "Top",
      "Behind by index",
      "Front by index",
      "Back",
    ]);
  });

  it("keeps other visual layers stable when bringing a node to front", async () => {
    const layeredScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "top", type: "rect", x: 20, y: 20, width: 80, height: 40, text: "Top", zIndex: 5 },
        { id: "middle", type: "rect", x: 40, y: 40, width: 80, height: 40, text: "Middle", zIndex: 1 },
        { id: "back", type: "rect", x: 0, y: 0, width: 80, height: 40, text: "Back", zIndex: 0 },
        { id: "other", type: "rect", x: 60, y: 60, width: 80, height: 40, text: "Other", zIndex: 2 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={layeredScene} />);

    fireEvent.click(screen.getByTitle("Middle"));
    runCanvasContextMenuCommand("置顶");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect([...parsed.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((node) => node.id)).toEqual([
        "back",
        "other",
        "top",
        "middle",
      ]);
    });
  });

  it("toggles layer lock and visibility from layer row controls", async () => {
    const layerScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" }],
    };
    render(<ControlledPartsEditor initialScene={layerScene} />);

    fireEvent.click(screen.getByLabelText("锁定 Card"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ locked: true });
      expect(getLayerRow("card").className).toContain("ring-[#3da0ff]");
    });

    fireEvent.click(screen.getByLabelText("隐藏 Card"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ visible: false });
    });
  });

  it("runs object commands from the layer context menu", async () => {
    const layerScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" }],
    };
    render(<ControlledPartsEditor initialScene={layerScene} />);

    const menu = openLayerContextMenu("card");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "复制" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.filter((node) => node.type === "card")).toHaveLength(2);
    });
  });

  it("keeps object commands out of the top toolbar", () => {
    render(<ControlledPartsEditorWithToolbar initialScene={scene} />);

    for (const label of ["复制", "删除", "置顶", "置底", "锁定", "显示隐藏", "左对齐", "顶对齐", "水平分布"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(screen.getByLabelText("撤销")).not.toBeNull();
    expect(screen.getByLabelText("重做")).not.toBeNull();
  });

  it("supports undo and redo through the history hook", async () => {
    render(<HistoryHarness />);

    fireEvent.click(screen.getByText("change"));
    expect(screen.getByTestId("history-json").textContent).toContain("changed");

    fireEvent.click(screen.getByText("undo"));
    await waitFor(() => {
      expect(screen.getByTestId("history-json").textContent).not.toContain("changed");
    });

    fireEvent.click(screen.getByText("redo"));
    await waitFor(() => {
      expect(screen.getByTestId("history-json").textContent).toContain("changed");
    });
  });

  it("does not record no-op patch operations in editor history", async () => {
    render(<HistoryHarness />);

    fireEvent.click(screen.getByText("noop"));

    await waitFor(() => {
      expect(screen.getByTestId("can-undo").textContent).toBe("no");
      expect(screen.getByTestId("history-json").textContent).not.toContain("noop");
    });

    fireEvent.click(screen.getByText("change"));

    await waitFor(() => {
      expect(screen.getByTestId("can-undo").textContent).toBe("yes");
      expect(screen.getByTestId("history-json").textContent).toContain("changed");
    });

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => {
      expect(screen.getByTestId("history-json").textContent).not.toContain("changed");
      expect(screen.getByTestId("can-undo").textContent).toBe("no");
    });
  });

  it("resets history when the host replaces the scene", async () => {
    render(<HistoryHarness />);

    fireEvent.click(screen.getByText("change"));

    await waitFor(() => {
      expect(screen.getByTestId("can-undo").textContent).toBe("yes");
      expect(screen.getByTestId("history-json").textContent).toContain("changed");
    });

    fireEvent.click(screen.getByText("replace"));

    await waitFor(() => {
      expect(screen.getByTestId("can-undo").textContent).toBe("no");
      expect(screen.getByTestId("history-json").textContent).toContain("replacement");
    });

    fireEvent.click(screen.getByText("undo"));

    await waitFor(() => {
      expect(screen.getByTestId("history-json").textContent).toContain("replacement");
      expect(screen.getByTestId("history-json").textContent).not.toContain("changed");
    });
  });

  it("keeps drag moves undoable as one history step", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();

    dispatchPointerEvent(cardNode as Element, "pointerdown", 100, 120);
    dispatchPointerEvent(stage, "pointermove", 140, 120);
    dispatchPointerEvent(stage, "pointerup", 140, 120);

    await waitFor(() => {
      expect(screen.getByTestId("scene-json").textContent).toContain('"x":100');
    });

    fireEvent.click(screen.getByLabelText("撤销"));

    await waitFor(() => {
      expect(screen.getByTestId("scene-json").textContent).toContain('"x":60');
    });
  });

  it("captures and releases the pointer during canvas drags", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement | null;
    expect(stage).not.toBeNull();
    (stage as HTMLElement).getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(stage as HTMLElement, {
      setPointerCapture: { value: setPointerCapture, configurable: true },
      releasePointerCapture: { value: releasePointerCapture, configurable: true },
    });

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();
    dispatchPointerEvent(cardNode as Element, "pointerdown", 80, 120, { pointerId: 21 });

    expect(setPointerCapture).toHaveBeenCalledWith(21);

    dispatchPointerEvent(stage as HTMLElement, "pointerup", 80, 120, { pointerId: 21 });

    expect(releasePointerCapture).toHaveBeenCalledWith(21);
  });

  it("captures and releases the pointer during resize handle drags", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement | null;
    expect(stage).not.toBeNull();
    (stage as HTMLElement).getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();
    dispatchPointerEvent(cardNode as Element, "pointerdown", 80, 120, { pointerId: 22 });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(resizeHandle, {
      setPointerCapture: { value: setPointerCapture, configurable: true },
      releasePointerCapture: { value: releasePointerCapture, configurable: true },
    });

    dispatchPointerEvent(resizeHandle, "pointerdown", 220, 190, { pointerId: 23 });

    expect(setPointerCapture).toHaveBeenCalledWith(23);

    dispatchPointerEvent(resizeHandle, "pointerup", 220, 190, { pointerId: 23 });

    expect(releasePointerCapture).toHaveBeenCalledWith(23);
  });

  it("does not record drag history when pointer movement does not change the scene", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();

    dispatchPointerEvent(cardNode as Element, "pointerdown", 100, 120);
    dispatchPointerEvent(stage, "pointermove", 100, 120);
    dispatchPointerEvent(stage, "pointerup", 100, 120);

    await waitFor(() => {
      expect(screen.getByTestId("scene-json").textContent).toContain('"x":60');
      expect((screen.getByLabelText("撤销") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("keeps drawing drafts out of scene until pointerup and records one undo step", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("矩形"));

    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 90, 80);
    dispatchPointerEvent(stage, "pointermove", 140, 120);

    expect(readRenderedScene().nodes).toHaveLength(2);
    expect(readRenderedScene().nodes.some((node) => node.type === "rect")).toBe(false);
    expect((screen.getByLabelText("撤销") as HTMLButtonElement).disabled).toBe(true);

    dispatchPointerEvent(stage, "pointerup", 140, 120);

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.filter((node) => node.type === "rect")).toHaveLength(1);
      expect(parsed.nodes.find((node) => node.type === "rect")).toMatchObject({
        x: 40,
        y: 50,
        width: 100,
        height: 70,
      });
      expect((screen.getByLabelText("撤销") as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByLabelText("撤销"));

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.nodes.some((node) => node.type === "rect")).toBe(false);
    });
  });

  it("assigns readable names to newly drawn non-text nodes", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledEditor initialScene={emptyScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("矩形"));
    dispatchPointerEvent(stage, "pointerdown", 20, 30);
    dispatchPointerEvent(stage, "pointermove", 80, 70);
    dispatchPointerEvent(stage, "pointerup", 80, 70);

    fireEvent.click(screen.getByLabelText("线条"));
    dispatchPointerEvent(stage, "pointerdown", 100, 40);
    dispatchPointerEvent(stage, "pointermove", 180, 40);
    dispatchPointerEvent(stage, "pointerup", 180, 40);

    fireEvent.click(screen.getByLabelText("画笔"));
    dispatchPointerEvent(stage, "pointerdown", 60, 140);
    dispatchPointerEvent(stage, "pointermove", 85, 150);
    dispatchPointerEvent(stage, "pointermove", 115, 165);
    dispatchPointerEvent(stage, "pointerup", 115, 165);

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.type === "rect")).toMatchObject({ name: "矩形" });
      expect(parsed.nodes.find((node) => node.type === "line")).toMatchObject({ name: "线条" });
      expect(parsed.nodes.find((node) => node.type === "path")).toMatchObject({ name: "画笔路径" });
    });
  });

  it("keeps a committed drawing node id stable across move resize and property edits", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={emptyScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("矩形"));
    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 120);
    dispatchPointerEvent(stage, "pointerup", 140, 120);

    let committedId = "";
    await waitFor(() => {
      const rect = readRenderedScene().nodes.find((node) => node.type === "rect");
      expect(rect?.id).toMatch(/^sketch_/);
      committedId = rect?.id ?? "";
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 140, 120);
    dispatchPointerEvent(stage, "pointermove", 160, 140);
    dispatchPointerEvent(stage, "pointerup", 160, 140);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Stable rectangle" } });

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.nodes[0]).toMatchObject({
        id: committedId,
        name: "Stable rectangle",
        x: 41,
        y: 50,
        width: 120,
        height: 90,
      });
    });
  });

  it("cancels drawing drafts with Escape without committing on pointerup", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("线条"));

    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 90);
    fireEvent.keyDown(window, { key: "Escape" });
    dispatchPointerEvent(stage, "pointerup", 140, 90);

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.nodes.some((node) => node.type === "line")).toBe(false);
      expect((screen.getByLabelText("撤销") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("duplicates selected nodes with Alt-drag and removes the clone with one undo", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();

    dispatchPointerEvent(cardNode as Element, "pointerdown", 100, 120, { altKey: true });
    dispatchPointerEvent(stage, "pointermove", 145, 150, { altKey: true });
    dispatchPointerEvent(stage, "pointerup", 145, 150, { altKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cards = parsed.nodes.filter((node) => node.type === "card");
      expect(cards).toHaveLength(2);
      expect(cards.find((node) => node.id === "card")).toMatchObject({ x: 60, y: 100 });
      expect(cards.find((node) => node.id !== "card")).toMatchObject({ x: 105, y: 130 });
    });

    fireEvent.click(screen.getByLabelText("撤销"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.filter((node) => node.type === "card")).toHaveLength(1);
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 60, y: 100 });
    });
  });

  it("draws newly created sticky nodes from pointer drag bounds", async () => {
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("便签"));
    dispatchPointerEvent(stage, "pointerdown", 300, 200);
    dispatchPointerEvent(stage, "pointermove", 360, 250);
    dispatchPointerEvent(stage, "pointerup", 360, 250);

    await waitFor(() => {
      expect(screen.getByTestId("scene-json").textContent).toContain('"x":300');
      expect(screen.getByTestId("scene-json").textContent).toContain('"y":200');
      expect(selectionEvents.at(-1)).toMatchObject({
        nodeIds: [expect.stringMatching(/^sketch_/)],
        bounds: { x: 300, y: 200, width: 60, height: 50 },
      });
    });

    fireEvent.click(screen.getByLabelText("撤销"));

    await waitFor(() => {
      expect(screen.getByTestId("scene-json").textContent).not.toContain('"x":300');
      expect(screen.getByText("No selection")).not.toBeNull();
      expect(selectionEvents.at(-1)).toEqual({ nodeIds: [], bounds: null });
    });
  });

  it("does not create drawing nodes from a plain shape click", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("矩形"));
    dispatchPointerEvent(stage, "pointerdown", 260, 160);
    dispatchPointerEvent(stage, "pointerup", 260, 160);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.filter((node) => node.type === "rect")).toHaveLength(0);
    });
  });

  it("removes newly created text nodes when inline text is submitted empty", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("text"));
    dispatchPointerEvent(stage, "pointerdown", 260, 160);
    dispatchPointerEvent(stage, "pointerup", 260, 160);

    const editor = await screen.findByLabelText("画布文本编辑");
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.filter((node) => node.id.startsWith("sketch_") && node.type === "text")).toHaveLength(0);
      expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
    });
  });

  it("creates image nodes from drawing drag bounds", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("图片"));
    dispatchPointerEvent(stage, "pointerdown", 280, 180);
    dispatchPointerEvent(stage, "pointermove", 360, 225);
    dispatchPointerEvent(stage, "pointerup", 360, 225);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const imageNode = parsed.nodes.find((node) => node.type === "image");
      expect(imageNode).toMatchObject({
        type: "image",
        name: "图片",
        x: 280,
        y: 180,
        width: 80,
        height: 45,
        alt: "图片占位",
      });
      expect(imageNode?.src).toContain("data:image/svg+xml");
    });
  });

  it("imports image files from the image tool click entry", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByLabelText("图片"));
    dispatchPointerEvent(stage, "pointerdown", 280, 180);
    dispatchPointerEvent(stage, "pointerup", 280, 180);
    fireEvent.change(screen.getByLabelText("图片导入文件"), {
      target: { files: [new File(["image-bytes"], "hero.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const imageNode = parsed.nodes.find((node) => node.type === "image");
      expect(imageNode).toMatchObject({
        type: "image",
        name: "hero.png",
        alt: "hero.png",
      });
      expect(imageNode?.src).toContain("data:image/png;base64");
    });
  });

  it("prevents locked nodes from property edits, keyboard moves, and delete", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    runCanvasContextMenuCommand("锁定");

    await waitFor(() => {
      expect((screen.getByPlaceholderText("对象文本") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(true);
      expect(screen.queryByTestId("sketch-resize-handle")).toBeNull();
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const json = screen.getByTestId("scene-json").textContent ?? "";
      expect(json).toContain('"id":"card"');
      expect(json).toContain('"x":60');
      expect(json).toContain('"locked":true');
    });
  });

  it("allows locked canvas nodes to be selected without starting a drag", async () => {
    const lockedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "locked-card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Locked card", locked: true },
      ],
    };
    render(<ControlledEditor initialScene={lockedScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lockedLabel = document.querySelector('[data-sketch-node-label="locked-card"]');
    expect(lockedLabel).not.toBeNull();

    dispatchPointerEvent(lockedLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointermove", 140, 120);
    dispatchPointerEvent(stage, "pointerup", 140, 120);

    await waitFor(() => {
      expect(screen.getByText("1 selected")).not.toBeNull();
      expect((screen.getByPlaceholderText("对象文本") as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByTestId("scene-json").textContent).toContain('"x":60');
    });
  });

  it("does not draw canvas selection chrome for hidden layer selections", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    await waitFor(() => {
      expect(screen.getByTestId("sketch-selection-box")).not.toBeNull();
      expect(screen.getByTestId("sketch-resize-handle")).not.toBeNull();
    });

    runCanvasContextMenuCommand("隐藏");

    await waitFor(() => {
      expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
      expect(screen.queryByTestId("sketch-resize-handle")).toBeNull();
      expect(screen.getByTestId("scene-json").textContent).toContain('"visible":false');
    });
  });

  it("treats config-hidden layer selections as non-interactive on the canvas", async () => {
    const configHiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "bound-hidden",
          type: "rect",
          x: 24,
          y: 36,
          width: 100,
          height: 60,
          text: "Config hidden",
          bindings: { visible: "showLayer" },
        },
      ],
    };
    render(<ControlledPartsEditor initialScene={configHiddenScene} configData={{ showLayer: false }} />);

    fireEvent.click(screen.getByTitle("Config hidden"));

    await waitFor(() => {
      expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
      expect(screen.queryByTestId("sketch-resize-handle")).toBeNull();
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "bound-hidden")).toMatchObject({ x: 24, y: 36 });
    });
  });

  it("keeps config-hidden layer selections read-only in the property panel", async () => {
    const configHiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "bound-hidden",
          type: "rect",
          x: 24,
          y: 36,
          width: 100,
          height: 60,
          text: "Config hidden",
          bindings: { visible: "showLayer" },
          style: { fill: "#2563eb" },
        },
      ],
    };
    render(
      <ControlledPartsEditorWithToolbarAndProperties
        initialScene={configHiddenScene}
        configData={{ showLayer: false }}
      />,
    );

    fireEvent.click(screen.getByTitle("Config hidden"));

    await waitFor(() => {
      expect((screen.getByPlaceholderText("对象文本") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("W") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByTitle("填充") as HTMLInputElement).disabled).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("X"), { target: { value: "80" } });
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.nodes.find((node) => node.id === "bound-hidden")).toMatchObject({
        x: 24,
        text: "Config hidden",
      });
    });
  });

  it("keeps image selections with unresolved src bindings non-interactive in editor controls", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "bound-image",
          type: "image",
          x: 24,
          y: 36,
          width: 100,
          height: 60,
          name: "Hero image",
          bindings: { src: "heroImage" },
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={imageScene} />);

    fireEvent.click(screen.getByTitle("Hero image"));

    await waitFor(() => {
      expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
      expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("W") as HTMLInputElement).disabled).toBe(true);
    });

    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "bound-image")).toMatchObject({
        name: "Hero image",
        bindings: { src: "heroImage" },
      });
    });
  });

  it("does not let semantic groups become visible from the canvas context menu", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    let menu = openCanvasContextMenu();
    expect((within(menu).getByRole("menuitem", { name: "显示" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });
    menu = openCanvasContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "隐藏" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "group")).toMatchObject({ visible: false });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ visible: false });
    });
  });

  it("does not let semantic groups become locked from the canvas context menu", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    let menu = openCanvasContextMenu();
    expect((within(menu).getByRole("menuitem", { name: "锁定" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });
    menu = openCanvasContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "锁定" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "group")?.locked).not.toBe(true);
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ locked: true });
    });
  });

  it("does not let hidden layer selections become locked from the canvas context menu", async () => {
    const hiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 20, y: 30, width: 80, height: 40, text: "Hidden", visible: false },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={hiddenScene} />);

    fireEvent.click(screen.getByTitle("Hidden"));

    const menu = openCanvasContextMenu();
    expect((within(menu).getByRole("menuitem", { name: "锁定" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "显示" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ visible: true });
      expect(parsed.nodes.find((node) => node.id === "hidden")?.locked).not.toBe(true);
    });
  });

  it("keeps semantic group properties read-only while context copy remains available", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "group",
          type: "group",
          x: 60,
          y: 100,
          width: 160,
          height: 90,
          visible: false,
          children: ["card"],
          name: "Card group",
        },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("Card group"));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("对象文本")).toBeNull();
      expect((screen.getByLabelText("X") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("W") as HTMLInputElement).disabled).toBe(true);
      expect(screen.queryByTitle("填充")).toBeNull();
    });
    expect((within(openCanvasContextMenu()).getByRole("menuitem", { name: "复制" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("X"), { target: { value: "10" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const group = parsed.nodes.find((node) => node.id === "group");
      expect(group?.x).toBe(60);
      expect(group).not.toHaveProperty("text");
    });
  });

  it("keeps semantic groups out of layer order commands", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
        { id: "button", type: "button", x: 240, y: 100, width: 100, height: 42, text: "Button" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    let menu = openCanvasContextMenu();
    expect((within(menu).getByRole("menuitem", { name: "复制" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole("menuitem", { name: "删除" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole("menuitem", { name: "置顶" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(menu).getByRole("menuitem", { name: "置底" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });
    menu = openCanvasContextMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "置顶" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.map((node) => node.id)).toEqual(["group", "button", "card"]);
      expect(parsed.nodes.find((node) => node.id === "group")).toMatchObject({ visible: false, zIndex: 0 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ zIndex: 2 });
    });
  });

  it("aligns rotated nodes by their visual bounds", async () => {
    const rotatedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "top", type: "rect", x: 20, y: 30, width: 60, height: 30, text: "Top" },
        { id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45, text: "Rotated" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={rotatedScene} />);

    fireEvent.click(screen.getByTitle("Top"));
    fireEvent.click(screen.getByTitle("Rotated"), { shiftKey: true });
    runCanvasContextMenuCommand("顶对齐");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const top = parsed.nodes.find((node): node is SketchSceneNode => node.id === "top");
      const rotated = parsed.nodes.find((node): node is SketchSceneNode => node.id === "rotated");
      expect(top).toBeDefined();
      expect(rotated).toBeDefined();
      if (!top || !rotated) return;
      expect(getSketchNodeBounds(rotated).y).toBeCloseTo(getSketchNodeBounds(top).y, 5);
    });
  });

  it("distributes rotated nodes by their visual bounds", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 420, height: 300 },
      nodes: [
        { id: "rotated", type: "rect", x: 40, y: 80, width: 120, height: 20, rotation: 45, text: "Rotated" },
        { id: "middle", type: "rect", x: 220, y: 80, width: 40, height: 40, text: "Middle" },
        { id: "right", type: "rect", x: 320, y: 80, width: 40, height: 40, text: "Right" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={mixedScene} />);

    fireEvent.click(screen.getByTitle("Rotated"));
    fireEvent.click(screen.getByTitle("Middle"), { shiftKey: true });
    fireEvent.click(screen.getByTitle("Right"), { shiftKey: true });
    runCanvasContextMenuCommand("水平分布");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const rotated = parsed.nodes.find((node): node is SketchSceneNode => node.id === "rotated");
      const middle = parsed.nodes.find((node): node is SketchSceneNode => node.id === "middle");
      const right = parsed.nodes.find((node): node is SketchSceneNode => node.id === "right");
      expect(rotated).toBeDefined();
      expect(middle).toBeDefined();
      expect(right).toBeDefined();
      if (!rotated || !middle || !right) return;
      const rotatedBounds = getSketchNodeBounds(rotated);
      const middleBounds = getSketchNodeBounds(middle);
      const rightBounds = getSketchNodeBounds(right);
      const firstGap = middleBounds.x - (rotatedBounds.x + rotatedBounds.width);
      const secondGap = rightBounds.x - (middleBounds.x + middleBounds.width);
      expect(firstGap).toBeCloseTo(secondGap, 5);
    });
  });

  it("deletes selected semantic groups together with editable children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("删除");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.some((node) => node.id === "group")).toBe(false);
      expect(parsed.nodes.some((node) => node.id === "card")).toBe(false);
    });
  });

  it("keeps locked group children when deleting the selected semantic group", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "group",
          type: "group",
          x: 60,
          y: 100,
          width: 220,
          height: 90,
          visible: false,
          children: ["locked-card", "card"],
        },
        { id: "locked-card", type: "card", x: 60, y: 100, width: 100, height: 90, text: "Locked", locked: true },
        { id: "card", type: "card", x: 180, y: 100, width: 100, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("删除");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.some((node) => node.id === "group")).toBe(false);
      expect(parsed.nodes.some((node) => node.id === "card")).toBe(false);
      expect(parsed.nodes.find((node) => node.id === "locked-card")).toMatchObject({ locked: true });
    });
  });

  it("keeps config-hidden group children when deleting the selected semantic group", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "group",
          type: "group",
          x: 60,
          y: 100,
          width: 220,
          height: 90,
          visible: false,
          children: ["bound-hidden", "card"],
        },
        {
          id: "bound-hidden",
          type: "rect",
          x: 60,
          y: 100,
          width: 100,
          height: 90,
          text: "Config hidden",
          bindings: { visible: "showLayer" },
        },
        { id: "card", type: "card", x: 180, y: 100, width: 100, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} configData={{ showLayer: false }} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("删除");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.some((node) => node.id === "group")).toBe(false);
      expect(parsed.nodes.some((node) => node.id === "card")).toBe(false);
      expect(parsed.nodes.find((node) => node.id === "bound-hidden")).toMatchObject({
        text: "Config hidden",
        bindings: { visible: "showLayer" },
      });
    });
  });

  it("keeps statically hidden group children when deleting the selected semantic group", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "group",
          type: "group",
          x: 60,
          y: 100,
          width: 220,
          height: 90,
          visible: false,
          children: ["hidden", "card"],
        },
        { id: "hidden", type: "rect", x: 60, y: 100, width: 100, height: 90, text: "Hidden", visible: false },
        { id: "card", type: "card", x: 180, y: 100, width: 100, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("删除");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.some((node) => node.id === "group")).toBe(false);
      expect(parsed.nodes.some((node) => node.id === "card")).toBe(false);
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({
        text: "Hidden",
        visible: false,
      });
    });
  });

  it("keeps hidden nodes out of canvas drag edits in mixed selections", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 12, y: 18, width: 60, height: 40, visible: false, text: "Hidden rect" },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditor initialScene={mixedScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByTitle("Hidden rect"));
    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();

    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120, { shiftKey: true });
    dispatchPointerEvent(stage, "pointermove", 120, 120);
    dispatchPointerEvent(stage, "pointerup", 120, 120);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ x: 12, y: 18 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 100, y: 100 });
    });
  });

  it("drags the full current multi-selection when pressing an already selected canvas node", async () => {
    render(<ControlledPartsEditor initialScene={scene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByTitle("Fallback"));
    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointermove", 120, 120);
    dispatchPointerEvent(stage, "pointerup", 120, 120);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "title")).toMatchObject({ x: 60, y: 30 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 100, y: 100 });
    });
  });

  it("does not drag remaining nodes when shift-clicking a selected canvas node to deselect it", async () => {
    render(<ControlledPartsEditor initialScene={scene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByTitle("Fallback"));
    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120, { shiftKey: true });
    dispatchPointerEvent(stage, "pointermove", 120, 120, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 120, 120, { shiftKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "title")).toMatchObject({ x: 20, y: 30 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 60, y: 100 });
    });
  });

  it("keeps hidden nodes out of keyboard geometry edits in mixed selections", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 12, y: 18, width: 60, height: 40, visible: false, text: "Hidden rect" },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditor initialScene={mixedScene} />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });
    fireEvent.click(screen.getByTitle("Hidden rect"), { shiftKey: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ x: 12, y: 18 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 61, y: 100 });
    });
  });

  it("clamps keyboard movement at the canvas origin", async () => {
    const edgeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "edge", type: "rect", x: 0, y: 0, width: 60, height: 40, text: "Edge" },
      ],
    };
    render(<ControlledPartsEditor initialScene={edgeScene} />);

    fireEvent.click(screen.getByTitle("Edge"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowUp" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "edge")).toMatchObject({ x: 0, y: 0 });
    });
  });

  it("clamps keyboard movement of negative line-like vectors by the end point", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "left-arrow", type: "arrow", x: 20, y: 30, width: -10, height: 0 },
      ],
    };
    render(<ControlledPartsEditor initialScene={lineScene} />);

    fireEvent.click(screen.getByTitle("箭头"));
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "left-arrow")).toMatchObject({ x: 10, y: 30, width: -10, height: 0 });
    });
  });

  it("clamps keyboard movement of multi-selections with one shared delta", async () => {
    const edgeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "edge", type: "rect", x: 4, y: 12, width: 40, height: 30, text: "Edge" },
        { id: "far", type: "card", x: 80, y: 50, width: 60, height: 40, text: "Far" },
      ],
    };
    render(<ControlledPartsEditor initialScene={edgeScene} />);

    fireEvent.click(screen.getByTitle("Edge"));
    fireEvent.click(screen.getByTitle("Far"), { shiftKey: true });
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "edge")).toMatchObject({ x: 0, y: 12 });
      expect(parsed.nodes.find((node) => node.id === "far")).toMatchObject({ x: 76, y: 50 });
    });
  });

  it("clamps canvas dragging of multi-selections with one shared delta", async () => {
    const edgeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "edge", type: "rect", x: 4, y: 12, width: 40, height: 30, text: "Edge" },
        { id: "far", type: "card", x: 80, y: 50, width: 60, height: 40, text: "Far" },
      ],
    };
    render(<ControlledPartsEditor initialScene={edgeScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(screen.getByTitle("Edge"));
    fireEvent.click(screen.getByTitle("Far"), { shiftKey: true });
    const farLabel = document.querySelector('[data-sketch-node-label="far"]');
    expect(farLabel).not.toBeNull();
    dispatchPointerEvent(farLabel as Element, "pointerdown", 90, 60);
    dispatchPointerEvent(stage, "pointermove", 80, 60);
    dispatchPointerEvent(stage, "pointerup", 80, 60);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "edge")).toMatchObject({ x: 0, y: 12 });
      expect(parsed.nodes.find((node) => node.id === "far")).toMatchObject({ x: 76, y: 50 });
    });
  });

  it("marquee selects line-like nodes by segment intersection instead of bounding box corners", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "diagonal", type: "line", x: 20, y: 20, width: 100, height: 100, style: { strokeWidth: 2 } },
      ],
    };
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor initialScene={lineScene} onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    dispatchPointerEvent(stage, "pointerdown", 90, 20);
    dispatchPointerEvent(stage, "pointermove", 120, 45);
    dispatchPointerEvent(stage, "pointerup", 120, 45);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toEqual({ nodeIds: [], bounds: null });
    });

    dispatchPointerEvent(stage, "pointerdown", 35, 35);
    dispatchPointerEvent(stage, "pointermove", 65, 70);
    dispatchPointerEvent(stage, "pointerup", 65, 70);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toMatchObject({ nodeIds: ["diagonal"] });
    });
  });

  it("marquee selects rotated line-like nodes by transformed segment intersection", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rotated-line", type: "line", x: 100, y: 100, width: 100, height: 0, rotation: 45, style: { strokeWidth: 2 } },
      ],
    };
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor initialScene={lineScene} onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    dispatchPointerEvent(stage, "pointerdown", 101, 96);
    dispatchPointerEvent(stage, "pointermove", 110, 104);
    dispatchPointerEvent(stage, "pointerup", 110, 104);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toEqual({ nodeIds: [], bounds: null });
    });

    dispatchPointerEvent(stage, "pointerdown", 130, 80);
    dispatchPointerEvent(stage, "pointermove", 145, 95);
    dispatchPointerEvent(stage, "pointerup", 145, 95);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toMatchObject({ nodeIds: ["rotated-line"] });
    });
  });

  it("marquee selects rotated nodes by visual polygon intersection instead of visual bounding box corners", async () => {
    const rotatedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45 },
      ],
    };
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor initialScene={rotatedScene} onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    dispatchPointerEvent(stage, "pointerdown", 105, 74);
    dispatchPointerEvent(stage, "pointermove", 112, 82);
    dispatchPointerEvent(stage, "pointerup", 112, 82);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toEqual({ nodeIds: [], bounds: null });
    });

    dispatchPointerEvent(stage, "pointerdown", 140, 110);
    dispatchPointerEvent(stage, "pointermove", 160, 130);
    dispatchPointerEvent(stage, "pointerup", 160, 130);

    await waitFor(() => {
      expect(selectionEvents.at(-1)).toMatchObject({ nodeIds: ["rotated"] });
    });
  });

  it("pastes hidden copied nodes as visible editable objects", async () => {
    const hiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 12, y: 18, width: 60, height: 40, visible: false, text: "Hidden rect" },
      ],
    };
    render(<ControlledPartsEditor initialScene={hiddenScene} />);

    fireEvent.click(screen.getByTitle("Hidden rect"));
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const copy = parsed.nodes.find((node) => node.id !== "hidden");
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ visible: false });
      expect(copy).toMatchObject({ visible: true, locked: false, x: 36, y: 42 });
    });
  });

  it("pastes selected semantic groups with their visible children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditor initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const copy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy).toMatchObject({ type: "card", visible: true, locked: false, text: "Card" });
      expect(copy).toMatchObject({ type: "group", visible: false, locked: false, children: [cardCopy?.id] });
    });
  });

  it("pastes selected semantic groups without expanding hidden children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card", "hidden"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
        { id: "hidden", type: "rect", x: 80, y: 120, width: 40, height: 40, text: "Hidden", visible: false },
      ],
    };
    render(<ControlledPartsEditor initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const hiddenCopies = parsed.nodes.filter((node) => node.id !== "hidden" && node.text === "Hidden");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy).toMatchObject({ type: "card", visible: true, locked: false, text: "Card" });
      expect(hiddenCopies).toHaveLength(0);
      expect(groupCopy).toMatchObject({ type: "group", visible: false, locked: false, children: [cardCopy?.id] });
    });
  });

  it("remaps group children when pasting a copied group with its children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditor initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy?.id).toBeTruthy();
      expect(groupCopy?.children).toEqual([cardCopy?.id]);
    });
  });

  it("remaps group children when duplicating a selected group with its children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });
    runCanvasContextMenuCommand("复制");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy?.id).toBeTruthy();
      expect(groupCopy?.children).toEqual([cardCopy?.id]);
    });
  });

  it("duplicates selected semantic groups with their visible children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("复制");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy).toMatchObject({ type: "card", visible: true, locked: false, text: "Card" });
      expect(groupCopy).toMatchObject({ type: "group", visible: false, locked: false, children: [cardCopy?.id] });
    });
  });

  it("duplicates selected semantic groups without expanding hidden children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card", "hidden"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
        { id: "hidden", type: "rect", x: 80, y: 120, width: 40, height: 40, text: "Hidden", visible: false },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("复制");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const hiddenCopies = parsed.nodes.filter((node) => node.id !== "hidden" && node.text === "Hidden");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy).toMatchObject({ type: "card", visible: true, locked: false, text: "Card" });
      expect(hiddenCopies).toHaveLength(0);
      expect(groupCopy).toMatchObject({ type: "group", visible: false, locked: false, children: [cardCopy?.id] });
    });
  });

  it("duplicates selected semantic groups without expanding config-hidden children", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card", "bound-hidden"] },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
        {
          id: "bound-hidden",
          type: "rect",
          x: 80,
          y: 120,
          width: 40,
          height: 40,
          text: "Config hidden",
          bindings: { visible: "showLayer" },
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} configData={{ showLayer: false }} />);

    fireEvent.click(screen.getByTitle("分组"));
    runCanvasContextMenuCommand("复制");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cardCopy = parsed.nodes.find((node) => node.id !== "card" && node.type === "card");
      const hiddenCopies = parsed.nodes.filter((node) => node.id !== "bound-hidden" && node.text === "Config hidden");
      const groupCopy = parsed.nodes.find((node) => node.id !== "group" && node.type === "group");
      expect(cardCopy).toMatchObject({ type: "card", visible: true, locked: false, text: "Card" });
      expect(hiddenCopies).toHaveLength(0);
      expect(groupCopy).toMatchObject({ type: "group", visible: false, locked: false, children: [cardCopy?.id] });
    });
  });

  it("prevents keyboard copy and paste from duplicating locked nodes", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    runCanvasContextMenuCommand("锁定");
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const cards = parsed.nodes.filter((node) => node.type === "card");
      expect(cards).toHaveLength(1);
      expect(parsed.nodes.some((node) => node.id.startsWith("sketch_"))).toBe(false);
    });
  });

  it("clamps property panel geometry edits so they cannot invalidate the scene", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });

    fireEvent.change(screen.getByLabelText("W"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "-12" } });
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "-4" } });

    await waitFor(() => {
      const json = screen.getByTestId("scene-json").textContent ?? "";
      expect(json).toContain('"x":0');
      expect(json).toContain('"width":8');
      expect(json).toContain('"height":8');
    });
  });

  it("writes property panel color edits to the rendered style field for text and lines", async () => {
    const styleScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "text",
          type: "text",
          x: 30,
          y: 40,
          width: 160,
          height: 40,
          text: "Label",
          style: { color: "#111827" },
        },
        {
          id: "line",
          type: "line",
          x: 40,
          y: 120,
          width: 160,
          height: 0,
          style: { stroke: "#475569", strokeWidth: 3 },
        },
        {
          id: "arrow",
          type: "arrow",
          x: 40,
          y: 180,
          width: 160,
          height: 0,
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={styleScene} />);

    fireEvent.click(screen.getByTitle("Label"));
    fireEvent.change(screen.getByLabelText("文字颜色"), { target: { value: "#ff0000" } });
    fireEvent.change(screen.getByLabelText("字号"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("字重"), { target: { value: "700" } });
    fireEvent.change(screen.getByLabelText("对齐"), { target: { value: "center" } });
    fireEvent.change(screen.getByLabelText("斜体"), { target: { value: "true" } });
    fireEvent.change(screen.getByLabelText("装饰"), { target: { value: "underline" } });
    fireEvent.change(screen.getByLabelText("行高"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("字距"), { target: { value: "0.5" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "text")).toMatchObject({
        style: { color: "#ff0000", fontSize: 24, fontWeight: 700, textAlign: "center" },
        textStyleRuns: [
          {
            start: 0,
            length: 5,
            style: { italic: true, textDecoration: "underline", lineHeight: 30, letterSpacing: 0.5 },
          },
        ],
      });
      expect(parsed.nodes.find((node) => node.id === "text")?.style).not.toMatchObject({ fill: "#ff0000" });
    });

    clickLayerNode("line");
    fireEvent.change(screen.getByLabelText("描边"), { target: { value: "#00ff00" } });
    fireEvent.change(screen.getByLabelText("线宽"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("透明"), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText("线型"), { target: { value: "dashed" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({
        style: { stroke: "#00ff00", strokeWidth: 6, opacity: 0.4, lineDash: [8, 6] },
      });
      expect(parsed.nodes.find((node) => node.id === "line")?.style).not.toMatchObject({ fill: "#00ff00" });
    });

    clickLayerNode("arrow");
    fireEvent.change(screen.getByLabelText("起点箭头"), { target: { value: "arrow" } });
    fireEvent.change(screen.getByLabelText("终点箭头"), { target: { value: "none" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "arrow")).toMatchObject({
        style: { startArrow: "arrow", endArrow: "none" },
      });
    });
  });

  it("edits common style fields for mixed multi-selection from the property panel", async () => {
    const multiSelectScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827", radius: 4 } },
        { id: "ellipse", type: "ellipse", x: 140, y: 30, width: 80, height: 60, style: { fill: "#00ff00", stroke: "#111827", opacity: 0.6 } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={multiSelectScene} />);

    clickLayerNode("rect");
    clickLayerNode("ellipse", { shiftKey: true });

    expect(screen.getByText("2 个对象")).toBeTruthy();
    expect(screen.getByText("多选")).toBeTruthy();
    expect(screen.getAllByText("混合").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("填充"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("透明"), { target: { value: "0.5" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({
        style: { fill: "#123456", stroke: "#111827", radius: 4, opacity: 0.5 },
      });
      expect(parsed.nodes.find((node) => node.id === "ellipse")).toMatchObject({
        style: { fill: "#123456", stroke: "#111827", opacity: 0.5 },
      });
    });
  });

  it("hides non-common style fields for mixed node type multi-selection", () => {
    const mixedTypeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "line", type: "line", x: 140, y: 60, width: 80, height: 0, style: { stroke: "#475569", strokeWidth: 2 } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={mixedTypeScene} />);

    clickLayerNode("rect");
    clickLayerNode("line", { shiftKey: true });

    expect(screen.getByText("2 个对象")).toBeTruthy();
    expect(screen.queryByLabelText("填充")).toBeNull();
    expect(screen.getByLabelText("描边")).toBeTruthy();
    expect(screen.getByLabelText("线宽")).toBeTruthy();
  });

  it("edits common state, shape style, and line endpoints from the property panel", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "line", type: "line", x: 100, y: 120, width: 80, height: 20 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Primary box" } });
    fireEvent.change(screen.getByLabelText("填充"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("圆角"), { target: { value: "14" } });
    fireEvent.click(screen.getByLabelText("锁定"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({
        name: "Primary box",
        locked: true,
        style: { fill: "#123456", radius: 14 },
      });
    });

    clickLayerNode("line");
    fireEvent.change(screen.getByLabelText("起点 X"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("终点 Y"), { target: { value: "180" } });
    fireEvent.click(screen.getByLabelText("可见"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({
        x: 90,
        y: 120,
        width: 90,
        height: 60,
        visible: false,
      });
    });
  });

  it("shows path point count and simplifies pencil paths from the property panel", async () => {
    const pathScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "path",
          type: "path",
          x: 10,
          y: 9,
          width: 50,
          height: 2,
          path: "M 10 10 L 20 11 L 30 9 L 40 10 L 50 11 L 60 10",
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 11 },
            { x: 30, y: 9 },
            { x: 40, y: 10 },
            { x: 50, y: 11 },
            { x: 60, y: 10 },
          ],
          style: { stroke: "#111827", strokeWidth: 3 },
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={pathScene} />);

    clickLayerNode("path");

    expect(screen.getByText("路径点数：6")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("简化强度"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("简化路径"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const pathNode = parsed.nodes.find((node) => node.id === "path");
      expect(pathNode).toMatchObject({
        x: 10,
        y: 10,
        width: 50,
        height: 8,
        path: "M 10 10 L 60 10",
        points: [
          { x: 10, y: 10 },
          { x: 60, y: 10 },
        ],
        style: { stroke: "#111827", strokeWidth: 3 },
      });
    });
  });

  it("maps property panel content edits to rendered fields by node type", async () => {
    const imageSrc = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const nextImageSrc = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'/%3E";
    const contentScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40 },
        { id: "ellipse", type: "ellipse", x: 60, y: 110, width: 80, height: 60 },
        { id: "image", type: "image", x: 140, y: 40, width: 120, height: 80, src: imageSrc },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={contentScene} />);

    const rectNode = document.querySelector('[data-sketch-node-id="rect"]');
    expect(rectNode).not.toBeNull();
    fireEvent.pointerDown(rectNode as Element, { clientX: 30, clientY: 40 });
    fireEvent.change(screen.getByPlaceholderText("对象文本"), { target: { value: "Rect label" } });

    const ellipseNode = document.querySelector('[data-sketch-node-id="ellipse"]');
    expect(ellipseNode).not.toBeNull();
    fireEvent.pointerDown(ellipseNode as Element, { clientX: 80, clientY: 130 });
    fireEvent.change(screen.getByPlaceholderText("对象文本"), { target: { value: "Ellipse label" } });

    clickLayerNode("image");
    fireEvent.change(screen.getByLabelText("图片地址"), { target: { value: nextImageSrc } });
    fireEvent.change(screen.getByLabelText("Alt 文本"), { target: { value: "Hero image" } });
    fireEvent.change(screen.getByLabelText("适配"), { target: { value: "contain" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "image")).toMatchObject({
        src: nextImageSrc,
        alt: "Hero image",
        style: { imageFit: "contain" },
      });
    });

    fireEvent.change(screen.getByLabelText("替换图片文件"), {
      target: { files: [new File(["replacement"], "replacement.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "image")).toMatchObject({ alt: "replacement.png" });
      expect(parsed.nodes.find((node) => node.id === "image")?.src).toContain("data:image/png;base64");
      expect(parsed.nodes.find((node) => node.id === "image")).not.toHaveProperty("text");
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({ text: "Rect label" });
      expect(parsed.nodes.find((node) => node.id === "ellipse")).toMatchObject({ text: "Ellipse label" });
    });
  });

  it("disables property edits for hidden layer selections", async () => {
    const hiddenScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 20, y: 30, width: 80, height: 40, text: "Hidden", visible: false },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={hiddenScene} />);

    fireEvent.click(screen.getByTitle("Hidden"));

    const widthInput = screen.getByLabelText("W") as HTMLInputElement;
    expect(widthInput.disabled).toBe(true);
    fireEvent.change(widthInput, { target: { value: "120" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ width: 80, visible: false });
    });
  });

  it("keeps line-like nodes valid when property edits collapse both dimensions", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    fireEvent.pointerDown(lineNode as Element, { clientX: 50, clientY: 50 });

    fireEvent.change(screen.getByLabelText("W"), { target: { value: "0" } });

    await waitFor(() => {
      const json = screen.getByTestId("scene-json").textContent ?? "";
      expect(json).toContain('"width":1');
      expect(json).toContain('"height":0');
    });
  });

  it("preserves directed line-like vectors from property edits", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "arrow", type: "arrow", x: 140, y: 90, width: -40, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const arrowNode = document.querySelector('[data-sketch-node-id="arrow"]');
    expect(arrowNode).not.toBeNull();
    fireEvent.pointerDown(arrowNode as Element, { clientX: 120, clientY: 90 });

    fireEvent.change(screen.getByLabelText("W"), { target: { value: "-80" } });
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "-20" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "arrow")).toMatchObject({ x: 140, y: 90, width: -80, height: -20 });
    });
  });

  it("clamps negative line-like property edits by their end point", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "arrow", type: "arrow", x: 20, y: 20, width: -10, height: -10 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const arrowNode = document.querySelector('[data-sketch-node-id="arrow"]');
    expect(arrowNode).not.toBeNull();
    fireEvent.pointerDown(arrowNode as Element, { clientX: 15, clientY: 15 });

    fireEvent.change(screen.getByLabelText("X"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Y"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("W"), { target: { value: "-40" } });
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "-40" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const arrow = parsed.nodes.find((node) => node.id === "arrow");
      expect(arrow).toMatchObject({ x: 10, y: 10, width: -10, height: -10 });
      expect(validateSketchSceneDocument(parsed).valid).toBe(true);
    });
  });

  it("keeps editor selection chrome visible for horizontal line nodes", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    fireEvent.pointerDown(lineNode as Element, { clientX: 50, clientY: 50 });

    await waitFor(() => {
      expect(screen.getByTestId("sketch-selection-box").style.height).toBe("8px");
      expect(screen.getByTestId("sketch-resize-handle")).not.toBeNull();
    });
  });

  it("shows endpoint resize handles for single horizontal line nodes", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 50, 50);
    dispatchPointerEvent(stage, "pointerup", 50, 50);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    const endHandle = screen.getByTestId("sketch-resize-handle");
    expect(startHandle.style.left).toBe("0px");
    expect(startHandle.style.top).toBe("4px");
    expect(endHandle.style.left).toBe("80px");
    expect(endHandle.style.top).toBe("4px");

    dispatchPointerEvent(endHandle, "pointerdown", 120, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 70);
    dispatchPointerEvent(stage, "pointerup", 140, 70);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 40, y: 50, width: 100, height: 20 });
    });
  });

  it("shows endpoint resize handles for single vertical line nodes", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 0, height: 80 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 40, 60);
    dispatchPointerEvent(stage, "pointerup", 40, 60);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    const endHandle = screen.getByTestId("sketch-resize-handle");
    expect(startHandle.style.left).toBe("4px");
    expect(startHandle.style.top).toBe("0px");
    expect(endHandle.style.left).toBe("4px");
    expect(endHandle.style.top).toBe("80px");

    dispatchPointerEvent(endHandle, "pointerdown", 40, 130);
    dispatchPointerEvent(stage, "pointermove", 60, 150);
    dispatchPointerEvent(stage, "pointerup", 60, 150);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 40, y: 50, width: 20, height: 100 });
    });
  });

  it("resizes line-like node start endpoints while preserving the end endpoint", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 50, 50);
    dispatchPointerEvent(stage, "pointerup", 50, 50);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    dispatchPointerEvent(startHandle, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 60, 50);
    dispatchPointerEvent(stage, "pointerup", 60, 50);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 60, y: 50, width: 60, height: 0 });
    });
  });

  it("keeps line-like node direction when endpoint drags cross the opposite endpoint", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 50, 50);
    dispatchPointerEvent(stage, "pointerup", 50, 50);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    dispatchPointerEvent(startHandle, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 50);
    dispatchPointerEvent(stage, "pointerup", 140, 50);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 140, y: 50, width: -20, height: 0 });
    });
  });

  it("keeps vertical line-like node direction when endpoint drags cross the opposite endpoint", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 0, height: 80 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 40, 60);
    dispatchPointerEvent(stage, "pointerup", 40, 60);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    dispatchPointerEvent(startHandle, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 40, 140);
    dispatchPointerEvent(stage, "pointerup", 40, 140);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 40, y: 140, width: 0, height: -10 });
    });
  });

  it("keeps diagonal line-like node direction when endpoint drag collapses to minimum length", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "line", type: "line", x: 40, y: 50, width: 80, height: 40 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineNode = document.querySelector('[data-sketch-node-id="line"]');
    expect(lineNode).not.toBeNull();
    dispatchPointerEvent(lineNode as Element, "pointerdown", 80, 70);
    dispatchPointerEvent(stage, "pointerup", 80, 70);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    dispatchPointerEvent(startHandle, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 120, 90);
    dispatchPointerEvent(stage, "pointerup", 120, 90);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line")).toMatchObject({ x: 119, y: 89, width: 1, height: 1 });
      expect(validateSketchSceneDocument(parsed).valid).toBe(true);
    });
  });

  it("keeps arrow direction when dragging the start endpoint past the end endpoint", async () => {
    const arrowScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "arrow", type: "arrow", x: 40, y: 50, width: 80, height: 0 }],
    };
    render(<ControlledEditor initialScene={arrowScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const arrowNode = document.querySelector('[data-sketch-node-id="arrow"]');
    expect(arrowNode).not.toBeNull();
    dispatchPointerEvent(arrowNode as Element, "pointerdown", 50, 50);
    dispatchPointerEvent(stage, "pointerup", 50, 50);

    const startHandle = await screen.findByTestId("sketch-resize-handle-line-start");
    dispatchPointerEvent(startHandle, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 50);
    dispatchPointerEvent(stage, "pointerup", 140, 50);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "arrow")).toMatchObject({ x: 140, y: 50, width: -20, height: 0 });
    });
  });

  it("draws selection chrome around the visual bounds of rotated nodes", async () => {
    const rotatedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45 }],
    };
    render(<ControlledEditor initialScene={rotatedScene} />);

    const node = document.querySelector('[data-sketch-node-id="rotated"]');
    expect(node).not.toBeNull();
    fireEvent.pointerDown(node as Element, { clientX: 150, clientY: 120 });

    await waitFor(() => {
      const box = screen.getByTestId("sketch-selection-box");
      expect(Number.parseFloat(box.style.left)).toBeCloseTo(100.5, 1);
      expect(Number.parseFloat(box.style.top)).toBeCloseTo(70.5, 1);
      expect(Number.parseFloat(box.style.width)).toBeCloseTo(99, 1);
      expect(Number.parseFloat(box.style.height)).toBeCloseTo(99, 1);
    });
  });

  it("resizes selected nodes from the west handle while preserving the opposite edge", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointerup", 80, 120);

    const westHandle = await screen.findByTestId("sketch-resize-handle-w");
    dispatchPointerEvent(westHandle, "pointerdown", 60, 145);
    dispatchPointerEvent(stage, "pointermove", 70, 145);
    dispatchPointerEvent(stage, "pointerup", 70, 145);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 70, width: 150 });
    });
  });

  it("preserves aspect ratio when shift-resizing from a corner handle", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointerup", 80, 120);

    const southEastHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(southEastHandle, "pointerdown", 220, 190);
    dispatchPointerEvent(stage, "pointermove", 300, 200, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 300, 200, { shiftKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({
        x: 60,
        y: 100,
        width: 240,
        height: 135,
      });
    });
  });

  it("keeps north-west resize inside the page origin", async () => {
    const boundaryScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "near-origin", type: "rect", x: 10, y: 12, width: 80, height: 40 }],
    };
    render(<ControlledEditor initialScene={boundaryScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const node = document.querySelector('[data-sketch-node-id="near-origin"]');
    expect(node).not.toBeNull();
    dispatchPointerEvent(node as Element, "pointerdown", 20, 20);
    dispatchPointerEvent(stage, "pointerup", 20, 20);

    const northWestHandle = await screen.findByTestId("sketch-resize-handle-nw");
    dispatchPointerEvent(northWestHandle, "pointerdown", 10, 12);
    dispatchPointerEvent(stage, "pointermove", -14, -8);
    dispatchPointerEvent(stage, "pointerup", -14, -8);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((item) => item.id === "near-origin")).toMatchObject({
        x: 0,
        y: 0,
        width: 90,
        height: 52,
      });
    });
  });

  it("keeps multi-selection north-west resize inside the page origin", async () => {
    const boundaryScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "near-origin", type: "rect", x: 10, y: 12, width: 80, height: 40 },
        { id: "right-bottom", type: "rect", x: 100, y: 60, width: 40, height: 40 },
      ],
    };
    render(<ControlledEditor initialScene={boundaryScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const nearOrigin = document.querySelector('[data-sketch-node-id="near-origin"]');
    const rightBottom = document.querySelector('[data-sketch-node-id="right-bottom"]');
    expect(nearOrigin).not.toBeNull();
    expect(rightBottom).not.toBeNull();
    dispatchPointerEvent(nearOrigin as Element, "pointerdown", 20, 20);
    dispatchPointerEvent(stage, "pointerup", 20, 20);
    dispatchPointerEvent(rightBottom as Element, "pointerdown", 110, 70, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 110, 70, { shiftKey: true });

    const northWestHandle = await screen.findByTestId("sketch-resize-handle-nw");
    dispatchPointerEvent(northWestHandle, "pointerdown", 10, 12);
    dispatchPointerEvent(stage, "pointermove", -14, -8);
    dispatchPointerEvent(stage, "pointerup", -14, -8);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((item) => item.id === "near-origin")).toMatchObject({
        x: 0,
        y: 0,
        width: 86,
        height: 45,
      });
      expect(parsed.nodes.find((item) => item.id === "right-bottom")).toMatchObject({
        x: 97,
        y: 55,
        width: 43,
        height: 45,
      });
    });
  });

  it("resizes rotated single nodes from their visual selection bounds", async () => {
    const rotatedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "rotated", type: "rect", x: 100, y: 100, width: 100, height: 40, rotation: 45 }],
    };
    render(<ControlledEditor initialScene={rotatedScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const node = document.querySelector('[data-sketch-node-id="rotated"]');
    expect(node).not.toBeNull();
    dispatchPointerEvent(node as Element, "pointerdown", 150, 120);
    dispatchPointerEvent(stage, "pointerup", 150, 120);

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 200, 170);
    dispatchPointerEvent(stage, "pointermove", 220, 190);
    dispatchPointerEvent(stage, "pointerup", 220, 190);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((item) => item.id === "rotated")).toMatchObject({
        x: 100,
        y: 106,
        width: 120,
        height: 48,
        rotation: 45,
      });
    });
  });

  it("rotates selected nodes from the canvas rotation handle", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120);
    dispatchPointerEvent(stage, "pointerup", 80, 120);

    const rotateHandle = await screen.findByTestId("sketch-rotate-handle");
    dispatchPointerEvent(rotateHandle, "pointerdown", 140, 80);
    dispatchPointerEvent(stage, "pointermove", 220, 145);
    dispatchPointerEvent(stage, "pointerup", 220, 145);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((item) => item.id === "card")).toMatchObject({ rotation: 90 });
      expect(validateSketchSceneDocument(parsed).valid).toBe(true);
    });
  });

  it("preserves negative direction when resizing rotated line-like nodes to minimum length", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "rotated-line", type: "line", x: 20, y: 80, width: -10, height: 0, rotation: 15 }],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const node = document.querySelector('[data-sketch-node-id="rotated-line"]');
    expect(node).not.toBeNull();
    dispatchPointerEvent(node as Element, "pointerdown", 15, 80);
    dispatchPointerEvent(stage, "pointerup", 15, 80);

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 20, 84);
    dispatchPointerEvent(stage, "pointermove", 30, 84);
    dispatchPointerEvent(stage, "pointerup", 30, 84);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((item) => item.id === "rotated-line")).toMatchObject({
        x: 20,
        y: 80,
        width: -1,
        height: 0,
        rotation: 15,
      });
      expect(validateSketchSceneDocument(parsed).valid).toBe(true);
    });
  });

  it("resizes visible editable multi-selections proportionally from the selection bounds", async () => {
    render(<ControlledEditor />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const titleNode = document.querySelector('[data-sketch-node-id="title"]');
    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(titleNode).not.toBeNull();
    expect(cardLabel).not.toBeNull();

    dispatchPointerEvent(titleNode as Element, "pointerdown", 30, 40);
    dispatchPointerEvent(stage, "pointerup", 30, 40);
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 80, 120, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 220, 190);
    dispatchPointerEvent(stage, "pointermove", 240, 206);
    dispatchPointerEvent(stage, "pointerup", 240, 206);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "title")).toMatchObject({ x: 20, y: 30, width: 220, height: 44 });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 64, y: 107, width: 176, height: 99 });
    });
  });

  it("resizes multi-selected horizontal line-like nodes along the non-zero axis", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line-a", type: "line", x: 40, y: 50, width: 40, height: 0 },
        { id: "line-b", type: "line", x: 100, y: 50, width: 40, height: 0 },
      ],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineA = document.querySelector('[data-sketch-node-id="line-a"]');
    const lineB = document.querySelector('[data-sketch-node-id="line-b"]');
    expect(lineA).not.toBeNull();
    expect(lineB).not.toBeNull();

    dispatchPointerEvent(lineA as Element, "pointerdown", 45, 50);
    dispatchPointerEvent(stage, "pointerup", 45, 50);
    dispatchPointerEvent(lineB as Element, "pointerdown", 105, 50, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 105, 50, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 140, 54);
    dispatchPointerEvent(stage, "pointermove", 160, 54);
    dispatchPointerEvent(stage, "pointerup", 160, 54);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line-a")).toMatchObject({ x: 40, y: 50, width: 48, height: 0 });
      expect(parsed.nodes.find((node) => node.id === "line-b")).toMatchObject({ x: 112, y: 50, width: 48, height: 0 });
    });
  });

  it("resizes multi-selected negative line-like vectors without losing direction", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line-a", type: "line", x: 80, y: 50, width: -40, height: 0 },
        { id: "line-b", type: "arrow", x: 160, y: 50, width: -40, height: 0 },
      ],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineA = document.querySelector('[data-sketch-node-id="line-a"]');
    const lineB = document.querySelector('[data-sketch-node-id="line-b"]');
    expect(lineA).not.toBeNull();
    expect(lineB).not.toBeNull();

    dispatchPointerEvent(lineA as Element, "pointerdown", 60, 50);
    dispatchPointerEvent(stage, "pointerup", 60, 50);
    dispatchPointerEvent(lineB as Element, "pointerdown", 140, 50, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 140, 50, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 160, 54);
    dispatchPointerEvent(stage, "pointermove", 184, 54);
    dispatchPointerEvent(stage, "pointerup", 184, 54);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line-a")).toMatchObject({ x: 88, y: 50, width: -48, height: 0 });
      expect(parsed.nodes.find((node) => node.id === "line-b")).toMatchObject({ x: 184, y: 50, width: -48, height: 0 });
    });
  });

  it("keeps multi-selected negative line-like vectors valid when scaled to minimum at the origin", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line-a", type: "line", x: 1, y: 50, width: -1, height: 0 },
        { id: "line-b", type: "arrow", x: 21, y: 50, width: -1, height: 0 },
      ],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineA = document.querySelector('[data-sketch-node-id="line-a"]');
    const lineB = document.querySelector('[data-sketch-node-id="line-b"]');
    expect(lineA).not.toBeNull();
    expect(lineB).not.toBeNull();

    dispatchPointerEvent(lineA as Element, "pointerdown", 1, 50);
    dispatchPointerEvent(stage, "pointerup", 1, 50);
    dispatchPointerEvent(lineB as Element, "pointerdown", 21, 50, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 21, 50, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 21, 54);
    dispatchPointerEvent(stage, "pointermove", 1, 54);
    dispatchPointerEvent(stage, "pointerup", 1, 54);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line-a")).toMatchObject({ x: 1, y: 50, width: -1, height: 0 });
      expect(parsed.nodes.find((node) => node.id === "line-b")).toMatchObject({ x: 1, y: 50, width: -1, height: 0 });
      expect(validateSketchSceneDocument(parsed).valid).toBe(true);
    });
  });

  it("resizes multi-selected vertical line-like nodes along the non-zero axis", async () => {
    const lineScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "line-a", type: "line", x: 50, y: 40, width: 0, height: 40 },
        { id: "line-b", type: "line", x: 50, y: 100, width: 0, height: 40 },
      ],
    };
    render(<ControlledEditor initialScene={lineScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lineA = document.querySelector('[data-sketch-node-id="line-a"]');
    const lineB = document.querySelector('[data-sketch-node-id="line-b"]');
    expect(lineA).not.toBeNull();
    expect(lineB).not.toBeNull();

    dispatchPointerEvent(lineA as Element, "pointerdown", 50, 45);
    dispatchPointerEvent(stage, "pointerup", 50, 45);
    dispatchPointerEvent(lineB as Element, "pointerdown", 50, 105, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 50, 105, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 54, 140);
    dispatchPointerEvent(stage, "pointermove", 54, 160);
    dispatchPointerEvent(stage, "pointerup", 54, 160);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "line-a")).toMatchObject({ x: 50, y: 40, width: 0, height: 48 });
      expect(parsed.nodes.find((node) => node.id === "line-b")).toMatchObject({ x: 50, y: 112, width: 0, height: 48 });
    });
  });

  it("resizes mixed locked selections from editable bounds without changing locked nodes", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "locked", type: "rect", x: 260, y: 220, width: 80, height: 40, text: "Locked", locked: true },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledEditor initialScene={mixedScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const lockedNode = document.querySelector('[data-sketch-node-id="locked"]');
    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(lockedNode).not.toBeNull();
    expect(cardLabel).not.toBeNull();

    dispatchPointerEvent(lockedNode as Element, "pointerdown", 30, 40);
    dispatchPointerEvent(stage, "pointerup", 30, 40);
    dispatchPointerEvent(cardLabel as Element, "pointerdown", 80, 120, { shiftKey: true });
    dispatchPointerEvent(stage, "pointerup", 80, 120, { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    expect(screen.getByTestId("sketch-selection-box").style.left).toBe("60px");
    expect(screen.getByTestId("sketch-selection-box").style.top).toBe("100px");
    expect(screen.getByTestId("sketch-selection-box").style.width).toBe("160px");
    expect(screen.getByTestId("sketch-selection-box").style.height).toBe("90px");
    dispatchPointerEvent(resizeHandle, "pointerdown", 220, 190);
    dispatchPointerEvent(stage, "pointermove", 240, 208);
    dispatchPointerEvent(stage, "pointerup", 240, 208);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "locked")).toMatchObject({ x: 260, y: 220, width: 80, height: 40, locked: true });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 60, y: 100, width: 180, height: 108 });
    });
  });

  it("resizes mixed hidden selections from visible editable bounds without changing hidden nodes", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hidden", type: "rect", x: 20, y: 30, width: 200, height: 40, text: "Hidden", visible: false },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditor initialScene={mixedScene} />);

    const stage = document.querySelector("[data-sketch-stage]") as HTMLElement;
    expect(stage).not.toBeNull();
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.pointerDown(cardLabel as Element, { clientX: 80, clientY: 120 });
    fireEvent.click(screen.getByTitle("Hidden"), { shiftKey: true });

    const resizeHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(resizeHandle, "pointerdown", 220, 190);
    dispatchPointerEvent(stage, "pointermove", 240, 208);
    dispatchPointerEvent(stage, "pointerup", 240, 208);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject({ x: 20, y: 30, width: 200, height: 40, visible: false });
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 60, y: 100, width: 180, height: 108 });
    });
  });

  it("runs object commands from the canvas context menu", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();

    fireEvent.contextMenu(cardLabel as Element, { clientX: 120, clientY: 140 });

    const menu = await screen.findByRole("menu", { name: "草图右键菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "锁定" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ locked: true });
      expect(screen.queryByRole("menu", { name: "草图右键菜单" })).toBeNull();
    });
  });

  it("does not open the canvas context menu in preview mode", () => {
    render(<ControlledEditor mode="preview" />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();

    fireEvent.contextMenu(cardLabel as Element, { clientX: 120, clientY: 140 });

    expect(screen.queryByRole("menu", { name: "草图右键菜单" })).toBeNull();
    expect(screen.getByTestId("scene-json").textContent).toContain('"id":"card"');
  });

  it("groups and ungroups selected nodes from the canvas context menu", async () => {
    render(<ControlledPartsEditorWithToolbar initialScene={scene} />);

    fireEvent.click(screen.getByTitle("Fallback"));
    fireEvent.click(screen.getByTitle("Card"), { shiftKey: true });

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.contextMenu(cardLabel as Element, { clientX: 120, clientY: 140 });

    let menu = await screen.findByRole("menu", { name: "草图右键菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "成组" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const group = parsed.nodes.find((node) => node.type === "group");
      expect(group).toMatchObject({ visible: false, children: ["title", "card"] });
    });

    fireEvent.contextMenu(document.querySelector("[data-sketch-stage]") as Element, { clientX: 160, clientY: 160 });
    menu = await screen.findByRole("menu", { name: "草图右键菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "解组" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.some((node) => node.type === "group")).toBe(false);
      expect(screen.getByText("2 selected")).not.toBeNull();
    });
  });
});
