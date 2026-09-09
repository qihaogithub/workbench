import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  SketchEditorSurface,
  SketchLayerPanel,
  SketchPropertyPanel,
  SketchPageEditor,
  SketchPagePreview,
  SKETCH_EDITOR_PROFILES,
  WHITEBOARD_EDITOR_TOOLS,
  useSketchEditorState,
  useSketchHistory,
  type SketchEditorCanvasHandle,
  type SketchImageGenerationAdapter,
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

function ControlledSurfaceEditor({ initialScene = scene }: { initialScene?: SketchSceneDocument }) {
  const [value, setValue] = React.useState(initialScene);
  return (
    <>
      <SketchEditorSurface scene={value} fillContainer onSceneChange={setValue} />
      <output data-testid="surface-scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

const imageGenerationCapabilities = {
  enabled: true,
  modelId: "test-image-model",
  qualities: [
    { id: "auto", label: "自动" },
    { id: "high", label: "高" },
  ],
  sizes: [
    { id: "1024x1024", label: "1:1", width: 1024, height: 1024 },
    { id: "1536x1024", label: "3:2", width: 1536, height: 1024 },
  ],
  maxImages: 4,
  maxReferences: 4,
  supportsReferences: true,
  allowCustomSize: false,
  maxPromptLength: 4000,
} as const;

function ControlledImageGenerationSurface({
  initialScene,
  adapter,
}: {
  initialScene: SketchSceneDocument;
  adapter: SketchImageGenerationAdapter;
}) {
  const [value, setValue] = React.useState(initialScene);
  return (
    <>
      <SketchEditorSurface
        scene={value}
        profile="whiteboard"
        fillContainer
        imageGeneration={adapter}
        onSceneChange={setValue}
      />
      <output data-testid="surface-scene-json">{JSON.stringify(value)}</output>
    </>
  );
}

function ControlledGroupedBrushSurfaceEditor({ initialScene }: { initialScene: SketchSceneDocument }) {
  const [value, setValue] = React.useState(initialScene);
  return (
    <>
      <SketchEditorSurface
        scene={value}
        profile="whiteboard"
        fillContainer
        onSceneChange={setValue}
      />
      <output data-testid="surface-scene-json">{JSON.stringify(value)}</output>
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

function KeyboardNavigationHarness({
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
      <SketchEditorCanvas scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <output data-testid="selection-node-ids">{JSON.stringify(controller.selection.nodeIds)}</output>
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
  const canvasRef = React.useRef<SketchEditorCanvasHandle>(null);
  const openImageFilePicker = React.useCallback(() => {
    canvasRef.current?.openImageFilePicker();
  }, []);
  return (
    <>
      <SketchLayerPanel scene={value} controller={controller} configData={configData} />
      <SketchEditorCanvas ref={canvasRef} scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <SketchEditorToolbar scene={value} controller={controller} configData={configData} onImageUpload={openImageFilePicker} />
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
  const canvasRef = React.useRef<SketchEditorCanvasHandle>(null);
  const openImageFilePicker = React.useCallback(() => {
    canvasRef.current?.openImageFilePicker();
  }, []);
  return (
    <>
      <SketchLayerPanel scene={value} controller={controller} configData={configData} />
      <SketchEditorCanvas ref={canvasRef} scene={value} controller={controller} configData={configData} previewSize={{ width: 400, height: 300 }} />
      <SketchEditorToolbar scene={value} controller={controller} configData={configData} onImageUpload={openImageFilePicker} />
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
  options: { altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; pointerId?: number } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    altKey: { value: Boolean(options.altKey) },
    shiftKey: { value: Boolean(options.shiftKey) },
    metaKey: { value: Boolean(options.metaKey) },
    ctrlKey: { value: Boolean(options.ctrlKey) },
    pointerId: { value: options.pointerId ?? 1 },
  });
  fireEvent(target, event);
}

function getCanvasStage(): HTMLElement {
  const stage = document.querySelector("[data-sketch-stage]") as HTMLElement | null;
  expect(stage).not.toBeNull();
  return stage as HTMLElement;
}

function getSketchNodeElement(nodeId: string): Element {
  const node = document.querySelector(`[data-sketch-node-id="${nodeId}"]`);
  expect(node).not.toBeNull();
  return node as Element;
}

function getSketchNodeLabelElement(nodeId: string): Element {
  const node = document.querySelector(`[data-sketch-node-label="${nodeId}"]`);
  expect(node).not.toBeNull();
  return node as Element;
}

function setCanvasStageRect(stage: HTMLElement, width = 400, height = 300) {
  stage.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function mockDecodedImageDimensions(width: number, height: number) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const decodedImage = {
    naturalWidth: width,
    naturalHeight: height,
    src: "",
    decode: vi.fn().mockResolvedValue(undefined),
  };
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    writable: true,
    value: vi.fn(() => decodedImage),
  });
  return () => {
    if (originalDescriptor) Object.defineProperty(globalThis, "Image", originalDescriptor);
    else Reflect.deleteProperty(globalThis, "Image");
  };
}

function mockFloatingToolbarRect(width: number, height = 44) {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") === "toolbar") {
      return {
        left: 0,
        top: 0,
        width,
        height,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  });
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

function readSurfaceRenderedScene(): SketchSceneDocument {
  return JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument;
}

function getColorPickerDialog(container: HTMLElement, label?: string): HTMLElement {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label$="选择器"]');
  expect(trigger).not.toBeNull();
  const pickerLabel = label ?? trigger?.getAttribute("aria-label")?.replace(/选择器$/, "");
  expect(pickerLabel).toBeTruthy();
  if (trigger?.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger as HTMLButtonElement);
  return screen.getByRole("dialog", { name: pickerLabel });
}

function getPresetColorButtons(container: HTMLElement): HTMLButtonElement[] {
  const dialog = getColorPickerDialog(container);
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-color-picker-preset]"));
}

function getPresetColorButton(dialog: HTMLElement, color: string): HTMLButtonElement {
  const normalized = color.toUpperCase();
  const button = dialog.querySelector<HTMLButtonElement>(`[data-color-picker-preset="${normalized}"]`);
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function getSharedColorPickerContainer(label: string, root: HTMLElement = document.body): HTMLElement {
  const container = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="sketch-color-picker"]'))
    .find((item) => item.querySelector(`button[aria-label="${label}选择器"]`));
  expect(container).not.toBeNull();
  return container as HTMLElement;
}

function clickSharedPreset(container: HTMLElement, label: string, color: string) {
  const dialog = getColorPickerDialog(container, label);
  fireEvent.click(getPresetColorButton(dialog, color));
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

function queryLayerRow(nodeId: string): HTMLElement | null {
  return screen.getByTestId("sketch-layer-panel").querySelector(`[data-sketch-layer-row][data-sketch-layer-node-id="${nodeId}"]`);
}

function createDragDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) {
        values.delete(format);
      } else {
        values.clear();
      }
    },
    getData: (format: string) => values.get(format) ?? "",
    setData: (format: string, data: string) => {
      values.set(format, data);
    },
    setDragImage: () => {},
  } as DataTransfer;
}

function openLayerContextMenu(nodeId: string) {
  fireEvent.contextMenu(getLayerRow(nodeId), { clientX: 120, clientY: 120 });
  return screen.getByRole("menu", { name: "草图图层菜单" });
}

describe("sketch-react", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it("fails closed for invalid preview inputs instead of replacing them with defaults", () => {
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
    expect(screen.getByRole("alert").textContent).toContain("白板场景无效");
    expect(document.body.innerHTML).not.toContain("手绘页面");

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
    expect(screen.getByRole("alert").textContent).toContain("白板场景无效");
    expect(document.body.innerHTML).not.toContain("手绘页面");
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

  it("shows hover highlight and selected center point without changing scene data", async () => {
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const originalSceneJson = screen.getByTestId("scene-json").textContent;
    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    const titleNode = document.querySelector('[data-sketch-node-id="title"]');
    expect(cardLabel).not.toBeNull();
    expect(titleNode).not.toBeNull();

    fireEvent.pointerMove(cardLabel as Element, { clientX: 80, clientY: 120 });

    await waitFor(() => {
      expect(screen.getByTestId("sketch-hover-highlight")).not.toBeNull();
      expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
    fireEvent.pointerDown(getSketchNodeLabelElement("card"), { clientX: 80, clientY: 120 });

    await waitFor(() => {
      expect(selectionEvents.at(-1)?.nodeIds).toEqual(["card"]);
      expect(screen.getByTestId("sketch-selection-box")).not.toBeNull();
      expect(screen.getByTestId("sketch-selection-center-point")).not.toBeNull();
      const rotateHandle = screen.getByTestId("sketch-rotate-handle");
      expect(rotateHandle.tagName).toBe("BUTTON");
      expect(rotateHandle.getAttribute("aria-label")).toBe("旋转控制柄");
      expect(rotateHandle.className).toContain("bg-white");
      expect(rotateHandle.className).toContain("bottom-0");
      expect(rotateHandle.className).toContain("left-0");
      expect(rotateHandle.querySelector("svg")).not.toBeNull();
      const resizeHandles = document.querySelectorAll("[data-sketch-resize-handle]");
      expect(resizeHandles).toHaveLength(8);
      resizeHandles.forEach((handle) => {
        expect(handle.className).toContain("bg-white");
        expect(handle.className).toContain("border-slate-300");
      });
      expect(rotateHandle.getAttribute("title")).toBe("旋转");
      expect(Number.parseFloat(rotateHandle.style.width)).toBeCloseTo(24);
      expect(Number.parseFloat((resizeHandles[0] as HTMLElement).style.width)).toBeCloseTo(12);
      expect(screen.queryByTestId("sketch-hover-highlight")).toBeNull();
    });

    fireEvent.click(screen.getByLabelText("放大"));

    await waitFor(() => {
      expect(Number.parseFloat(screen.getByTestId("sketch-rotate-handle").getAttribute("style")?.match(/width:\s*([^;]+)/)?.[1] ?? "0")).toBeCloseTo(24 / 1.15);
      const resized = document.querySelector("[data-sketch-resize-handle]") as HTMLElement;
      expect(Number.parseFloat(resized.style.width)).toBeCloseTo(12 / 1.15);
    });

    fireEvent.pointerMove(getSketchNodeElement("title"), { clientX: 40, clientY: 44 });

    await waitFor(() => {
      expect(screen.getByTestId("sketch-hover-highlight")).not.toBeNull();
      expect(screen.getByText("1 selected")).not.toBeNull();
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("cycles overlapping object selection with Cmd or Ctrl click without changing scene data", async () => {
    const overlapScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "bottom", type: "rect", x: 40, y: 40, width: 120, height: 90, text: "Bottom" },
        { id: "top", type: "rect", x: 60, y: 60, width: 120, height: 90, text: "Top" },
      ],
    };
    const selectionEvents: SketchEditorSelection[] = [];
    render(<ControlledEditor initialScene={overlapScene} onSelectionChange={(selection) => selectionEvents.push(selection)} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const originalSceneJson = screen.getByTestId("scene-json").textContent;

    dispatchPointerEvent(stage, "pointerdown", 80, 80, { metaKey: true });

    await waitFor(() => {
      expect(selectionEvents.at(-1)?.nodeIds).toEqual(["top"]);
    });

    dispatchPointerEvent(stage, "pointerdown", 80, 80, { metaKey: true });

    await waitFor(() => {
      expect(selectionEvents.at(-1)?.nodeIds).toEqual(["bottom"]);
    });

    dispatchPointerEvent(stage, "pointerdown", 80, 80, { ctrlKey: true });

    await waitFor(() => {
      expect(selectionEvents.at(-1)?.nodeIds).toEqual(["top"]);
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("navigates visible canvas objects with Tab and Shift Tab without changing scene data", async () => {
    const navigationScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 320, height: 220 },
      nodes: [
        { id: "title", type: "text", x: 20, y: 20, width: 120, height: 32, text: "Title" },
        { id: "hidden", type: "rect", x: 40, y: 70, width: 80, height: 40, visible: false },
        { id: "card", type: "card", x: 150, y: 80, width: 120, height: 64, text: "Card" },
        { id: "missing-image", type: "image", x: 20, y: 150, width: 60, height: 40 },
      ],
    };
    render(<KeyboardNavigationHarness initialScene={navigationScene} />);
    const originalSceneJson = screen.getByTestId("scene-json").textContent;

    fireEvent.keyDown(window, { key: "Tab" });
    await waitFor(() => expect(JSON.parse(screen.getByTestId("selection-node-ids").textContent ?? "[]")).toEqual(["title"]));

    fireEvent.keyDown(window, { key: "Tab" });
    await waitFor(() => expect(JSON.parse(screen.getByTestId("selection-node-ids").textContent ?? "[]")).toEqual(["card"]));

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(JSON.parse(screen.getByTestId("selection-node-ids").textContent ?? "[]")).toEqual(["title"]));

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(JSON.parse(screen.getByTestId("selection-node-ids").textContent ?? "[]")).toEqual(["card"]));
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("enters semantic group child selection before allowing a second double click to edit text", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 60, y: 100, width: 160, height: 90, visible: false, children: ["card"], name: "Card group" },
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, text: "Card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={groupedScene} />);

    const originalSceneJson = screen.getByTestId("scene-json").textContent;
    clickLayerNode("group");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("对象文本")).toBeNull();
      expect(getLayerRow("group").className).toContain("bg-[#2f5d97]");
    });

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    fireEvent.doubleClick(cardLabel as Element, { clientX: 120, clientY: 140 });

    await waitFor(() => {
      expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
      expect(getLayerRow("card").className).toContain("bg-[#2f5d97]");
    });

    fireEvent.doubleClick(getSketchNodeLabelElement("card"), { clientX: 120, clientY: 140 });

    await waitFor(() => {
      expect(screen.getByLabelText("画布文本编辑")).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
    });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(getLayerRow("group").className).toContain("bg-[#2f5d97]");
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("shows rectangular marquee feedback on blank-space drag without changing scene data", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledEditor initialScene={emptyScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const originalSceneJson = screen.getByTestId("scene-json").textContent;

    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 160, 130);

    await waitFor(() => {
      expect(screen.getByTestId("sketch-marquee-box")).toBeTruthy();
      expect(screen.getByTestId("sketch-marquee-mode-label").textContent).toBe("矩形框选");
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);

    dispatchPointerEvent(stage, "pointerup", 160, 130);

    await waitFor(() => {
      expect(screen.queryByTestId("sketch-marquee-box")).toBeNull();
      expect(screen.queryByTestId("sketch-marquee-mode-label")).toBeNull();
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("renames a layer without changing the canvas text", async () => {
    const namedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "card", type: "card", x: 60, y: 100, width: 160, height: 90, name: "Old layer", text: "Visible card" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={namedScene} />);

    const rowButton = screen.getByTitle("Old layer");
    fireEvent.doubleClick(rowButton);
    const renameInput = screen.getByLabelText("重命名图层 Old layer");
    fireEvent.change(renameInput, { target: { value: "Renamed layer" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTitle("Renamed layer")).toBeTruthy();
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({
        name: "Renamed layer",
        text: "Visible card",
      });
    });
    expect(document.body.innerHTML).toContain("Visible card");
  });

  it("reorders layers by dragging rows without changing node content", async () => {
    const layerScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "back", type: "rect", x: 20, y: 30, width: 80, height: 40, name: "Back", text: "Back text", zIndex: 0 },
        { id: "middle", type: "rect", x: 40, y: 50, width: 80, height: 40, name: "Middle", text: "Middle text", zIndex: 1 },
        { id: "front", type: "rect", x: 60, y: 70, width: 80, height: 40, name: "Front", text: "Front text", zIndex: 2 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={layerScene} />);

    const dataTransfer = createDragDataTransfer();
    fireEvent.dragStart(getLayerRow("back"), { dataTransfer });
    fireEvent.dragOver(getLayerRow("front"), { dataTransfer });
    fireEvent.drop(getLayerRow("front"), { dataTransfer });

    await waitFor(() => {
      const parsed = readRenderedScene();
      const byId = new Map(parsed.nodes.map((node) => [node.id, node]));
      expect(byId.get("back")).toMatchObject({ zIndex: 2, name: "Back", text: "Back text" });
      expect(byId.get("front")).toMatchObject({ zIndex: 1, name: "Front", text: "Front text" });
      expect(byId.get("middle")).toMatchObject({ zIndex: 0, name: "Middle", text: "Middle text" });
      expect(getLayerRow("back").className).toContain("bg-[#2f5d97]");
    });
  });

  it("filters layer rows by search text and node type without changing scene data", async () => {
    const layerScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "hero-card", type: "card", x: 20, y: 30, width: 80, height: 40, name: "Hero card", text: "Visible hero" },
        { id: "hero-image", type: "image", x: 40, y: 50, width: 80, height: 40, name: "Hero image", src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" },
        { id: "baseline", type: "line", x: 10, y: 10, width: 120, height: 0, name: "Baseline" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={layerScene} />);

    const originalSceneJson = screen.getByTestId("scene-json").textContent;
    fireEvent.change(screen.getByLabelText("搜索图层"), { target: { value: "hero" } });

    await waitFor(() => {
      expect(queryLayerRow("hero-card")).not.toBeNull();
      expect(queryLayerRow("hero-image")).not.toBeNull();
      expect(queryLayerRow("baseline")).toBeNull();
    });

    fireEvent.change(screen.getByLabelText("筛选图层类型"), { target: { value: "image" } });

    await waitFor(() => {
      expect(queryLayerRow("hero-card")).toBeNull();
      expect(queryLayerRow("hero-image")).not.toBeNull();
      expect(queryLayerRow("baseline")).toBeNull();
    });

    fireEvent.change(screen.getByLabelText("搜索图层"), { target: { value: "missing" } });

    await waitFor(() => {
      expect(screen.getByText("没有匹配的图层。")).toBeTruthy();
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
  });

  it("shows persistent layer status icons for groups locked hidden and bound nodes", () => {
    const statusScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 20, y: 20, width: 80, height: 60, visible: false, children: ["locked"], name: "Group layer" },
        { id: "locked", type: "rect", x: 20, y: 20, width: 80, height: 60, locked: true, name: "Locked layer" },
        { id: "hidden", type: "ellipse", x: 120, y: 20, width: 80, height: 60, visible: false, name: "Hidden layer" },
        { id: "bound", type: "text", x: 20, y: 120, width: 120, height: 40, text: "Bound", bindings: { text: "headline" }, name: "Bound layer" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={statusScene} configData={{ headline: "Runtime headline" }} />);

    expect(screen.getByLabelText("分组 Group layer")).toBeTruthy();
    expect(screen.getByLabelText("已锁定 Locked layer")).toBeTruthy();
    expect(screen.getByLabelText("已隐藏 Hidden layer")).toBeTruthy();
    expect(screen.getByLabelText("已绑定 Bound layer")).toBeTruthy();
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

  it("runs object commands from the command palette and exposes disabled reasons", async () => {
    render(<ControlledPartsEditorWithToolbar initialScene={scene} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    let palette = screen.getByRole("dialog", { name: "草图命令面板" });
    fireEvent.change(within(palette).getByLabelText("搜索草图命令"), { target: { value: "删除" } });
    expect(within(palette).getByRole("button", { name: /删除/ }).hasAttribute("disabled")).toBe(true);
    expect(within(palette).getByText("当前选择不可编辑")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTitle("Card"));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    palette = screen.getByRole("dialog", { name: "草图命令面板" });
    fireEvent.change(within(palette).getByLabelText("搜索草图命令"), { target: { value: "复制副本" } });
    fireEvent.click(within(palette).getByRole("button", { name: /复制副本/ }));

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.filter((node) => node.type === "card")).toHaveLength(2);
      expect(screen.queryByRole("dialog", { name: "草图命令面板" })).toBeNull();
    });
  });

  it("imports image files directly from the image command", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={emptyScene} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = screen.getByRole("dialog", { name: "草图命令面板" });
    fireEvent.change(within(palette).getByLabelText("搜索草图命令"), { target: { value: "图片" } });
    fireEvent.click(within(palette).getByRole("button", { name: /图片/ }));
    fireEvent.change(screen.getByLabelText("图片导入文件"), {
      target: { files: [new File(["image-bytes"], "command.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      const parsed = readRenderedScene();
      const imageNode = parsed.nodes.find((node) => node.type === "image");
      expect(imageNode).toMatchObject({ type: "image", name: "command.png", alt: "command.png" });
      expect(imageNode?.src).toContain("data:image/png;base64");
      expect(screen.queryByRole("dialog", { name: "草图命令面板" })).toBeNull();
    });
  });

  it("keeps inner whiteboard Escape handling inside the overlay", () => {
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <ControlledPartsEditorWithToolbar initialScene={scene} />
      </div>,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = screen.getByRole("dialog", { name: "草图命令面板" });
    fireEvent.keyDown(within(palette).getByLabelText("搜索草图命令"), { key: "Escape" });

    expect(outerKeyDown).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "草图命令面板" })).toBeNull();

    fireEvent.click(screen.getByLabelText("打开快捷键帮助"));
    const help = screen.getByRole("dialog", { name: "草图快捷键帮助" });
    fireEvent.keyDown(help, { key: "Escape" });

    expect(outerKeyDown).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "草图快捷键帮助" })).toBeNull();
  });

  it("renders shortcut help from registered actions", () => {
    render(<ControlledPartsEditorWithToolbar initialScene={scene} />);

    fireEvent.click(screen.getByLabelText("打开快捷键帮助"));

    const help = screen.getByRole("dialog", { name: "草图快捷键帮助" });
    expect(within(help).getByText("复制样式")).not.toBeNull();
    expect(within(help).getByText("Cmd/Ctrl+Alt+C")).not.toBeNull();
    expect(within(help).getByText("置顶")).not.toBeNull();
    expect(within(help).getByText("Cmd/Ctrl+Shift+]")).not.toBeNull();
  });

  it("copies and pastes styles through registered keyboard actions", async () => {
    const styleScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "source", type: "rect", x: 30, y: 40, width: 80, height: 50, style: { fill: "#ef4444", stroke: "#111827", strokeWidth: 5, opacity: 0.5, radius: 12 } },
        { id: "target", type: "ellipse", x: 160, y: 40, width: 80, height: 50, style: { fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1 } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={styleScene} />);

    clickLayerNode("source");
    fireEvent.keyDown(window, { key: "c", metaKey: true, altKey: true });
    clickLayerNode("target");
    fireEvent.keyDown(window, { key: "v", metaKey: true, altKey: true });

    await waitFor(() => {
      const target = readRenderedScene().nodes.find((node) => node.id === "target");
      expect(target?.style).toMatchObject({
        fill: "#ef4444",
        stroke: "#111827",
        strokeWidth: 5,
        opacity: 0.5,
      });
      expect(target?.style?.radius).toBeUndefined();
    });
  });

  it("draws diamond nodes from the toolbar", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={emptyScene} />);
    const stage = getCanvasStage();
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

    fireEvent.click(screen.getByLabelText("菱形"));
    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 150, 130);
    dispatchPointerEvent(stage, "pointerup", 150, 130);

    await waitFor(() => {
      const diamond = readRenderedScene().nodes.find((node) => node.type === "diamond");
      expect(diamond).toMatchObject({ name: "菱形", x: 40, y: 50, width: 110, height: 80 });
      expect(document.querySelector(`[data-sketch-node-id="${diamond?.id}"]`)).not.toBeNull();
    });
  });

  it("uses one floating primary toolbar and canvas keyboard scope in the shared editor surface", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledSurfaceEditor initialScene={emptyScene} />);
    const stage = getCanvasStage();
    setCanvasStageRect(stage);

    expect(document.querySelectorAll("[data-sketch-editor-surface]")).toHaveLength(1);
    expect(screen.getAllByLabelText("菱形")).toHaveLength(1);
    expect(screen.queryByText("属性面板")).toBeNull();

    fireEvent.click(screen.getByLabelText("菱形"));
    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 150, 130);
    dispatchPointerEvent(stage, "pointerup", 150, 130);

    await waitFor(() => {
      const rendered = screen.getByTestId("surface-scene-json").textContent ?? "{}";
      expect((JSON.parse(rendered) as SketchSceneDocument).nodes).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "diamond", x: 40, y: 50 })]),
      );
    });
  });

  it("uses the shared whiteboard profile without filtering existing scene nodes", () => {
    const whiteboardScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "existing-diamond", type: "diamond", x: 24, y: 24, width: 100, height: 70, text: "已有菱形" },
        { id: "existing-path", type: "path", x: 40, y: 140, width: 140, height: 24, path: "M 40 152 L 180 152", points: [{ x: 40, y: 152 }, { x: 180, y: 152 }] },
      ],
    };

    render(
      <SketchEditorSurface
        scene={whiteboardScene}
        profile="whiteboard"
        allowedTools={["select"]}
        brushToolbarMode="individual"
        fillContainer
      />,
    );

    expect(SKETCH_EDITOR_PROFILES.whiteboard.visibleTools).toEqual(WHITEBOARD_EDITOR_TOOLS);
    expect(SKETCH_EDITOR_PROFILES.whiteboard.creationTools).toBe(WHITEBOARD_EDITOR_TOOLS);
    expect(SKETCH_EDITOR_PROFILES.whiteboard.brushToolbarMode).toBe("grouped");

    for (const label of ["选择", "抓手", "矩形", "圆形", "文本", "图片"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: "画笔工具" })).toBeTruthy();
    for (const label of ["菱形", "线条", "箭头", "便签", "橡皮"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "橡皮擦" })).toBeNull();
    expect(document.querySelector('[data-sketch-node-id="existing-diamond"]')).not.toBeNull();
    expect(document.querySelector('[data-sketch-node-id="existing-path"]')).not.toBeNull();
  });

  it("restores the persisted viewport through the shared whiteboard surface", () => {
    const whiteboardScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "existing-diamond", type: "diamond", x: 24, y: 24, width: 100, height: 70, text: "已有菱形" },
      ],
    };

    render(
      <SketchEditorSurface
        profile="whiteboard"
        scene={whiteboardScene}
        initialViewport={{ scale: 0.75, offsetX: 18, offsetY: 22 }}
        fillContainer
      />,
    );

    const stage = getCanvasStage();
    expect(stage.style.transform).toBe("translate(18px, 22px) scale(0.75)");
    for (const label of ["选择", "抓手", "矩形", "圆形", "文本", "图片"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: "画笔工具" })).toBeTruthy();
    expect(document.querySelector('[data-sketch-node-id="existing-diamond"]')).not.toBeNull();
  });

  it("首次适配上报 fit，手动缩放上报 interaction 且重新渲染不重置视口", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    try {
      const onViewportChange = vi.fn();
      const { rerender } = render(
        <SketchEditorSurface scene={scene} profile="whiteboard" autoFitToContent onViewportChange={onViewportChange} />,
      );
      expect(onViewportChange).toHaveBeenLastCalledWith(expect.objectContaining({ scale: expect.any(Number) }), "fit");
      fireEvent.click(screen.getByLabelText("放大"));
      expect(onViewportChange).toHaveBeenLastCalledWith(expect.objectContaining({ scale: expect.any(Number) }), "interaction");
      const manualTransform = getCanvasStage().style.transform;
      const count = onViewportChange.mock.calls.length;
      rerender(<SketchEditorSurface scene={{ ...scene }} profile="whiteboard" autoFitToContent onViewportChange={onViewportChange} />);
      expect(getCanvasStage().style.transform).toBe(manualTransform);
      expect(onViewportChange).toHaveBeenCalledTimes(count);
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });

  it("presents the grouped brush entry with accessible secondary controls", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledGroupedBrushSurfaceEditor initialScene={emptyScene} />);

    const brushGroup = screen.getByRole("group", { name: "画笔工具" });
    expect(within(brushGroup).getByRole("button", { name: "画笔" })).toBeTruthy();
    expect(within(brushGroup).getByRole("button", { name: "打开画笔设置" })).toBeTruthy();
    expect(within(brushGroup).queryByRole("button", { name: "橡皮擦" })).toBeNull();

    fireEvent.click(within(brushGroup).getByRole("button", { name: "打开画笔设置" }));
    const settings = screen.getByRole("dialog", { name: "画笔设置" });
    expect(within(settings).getByRole("button", { name: "画笔" })).toBeTruthy();
    expect(within(settings).getByRole("button", { name: "橡皮擦" })).toBeTruthy();
    expect(within(settings).getByRole("button", { name: "画笔颜色选择器" }).textContent).toContain("#111827");
    expect(within(settings).getByRole("radio", { name: "画笔粗细 中" }).getAttribute("aria-checked")).toBe("true");

    clickSharedPreset(settings, "画笔颜色", "#7c3aed");
    fireEvent.click(within(settings).getByRole("radio", { name: "画笔粗细 粗" }));
    expect(within(settings).getByRole("button", { name: "画笔颜色选择器" }).textContent).toContain("#7C3AED");
    expect(within(settings).getByRole("radio", { name: "画笔粗细 粗" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(settings, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "画笔设置" })).toBeNull();
      expect(within(brushGroup).getByRole("button", { name: "画笔" }).getAttribute("aria-pressed")).toBe("false");
    });

    fireEvent.click(within(brushGroup).getByRole("button", { name: "打开画笔设置" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "画笔设置" })).getByRole("button", { name: "画笔" }));
    expect(within(brushGroup).getByRole("button", { name: "画笔" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.pointerDown(getCanvasStage(), { clientX: 10, clientY: 10 });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "画笔设置" })).toBeNull());
  });

  it("keeps the grouped brush active and writes temporary color and width into new paths", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledGroupedBrushSurfaceEditor initialScene={emptyScene} />);
    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const brushGroup = screen.getByRole("group", { name: "画笔工具" });

    fireEvent.click(within(brushGroup).getByRole("button", { name: "打开画笔设置" }));
    const settings = screen.getByRole("dialog", { name: "画笔设置" });
    clickSharedPreset(settings, "画笔颜色", "#7c3aed");
    fireEvent.click(within(settings).getByRole("radio", { name: "画笔粗细 粗" }));
    fireEvent.click(within(brushGroup).getByRole("button", { name: "画笔" }));

    dispatchPointerEvent(stage, "pointerdown", 20, 20);
    dispatchPointerEvent(stage, "pointerup", 20, 20);
    expect(readSurfaceRenderedScene().nodes).toHaveLength(0);
    dispatchPointerEvent(stage, "pointerdown", 20, 20);
    dispatchPointerEvent(stage, "pointermove", 30, 30);
    fireEvent.keyDown(window, { key: "Escape" });
    dispatchPointerEvent(stage, "pointerup", 30, 30);
    expect(readSurfaceRenderedScene().nodes).toHaveLength(0);

    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 80, 70);
    dispatchPointerEvent(stage, "pointermove", 120, 90);
    dispatchPointerEvent(stage, "pointerup", 120, 90);
    dispatchPointerEvent(stage, "pointerdown", 180, 120);
    dispatchPointerEvent(stage, "pointermove", 220, 135);
    dispatchPointerEvent(stage, "pointerup", 220, 135);

    await waitFor(() => {
      const paths = readSurfaceRenderedScene().nodes.filter((node) => node.type === "path");
      expect(paths).toHaveLength(2);
      expect(paths).toEqual(expect.arrayContaining([
        expect.objectContaining({ style: expect.objectContaining({ stroke: "#7c3aed", strokeWidth: 5 }) }),
      ]));
      expect(within(brushGroup).getByRole("button", { name: "画笔" }).getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(within(brushGroup).getByRole("button", { name: "打开画笔设置" }));
    const openSettings = screen.getByRole("dialog", { name: "画笔设置" });
    fireEvent.click(within(openSettings).getByRole("button", { name: "橡皮擦" }));
    expect(within(brushGroup).getByRole("button", { name: "画笔" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("renders an in-progress pencil path above images without persisting its preview layer", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "cover-image",
          type: "image",
          x: 40,
          y: 40,
          width: 240,
          height: 160,
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3Crect width='2' height='2' fill='%23e2e8f0'/%3E%3C/svg%3E",
          zIndex: 12,
        },
      ],
    };
    render(<ControlledSurfaceEditor initialScene={imageScene} />);
    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    fireEvent.click(screen.getByRole("button", { name: "画笔" }));

    dispatchPointerEvent(stage, "pointerdown", 20, 120);
    dispatchPointerEvent(stage, "pointermove", 240, 140);

    await waitFor(() => {
      const renderedNodes = Array.from(stage.querySelectorAll("[data-sketch-node-id]"));
      const imageIndex = renderedNodes.findIndex((node) => node.getAttribute("data-sketch-node-id") === "cover-image");
      const pathIndex = renderedNodes.findIndex((node) => node.tagName.toLowerCase() === "path");
      expect(imageIndex).toBeGreaterThanOrEqual(0);
      expect(pathIndex).toBeGreaterThan(imageIndex);
    });
    expect(readSurfaceRenderedScene().nodes).toEqual(imageScene.nodes);

    dispatchPointerEvent(stage, "pointerup", 240, 140);
    await waitFor(() => {
      const committed = readSurfaceRenderedScene();
      const image = committed.nodes.find((node) => node.id === "cover-image");
      const path = committed.nodes.find((node) => node.type === "path");
      expect(path).toBeDefined();
      expect(path?.zIndex).toBeGreaterThan(image?.zIndex ?? -1);
    });
  });

  it("erases only visible unlocked paths and keeps the deletion undoable", async () => {
    const eraseScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "path-a", type: "path", x: 30, y: 39, width: 120, height: 2, path: "M 30 40 L 150 41", points: [{ x: 30, y: 40 }, { x: 150, y: 41 }] },
        { id: "path-b", type: "path", x: 30, y: 69, width: 120, height: 2, path: "M 30 70 L 150 71", points: [{ x: 30, y: 70 }, { x: 150, y: 71 }] },
        { id: "rect", type: "rect", x: 30, y: 100, width: 120, height: 40 },
        { id: "text", type: "text", x: 30, y: 160, width: 120, height: 30, text: "Keep me" },
        { id: "locked-path", type: "path", x: 30, y: 209, width: 120, height: 2, path: "M 30 210 L 150 211", points: [{ x: 30, y: 210 }, { x: 150, y: 211 }], locked: true },
        { id: "hidden-path", type: "path", x: 30, y: 239, width: 120, height: 2, path: "M 30 240 L 150 241", points: [{ x: 30, y: 240 }, { x: 150, y: 241 }], visible: false },
      ],
    };
    render(<ControlledGroupedBrushSurfaceEditor initialScene={eraseScene} />);
    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const brushGroup = screen.getByRole("group", { name: "画笔工具" });
    fireEvent.click(within(brushGroup).getByRole("button", { name: "打开画笔设置" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "画笔设置" })).getByRole("button", { name: "橡皮擦" }));

    dispatchPointerEvent(stage, "pointerdown", 90, 40);
    dispatchPointerEvent(stage, "pointermove", 90, 70);
    dispatchPointerEvent(stage, "pointerup", 90, 70);

    await waitFor(() => {
      const parsed = readSurfaceRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "path-a")).toBeUndefined();
      expect(parsed.nodes.find((node) => node.id === "path-b")).toBeUndefined();
      expect(parsed.nodes.find((node) => node.id === "rect")).toBeDefined();
      expect(parsed.nodes.find((node) => node.id === "text")).toBeDefined();
      expect(parsed.nodes.find((node) => node.id === "locked-path")).toBeDefined();
      expect(parsed.nodes.find((node) => node.id === "hidden-path")).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText("撤销"));
    await waitFor(() => {
      expect(readSurfaceRenderedScene().nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["path-a", "path-b"]));
    });
    fireEvent.click(screen.getByLabelText("重做"));
    await waitFor(() => {
      expect(readSurfaceRenderedScene().nodes.map((node) => node.id)).not.toEqual(expect.arrayContaining(["path-a", "path-b"]));
    });
  });

  it("keeps the default toolbar presentation with separate pencil and eraser actions", () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledSurfaceEditor initialScene={emptyScene} />);

    expect(screen.getByRole("button", { name: "画笔" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "橡皮" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "画笔工具" })).toBeNull();
  });

  it("keeps fill-container stages in scene coordinates for pointer mapping", () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledSurfaceEditor initialScene={emptyScene} />);

    const stage = getCanvasStage();

    expect(stage.style.width).toBe("400px");
    expect(stage.style.height).toBe("300px");
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

    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    expect(editor.className).toContain("bg-transparent");
    expect(editor.className).toContain("[scrollbar-width:none]");
    expect(editor.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(editor.style.overflowX).toBe("auto");
    expect(editor.style.overflowY).toBe("hidden");
    fireEvent.change(editor, { target: { value: "Shape label" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.text).toBe("Shape label");
    });
  });

  it("reopens pure and shape text editing after a blur commit", async () => {
    const editableScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "text", type: "text", x: 40, y: 40, width: 80, height: 30, text: "Text" },
        { id: "rect", type: "rect", x: 40, y: 110, width: 140, height: 70, text: "Shape" },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={editableScene} />);

    fireEvent.doubleClick(getSketchNodeElement("text"));
    let editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Text after blur" } });
    fireEvent.blur(editor);
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "text")?.text).toBe("Text after blur"));

    fireEvent.doubleClick(getSketchNodeElement("text"));
    editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    expect(editor.value).toBe("Text after blur");
    fireEvent.keyDown(editor, { key: "Escape" });

    fireEvent.doubleClick(getSketchNodeElement("rect"));
    editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Shape after blur" } });
    fireEvent.blur(editor);
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.text).toBe("Shape after blur"));

    fireEvent.doubleClick(getSketchNodeElement("rect"));
    editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    expect(editor.value).toBe("Shape after blur");
  });

  it("hides the blank pure text placeholder while retaining its measured editing width", async () => {
    render(<ControlledEditor initialScene={{ version: 1, pageSize: { width: 400, height: 300 }, nodes: [] }} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    fireEvent.click(screen.getByLabelText("文本"));
    dispatchPointerEvent(stage, "pointerdown", 260, 160);
    dispatchPointerEvent(stage, "pointerup", 260, 160);

    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    expect(editor.getAttribute("placeholder")).toBeNull();
    expect(editor.className).toContain("bg-transparent");
    expect(editor.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(editor.style.overflowX).toBe("hidden");
    expect(editor.style.overflowY).toBe("hidden");
    expect(Number.parseFloat(editor.style.width)).toBeGreaterThan(32);
    fireEvent.keyDown(editor, { key: "Escape" });
  });

  it("starts shape text editing from empty shape body hit testing", async () => {
    const shapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 40, y: 50, width: 140, height: 70 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={shapeScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    fireEvent.doubleClick(stage, { clientX: 82, clientY: 74 });

    const editor = await screen.findByLabelText("画布文本编辑");
    expect(editor).toHaveProperty("placeholder", "输入形状文本");
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({ type: "rect" });
      expect(parsed.nodes.find((node) => node.id === "rect")?.text ?? "").toBe("");
    });
  });

  it("does not start inline text editing for locked shapes", () => {
    const lockedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "locked", type: "rect", x: 40, y: 50, width: 140, height: 70, locked: true },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={lockedScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    fireEvent.doubleClick(stage, { clientX: 82, clientY: 74 });

    expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
  });

  it("does not start inline text editing in preview mode", () => {
    const shapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 40, y: 50, width: 140, height: 70, text: "Preview" },
      ],
    };
    render(<ControlledEditor initialScene={shapeScene} mode="preview" />);

    const rectNode = document.querySelector('[data-sketch-node-id="rect"]');
    expect(rectNode).not.toBeNull();
    fireEvent.doubleClick(rectNode as Element);

    expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
  });

  it("positions inline shape text editing within the text area and keeps rotation", async () => {
    const rotatedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "rotated",
          type: "rect",
          x: 40,
          y: 50,
          width: 140,
          height: 70,
          rotation: 30,
          text: "Rotated",
          style: { fontSize: 20, fontWeight: 700, color: "#123456", textAlign: "right" },
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={rotatedScene} />);

    const rectNode = document.querySelector('[data-sketch-node-id="rotated"]');
    expect(rectNode).not.toBeNull();
    fireEvent.doubleClick(rectNode as Element);

    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    expect(editor.style.transform).toBe("rotate(30deg)");
    expect(editor.style.textAlign).toBe("right");
    expect(editor.style.fontSize).toBe("20px");
    expect(editor.style.color).toBe("rgb(18, 52, 86)");
    expect(Number.parseFloat(editor.style.width)).toBeLessThan(140);
    expect(Number.parseFloat(editor.style.left)).toBeGreaterThan(40);
    expect(Number.parseFloat(editor.style.top)).toBeGreaterThan(50);

    const initialHeight = Number.parseFloat(editor.style.height);
    const initialTop = Number.parseFloat(editor.style.top);
    expect(screen.queryByTestId("sketch-inline-text-overflow")).toBeNull();
    fireEvent.change(editor, { target: { value: "Line 1\nLine 2\nLine 3" } });

    expect(Number.parseFloat(editor.style.height)).toBeGreaterThan(initialHeight);
    expect(Number.parseFloat(editor.style.top)).toBeLessThan(initialTop);
    expect(Number.parseFloat(editor.style.top) + Number.parseFloat(editor.style.height)).toBeLessThanOrEqual(120);
    expect(editor.style.overflowY).toBe("auto");
    expect(screen.getByTestId("sketch-inline-text-overflow").textContent).toBe("文本超出");
  });

  it("applies text style changes only to the selected inline text range", async () => {
    const partialTextScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "card",
          type: "card",
          x: 60,
          y: 100,
          width: 160,
          height: 90,
          text: "Hello",
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={partialTextScene} />);

    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();
    fireEvent.doubleClick(cardNode as Element);

    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    editor.setSelectionRange(1, 4);
    fireEvent.select(editor);
    fireEvent.change(screen.getByLabelText("斜体"), { target: { value: "true" } });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const card = parsed.nodes.find((node) => node.id === "card");
      expect(card?.text).toBe("Hello");
      expect(card?.textStyleRuns).toEqual([
        {
          start: 1,
          length: 3,
          style: { italic: true },
        },
      ]);
    });
  });

  it("shows the pure text toolbar with layer access, color presets, and alignment controls", async () => {
    const textScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "title", type: "text", x: 20, y: 30, width: 120, height: 34, text: "Title" }],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={textScene} />);

    clickLayerNode("title");
    const toolbar = await screen.findByRole("toolbar", { name: "纯文本工具栏" });
    expect(within(toolbar).getByLabelText("悬浮字号")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮加粗")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮斜体")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮下划线")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮文字颜色")).not.toBeNull();
    const textColorIndicator = within(toolbar).getByTestId("sketch-text-color-indicator");
    expect(textColorIndicator).not.toBeNull();
    expect(textColorIndicator.className).toContain("h-[1.4rem]");
    expect(textColorIndicator.className).toContain("w-[1.2rem]");
    const textColorUnderline = within(toolbar).getByTestId("sketch-text-color-underline");
    expect(textColorUnderline).not.toBeNull();
    expect(textColorUnderline.className).toContain("bottom-0");
    expect(within(toolbar).getByLabelText("对齐方式")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮层级")).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮更多")).not.toBeNull();

    const layerTrigger = within(toolbar).getByLabelText("悬浮层级");
    fireEvent.click(layerTrigger);
    expect(screen.getByRole("menu", { name: "层级" })).not.toBeNull();
    fireEvent.click(layerTrigger);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "层级" })).toBeNull());

    fireEvent.click(within(toolbar).getByLabelText("悬浮文字颜色"));
    const colorMenu = screen.getByRole("menu", { name: "文字颜色" });
    expect(within(colorMenu).queryByLabelText(/无颜色/)).toBeNull();
    clickSharedPreset(colorMenu, "文字颜色", "#ef4444");

    fireEvent.click(within(toolbar).getByLabelText("对齐方式"));
    const alignMenu = screen.getByRole("menu", { name: "对齐方式" });
    fireEvent.click(within(alignMenu).getByLabelText("对齐方式 居中对齐"));

    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "title");
      expect(node?.style).toMatchObject({ color: "#ef4444", textAlign: "center" });
    });
  });

  it("shares one unique 10 by 6 palette across text, shape, and property color controls", async () => {
    const textShapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{
        id: "rect",
        type: "rect",
        x: 20,
        y: 30,
        width: 120,
        height: 60,
        text: "Color target",
        style: { fill: "#ffffff", stroke: "#111827", color: "#111827" },
      }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={textShapeScene} />);

    clickLayerNode("rect");

    for (const picker of screen.getAllByTestId("sketch-color-picker")) {
      const colors = getPresetColorButtons(picker);
      expect(colors).toHaveLength(60);
      expect(new Set(colors.map((button) => button.dataset.colorPickerPreset)).size).toBe(60);
      expect(colors.some((button) => button.dataset.colorPickerPreset === "#F59E0B")).toBe(true);
    }

    const toolbar = await screen.findByRole("toolbar", { name: "图文工具栏" });
    fireEvent.click(within(toolbar).getByLabelText("悬浮填充"));
    const fillMenu = screen.getByRole("menu", { name: "填充" });
    expect(getPresetColorButtons(fillMenu)).toHaveLength(60);
    const fillDialog = getColorPickerDialog(fillMenu, "填充");
    expect(within(fillDialog).getByRole("button", { name: "清除" })).toBeTruthy();
    clickSharedPreset(fillMenu, "填充", "#f59e0b");

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.style?.fill).toBe("#f59e0b");
    });

    fireEvent.click(within(toolbar).getByLabelText("悬浮文字颜色"));
    const textMenu = screen.getByRole("menu", { name: "文字颜色" });
    expect(getPresetColorButtons(textMenu)).toHaveLength(60);
    expect(within(textMenu).queryByLabelText(/无颜色/)).toBeNull();
    const textDialog = getColorPickerDialog(textMenu, "文字颜色");
    fireEvent.change(within(textDialog).getByLabelText("文字颜色Hex值"), { target: { value: "#123456" } });

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.style?.color).toBe("#123456");
    });
  });

  it("uses the shared delayed tooltip for contextual text actions without native titles", async () => {
    vi.useFakeTimers();
    try {
      const textScene: SketchSceneDocument = {
        version: 1,
        pageSize: { width: 400, height: 300 },
        nodes: [{ id: "title", type: "text", x: 20, y: 30, width: 120, height: 34, text: "Title" }],
      };
      render(<ControlledPartsEditorWithToolbar initialScene={textScene} />);
      clickLayerNode("title");

      const toolbar = screen.getByRole("toolbar", { name: "纯文本工具栏" });
      const boldButton = within(toolbar).getByLabelText("悬浮加粗");
      expect(boldButton.getAttribute("title")).toBeNull();
      fireEvent.mouseEnter(boldButton.parentElement as HTMLElement);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(screen.getByRole("tooltip").textContent).toBe("加粗");
      fireEvent.mouseLeave(boldButton.parentElement as HTMLElement);
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies pure text defaults without a selection and keeps range styles in runs", async () => {
    const textScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "title", type: "text", x: 20, y: 30, width: 120, height: 34, text: "Hello world" }],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={textScene} />);

    clickLayerNode("title");
    const toolbar = await screen.findByRole("toolbar", { name: "纯文本工具栏" });
    fireEvent.click(within(toolbar).getByLabelText("悬浮斜体"));
    fireEvent.click(within(toolbar).getByLabelText("悬浮下划线"));
    const fontSize = within(toolbar).getByLabelText("悬浮字号");
    fireEvent.change(fontSize, { target: { value: "32" } });
    fireEvent.blur(fontSize);

    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "title");
      expect(node?.style).toMatchObject({ italic: true, textDecoration: "underline", fontSize: 32 });
      expect(node?.textStyleRuns).toBeUndefined();
    });

    fireEvent.doubleClick(getSketchNodeElement("title"));
    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 5);
    fireEvent.select(editor);
    const inlineToolbar = await screen.findByRole("toolbar", { name: "纯文本工具栏" });
    fireEvent.click(within(inlineToolbar).getByLabelText("悬浮加粗"));
    fireEvent.click(within(inlineToolbar).getByLabelText("悬浮文字颜色"));
    const inlineColorMenu = screen.getByRole("menu", { name: "文字颜色" });
    clickSharedPreset(inlineColorMenu, "文字颜色", "#2563eb");
    fireEvent.blur(editor);

    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "title");
      expect(node?.style).toMatchObject({ italic: true, textDecoration: "underline", fontSize: 32 });
      expect(node?.textStyleRuns).toEqual([
        {
          start: 0,
          length: 5,
          style: { fontWeight: 700, color: "#2563eb" },
        },
      ]);
    });
  });

  it("resizes pure text drafts from the longest line and commits on blur", async () => {
    const textScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "title", type: "text", x: 20, y: 30, width: 40, height: 34, text: "A" }],
    };
    render(<ControlledPartsEditor initialScene={textScene} />);

    fireEvent.doubleClick(getSketchNodeElement("title"));
    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    const initialWidth = Number.parseFloat(editor.style.width);
    const initialHeight = Number.parseFloat(editor.style.height);
    fireEvent.change(editor, { target: { value: "A much longer line\nB" } });

    expect(Number.parseFloat(editor.style.width)).toBeGreaterThan(initialWidth);
    expect(Number.parseFloat(editor.style.height)).toBeGreaterThan(initialHeight);
    expect(readRenderedScene().nodes.find((node) => node.id === "title")).toMatchObject({ x: 20, y: 30, width: 40, height: 34 });

    fireEvent.blur(editor);
    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "title");
      expect(node).toMatchObject({ x: 20, y: 30, text: "A much longer line\nB" });
      expect(node?.width).toBeGreaterThan(40);
      expect(node?.height).toBeGreaterThan(34);
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

  it("keeps newly drawn shapes unlabeled until double-click text editing", async () => {
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
    dispatchPointerEvent(stage, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 140, 120);
    dispatchPointerEvent(stage, "pointerup", 140, 120);

    let rectId = "";
    await waitFor(() => {
      const rect = readRenderedScene().nodes.find((node) => node.type === "rect");
      expect(rect).toMatchObject({ name: "矩形" });
      expect(rect?.text ?? "").toBe("");
      rectId = rect?.id ?? "";
      expect(document.querySelector(`[data-sketch-node-label="${rectId}"]`)).toBeNull();
    });

    const rectNode = document.querySelector(`[data-sketch-node-id="${rectId}"]`);
    expect(rectNode).not.toBeNull();
    fireEvent.doubleClick(rectNode as Element);

    const editor = await screen.findByLabelText("画布文本编辑");
    fireEvent.change(editor, { target: { value: "Shape label" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const rect = readRenderedScene().nodes.find((node) => node.id === rectId);
      expect(rect?.text).toBe("Shape label");
      expect(document.querySelector(`[data-sketch-node-label="${rectId}"]`)).not.toBeNull();
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

  it("shows typed snap guides and modifier hints while dragging without persisting guide state", async () => {
    const snapScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "moving", type: "rect", x: 20, y: 30, width: 80, height: 40 },
        { id: "target", type: "rect", x: 140, y: 30, width: 80, height: 40 },
      ],
    };
    render(<ControlledEditor initialScene={snapScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const movingNode = document.querySelector('[data-sketch-node-id="moving"]');
    expect(movingNode).not.toBeNull();

    dispatchPointerEvent(movingNode as Element, "pointerdown", 40, 50);
    dispatchPointerEvent(stage, "pointermove", 80, 50);

    await waitFor(() => {
      const kinds = Array.from(screen.getAllByTestId("sketch-snap-guide")).map((guide) => guide.getAttribute("data-sketch-snap-guide-kind"));
      expect(kinds).toContain("edge");
      expect(screen.getByTestId("sketch-drag-modifier-hint").textContent).toContain("Cmd/Ctrl 暂停吸附与参考线");
      expect(screen.queryByText("网格", { exact: true })).toBeNull();
      expect(screen.queryByText("边缘", { exact: true })).toBeNull();
      expect(screen.queryByText("中心线", { exact: true })).toBeNull();
    });

    dispatchPointerEvent(stage, "pointermove", 60, 50);
    await waitFor(() => {
      const kinds = Array.from(screen.getAllByTestId("sketch-snap-guide")).map((guide) => guide.getAttribute("data-sketch-snap-guide-kind"));
      expect(kinds).toContain("grid");
      expect(kinds).not.toContain("spacing");
    });

    dispatchPointerEvent(stage, "pointermove", 180, 50);
    await waitFor(() => {
      const kinds = Array.from(screen.getAllByTestId("sketch-snap-guide")).map((guide) => guide.getAttribute("data-sketch-snap-guide-kind"));
      expect(kinds).toContain("center");
    });

    dispatchPointerEvent(stage, "pointermove", 180, 50, { metaKey: true });
    await waitFor(() => expect(screen.queryByTestId("sketch-snap-guide")).toBeNull());
    dispatchPointerEvent(stage, "pointerup", 180, 50);
    expect(screen.queryByTestId("sketch-drag-modifier-hint")).toBeNull();
    expect(screen.getByTestId("scene-json").textContent).not.toContain("snap");
  });

  it("automatically snaps moved objects to nearby page and object alignments, but not to the grid", async () => {
    const snapScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "moving", type: "rect", x: 20, y: 50, width: 40, height: 40 },
        { id: "target", type: "rect", x: 120, y: 100, width: 40, height: 40 },
      ],
    };
    render(<ControlledEditor initialScene={snapScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    dispatchPointerEvent(getSketchNodeElement("moving"), "pointerdown", 30, 60);
    dispatchPointerEvent(stage, "pointermove", 128, 112);

    await waitFor(() => {
      const moved = readRenderedScene().nodes.find((node) => node.id === "moving");
      expect(moved).toMatchObject({ x: 120, y: 100 });
      expect(Array.from(screen.getAllByTestId("sketch-snap-guide")).map((guide) => guide.getAttribute("data-sketch-snap-guide-kind"))).toEqual(expect.arrayContaining(["edge", "center"]));
    });

    dispatchPointerEvent(stage, "pointermove", 52, 60);

    await waitFor(() => {
      const moved = readRenderedScene().nodes.find((node) => node.id === "moving");
      expect(moved).toMatchObject({ x: 42, y: 50 });
      const kinds = Array.from(screen.getAllByTestId("sketch-snap-guide")).map((guide) => guide.getAttribute("data-sketch-snap-guide-kind"));
      expect(kinds).toContain("grid");
      expect(kinds).not.toContain("spacing");
    });

    dispatchPointerEvent(stage, "pointermove", 128, 112, { metaKey: true });

    await waitFor(() => {
      expect(screen.queryByTestId("sketch-snap-guide")).toBeNull();
      expect(readRenderedScene().nodes.find((node) => node.id === "moving")).toMatchObject({ x: 118, y: 102 });
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

    fireEvent.click(screen.getByLabelText("文本"));
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

  it("does not create an image placeholder from a blank canvas drag", async () => {
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

    const originalSceneJson = screen.getByTestId("scene-json").textContent;
    fireEvent.click(screen.getByLabelText("图片"));
    dispatchPointerEvent(stage, "pointerdown", 280, 180);
    dispatchPointerEvent(stage, "pointermove", 360, 225);
    dispatchPointerEvent(stage, "pointerup", 360, 225);

    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
    expect(screen.getByLabelText("图片").className).not.toContain("bg-violet-600");
  });

  it("imports image files directly from the image toolbar button", async () => {
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

  it("routes shared surface image uploads through the image bubble menu", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledSurfaceEditor initialScene={emptyScene} />);

    setCanvasStageRect(getCanvasStage());
    fireEvent.click(screen.getByLabelText("图片"));
    const imageMenu = screen.getByRole("menu", { name: "图片工具菜单" });
    expect(within(imageMenu).getByRole("menuitem", { name: "上传图片" })).toBeTruthy();
    fireEvent.click(within(imageMenu).getByRole("menuitem", { name: "上传图片" }));
    fireEvent.change(screen.getByLabelText("图片导入文件"), {
      target: { files: [new File(["image-bytes"], "surface.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument;
      const imageNode = parsed.nodes.find((node) => node.type === "image");
      expect(imageNode).toMatchObject({
        type: "image",
        name: "surface.png",
        alt: "surface.png",
      });
      expect(imageNode?.src).toContain("data:image/png;base64");
    });
  });

  it("anchors the image bubble to the image button and keeps its labels readable", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [],
    };
    render(<ControlledSurfaceEditor initialScene={emptyScene} />);

    const imageButton = screen.getByLabelText("图片");
    imageButton.getBoundingClientRect = () =>
      ({
        left: 240,
        top: 200,
        width: 40,
        height: 40,
        right: 280,
        bottom: 240,
        x: 240,
        y: 200,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(imageButton);

    const imageMenu = await screen.findByRole("menu", { name: "图片工具菜单" });
    await waitFor(() => {
      expect(imageMenu.style.left).toBe("260px");
      expect(imageMenu.style.top).toBe("192px");
      expect(imageMenu.style.transform).toBe("translate(-50%, -100%)");
    });
    expect(imageMenu.className).toContain("text-slate-900");
    expect(within(imageMenu).getByRole("menuitem", { name: "上传图片" }).className).toContain("text-slate-700");
  });

  it("keeps AI placeholders out of scene data and commits a generated batch as one undo step", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 1600, height: 1200 },
      nodes: [],
    };
    let resolveGeneration:
      | ((images: readonly { id: string; src: string; width: number; height: number }[]) => void)
      | undefined;
    const generate = vi.fn(
      () => new Promise<readonly { id: string; src: string; width: number; height: number }[]>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    render(
      <ControlledImageGenerationSurface
        initialScene={emptyScene}
        adapter={{ getCapabilities: () => imageGenerationCapabilities, generate }}
      />,
    );

    fireEvent.click(screen.getByLabelText("图片"));
    fireEvent.click(within(screen.getByRole("menu", { name: "图片工具菜单" })).getByRole("menuitem", { name: "AI 绘图" }));
    const panel = await screen.findByTestId("sketch-ai-image-panel");
    fireEvent.change(within(panel).getByPlaceholderText("描述你想生成的图片…"), {
      target: { value: "一座漂浮在云海上的城市" },
    });
    await waitFor(() => expect((within(panel).getByRole("button", { name: "开始生成" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(within(panel).getByLabelText("生成数量"), { target: { value: "4" } });
    fireEvent.click(within(panel).getByRole("button", { name: "开始生成" }));

    expect((JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument).nodes).toHaveLength(0);
    await waitFor(() => expect(document.querySelectorAll('[data-sketch-node-id^="ai-image-placeholder-"]')).toHaveLength(4));

    await act(async () => {
      resolveGeneration?.(Array.from({ length: 4 }, (_, index) => ({
        id: "generated-" + index,
        src: "data:image/png;base64,AA==",
        width: 1024,
        height: 1024,
      })));
    });

    await waitFor(() => {
      const next = JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(next.nodes).toHaveLength(4);
      expect(next.nodes.map((node) => [node.x, node.y])).toEqual([
        [284, 84],
        [788, 84],
        [284, 588],
        [788, 588],
      ]);
      expect(document.querySelectorAll('[data-sketch-node-id^="ai-image-placeholder-"]')).toHaveLength(0);
      expect(screen.queryByTestId("sketch-ai-image-panel")).toBeNull();
    });

    fireEvent.click(screen.getByLabelText("撤销"));
    await waitFor(() => expect((JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument).nodes).toHaveLength(0));
  });

  it("keeps prompt and settings available after generation fails", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 1200, height: 900 },
      nodes: [],
    };
    render(
      <ControlledImageGenerationSurface
        initialScene={emptyScene}
        adapter={{
          getCapabilities: () => imageGenerationCapabilities,
          generate: async () => {
            throw new Error("生成服务繁忙，请稍后重试");
          },
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("图片"));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 绘图" }));
    const panel = await screen.findByTestId("sketch-ai-image-panel");
    const prompt = within(panel).getByPlaceholderText("描述你想生成的图片…");
    fireEvent.change(prompt, { target: { value: "保留这个提示词" } });
    fireEvent.click(within(panel).getByRole("button", { name: "图像设置" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "图像设置" })).getByRole("button", { name: "高" }));
    fireEvent.click(within(panel).getByRole("button", { name: "开始生成" }));

    expect((await screen.findByRole("alert")).textContent).toContain("生成服务繁忙，请稍后重试");
    expect((prompt as HTMLTextAreaElement).value).toBe("保留这个提示词");
    expect(screen.getByTestId("sketch-ai-image-panel")).toBeTruthy();
    expect((JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument).nodes).toHaveLength(0);
  });

  it("cancels generation without committing placeholders and keeps the draft", async () => {
    const emptyScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 1200, height: 900 },
      nodes: [],
    };
    let generationSignal: AbortSignal | undefined;
    const generate = vi.fn((
      _request: Parameters<SketchImageGenerationAdapter["generate"]>[0],
      signal: AbortSignal,
    ) => new Promise<readonly never[]>((_resolve, reject) => {
      generationSignal = signal;
      signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    }));
    render(
      <ControlledImageGenerationSurface
        initialScene={emptyScene}
        adapter={{ getCapabilities: () => imageGenerationCapabilities, generate }}
      />,
    );

    fireEvent.click(screen.getByLabelText("图片"));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 绘图" }));
    const panel = await screen.findByTestId("sketch-ai-image-panel");
    const prompt = within(panel).getByPlaceholderText("描述你想生成的图片…");
    fireEvent.change(prompt, { target: { value: "取消后保留" } });
    fireEvent.click(within(panel).getByRole("button", { name: "开始生成" }));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "取消生成" })).toBeTruthy());
    fireEvent.click(within(panel).getByRole("button", { name: "取消生成" }));

    await waitFor(() => expect(generationSignal?.aborted).toBe(true));
    await waitFor(() => expect(document.querySelectorAll('[data-sketch-node-id^="ai-image-placeholder-"]')).toHaveLength(0));
    expect((prompt as HTMLTextAreaElement).value).toBe("取消后保留");
    expect(screen.getByTestId("sketch-ai-image-panel")).toBeTruthy();
    expect((JSON.parse(screen.getByTestId("surface-scene-json").textContent ?? "{}") as SketchSceneDocument).nodes).toHaveLength(0);
  });

  it("passes a visible canvas image as a one-time reference selection", async () => {
    const generate = vi.fn(async (
      _request: Parameters<SketchImageGenerationAdapter["generate"]>[0],
      _signal: AbortSignal,
    ) => [{
      id: "generated",
      src: "data:image/png;base64,AA==",
      width: 1024,
      height: 1024,
    }]);
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 1200, height: 900 },
      nodes: [{
        id: "reference-image",
        type: "image",
        x: 40,
        y: 40,
        width: 200,
        height: 120,
        name: "画布参考图",
        src: "data:image/png;base64,AA==",
      }],
    };
    render(
      <ControlledImageGenerationSurface
        initialScene={imageScene}
        adapter={{ getCapabilities: () => imageGenerationCapabilities, generate }}
      />,
    );

    fireEvent.click(screen.getByLabelText("图片"));
    fireEvent.click(screen.getByRole("menuitem", { name: "AI 绘图" }));
    const panel = await screen.findByTestId("sketch-ai-image-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "从画布选取" }));
    const canvasImage = getSketchNodeElement("reference-image");
    dispatchPointerEvent(canvasImage, "pointerdown", 100, 100);
    dispatchPointerEvent(getCanvasStage(), "pointerup", 100, 100);
    await waitFor(() => expect(within(panel).getByAltText("画布参考图")).toBeTruthy());
    fireEvent.change(within(panel).getByPlaceholderText("描述你想生成的图片…"), {
      target: { value: "沿用参考图氛围" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "开始生成" }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      prompt: "沿用参考图氛围",
      references: [{ id: "reference-image", name: "画布参考图" }],
    });
  });

  it("uses decoded image pixels for the default display size with a 600px cap", async () => {
    const cases = [
      { width: 100, height: 50, expected: { width: 100, height: 50 } },
      { width: 1200, height: 600, expected: { width: 600, height: 300 } },
      { width: 600, height: 1200, expected: { width: 300, height: 600 } },
    ];

    for (const item of cases) {
      cleanup();
      const restoreImage = mockDecodedImageDimensions(item.width, item.height);
      try {
        render(<ControlledEditor />);
        const stage = getCanvasStage();
        setCanvasStageRect(stage);
        fireEvent.click(screen.getByLabelText("图片"));
        fireEvent.change(screen.getByLabelText("图片导入文件"), {
          target: { files: [new File(["image-bytes"], "decoded.png", { type: "image/png" })] },
        });

        await waitFor(() => {
          const imageNode = readRenderedScene().nodes.find((node) => node.type === "image");
          expect(imageNode).toMatchObject({
            width: item.expected.width,
            height: item.expected.height,
            intrinsicWidth: item.width,
            intrinsicHeight: item.height,
            style: { imageFit: "contain", stroke: "transparent", strokeWidth: 0 },
          });
        });
      } finally {
        restoreImage();
        cleanup();
      }
    }
  });

  it("opens canvas image fit editing on double click", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "image", type: "image", x: 60, y: 50, width: 120, height: 80, src: "data:image/png;base64,abc", style: { radius: 12 } },
      ],
    };
    render(<ControlledEditor initialScene={imageScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const imageNode = document.querySelector('[data-sketch-node-id="image"]');
    expect(imageNode).not.toBeNull();

    fireEvent.doubleClick(imageNode as Element, { clientX: 80, clientY: 70 });
    const editor = await screen.findByRole("toolbar", { name: "图片裁剪适配编辑" });
    fireEvent.click(within(editor).getByRole("button", { name: "图片完整显示" }));

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "image")).toMatchObject({
        style: { imageFit: "contain", radius: 12 },
      });
      expect(screen.queryByLabelText("画布文本编辑")).toBeNull();
    });
  });

  it("exposes image crop modes, masks the crop area, and resets repeated crops", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "image",
          type: "image",
          x: 80,
          y: 60,
          width: 200,
          height: 100,
          src: "data:image/png;base64,abc",
          style: { imageFit: "contain", stroke: "#111827", strokeWidth: 2 },
        },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={imageScene} />);
    clickLayerNode("image");

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(Array.from(within(toolbar).getAllByRole("button"), (button) => button.getAttribute("aria-label"))).toEqual([
      "悬浮更换图片",
      "悬浮裁剪图片",
      "悬浮描边",
      "悬浮图层",
      "悬浮更多",
    ]);

    fireEvent.click(within(toolbar).getByLabelText("悬浮裁剪图片"));
    const cropMenu = screen.getByRole("menu", { name: "裁剪图片" });
    expect(within(cropMenu).getByRole("menuitem", { name: "矩形裁剪" })).toBeTruthy();
    expect(within(cropMenu).getByRole("menuitem", { name: "圆形裁剪" })).toBeTruthy();
    expect(within(cropMenu).getByRole("menuitem", { name: "重置" })).toBeTruthy();
    fireEvent.click(within(cropMenu).getByRole("menuitem", { name: "矩形裁剪" }));

    await waitFor(() => {
      expect(screen.getByTestId("sketch-image-crop-overlay")).toBeTruthy();
      expect(screen.getByTestId("sketch-image-crop-dim")).toBeTruthy();
      expect(screen.getByTestId("sketch-image-crop-frame")).toBeTruthy();
      expect(screen.queryByRole("toolbar", { name: "草图悬浮快捷工具条" })).toBeNull();
      expect(screen.queryByTestId("sketch-selection-box")).toBeNull();
    });

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const eastHandle = screen.getByTestId("sketch-resize-handle-e");
    dispatchPointerEvent(eastHandle, "pointerdown", 280, 110);
    dispatchPointerEvent(stage, "pointermove", 230, 110);
    dispatchPointerEvent(stage, "pointerup", 230, 110);

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "image")).toMatchObject({
        x: 80,
        y: 60,
        width: 150,
        height: 100,
        imageCrop: {
          shape: "rect",
          sourceRect: { x: 0, y: 0, width: 0.75, height: 1 },
          originalFrame: { x: 80, y: 60, width: 200, height: 100 },
          originalImageFit: "contain",
        },
      });
      const sourceImage = document.querySelector('image[data-sketch-node-id="image"]');
      expect(sourceImage?.getAttribute("clip-path")).toBeNull();
      expect(sourceImage?.getAttribute("x")).toBe("80");
      expect(sourceImage?.getAttribute("width")).toBe("200");
      expect(screen.getByTestId("sketch-image-crop-dim").getAttribute("fill")).toBe("rgba(0,0,0,0.5)");
    });

    // Clicking outside both the crop frame and the current image content commits and exits crop mode.
    dispatchPointerEvent(stage, "pointerdown", 350, 250);
    dispatchPointerEvent(stage, "pointerup", 350, 250);
    await waitFor(() => expect(screen.queryByTestId("sketch-image-crop-overlay")).toBeNull());
    expect(readRenderedScene().nodes.find((node) => node.id === "image")?.imageCrop?.shape).toBe("rect");

    clickLayerNode("image");
    fireEvent.click(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" }).querySelector('[aria-label="悬浮裁剪图片"]') as HTMLElement);
    fireEvent.click(within(screen.getByRole("menu", { name: "裁剪图片" })).getByRole("menuitem", { name: "圆形裁剪" }));

    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "image");
      expect(node).toMatchObject({ x: 80, y: 60, width: 150, height: 100, imageCrop: { shape: "circle" } });
      expect(screen.getByTestId("sketch-image-crop-overlay").getAttribute("data-sketch-image-crop-shape")).toBe("circle");
      expect(document.querySelector('[data-sketch-node-border="image"]')?.tagName).toBe("ellipse");
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("sketch-image-crop-overlay")).toBeNull());
    clickLayerNode("image");
    fireEvent.click(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" }).querySelector('[aria-label="悬浮裁剪图片"]') as HTMLElement);
    fireEvent.click(within(screen.getByRole("menu", { name: "裁剪图片" })).getByRole("menuitem", { name: "重置" }));

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "image")).toMatchObject({
        x: 80,
        y: 60,
        width: 200,
        height: 100,
      });
      expect(readRenderedScene().nodes.find((node) => node.id === "image")).not.toHaveProperty("imageCrop");
      expect(screen.queryByTestId("sketch-image-crop-overlay")).toBeNull();
    });
  });

  it("pans image content inside a fixed crop frame and preserves blank regions", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{
        id: "image",
        type: "image",
        x: 80,
        y: 60,
        width: 200,
        height: 100,
        src: "data:image/png;base64,abc",
        style: { imageFit: "contain", stroke: "#111827", strokeWidth: 2 },
      }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={imageScene} />);
    clickLayerNode("image");
    fireEvent.click(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" }).querySelector('[aria-label="悬浮裁剪图片"]') as HTMLElement);
    fireEvent.click(within(screen.getByRole("menu", { name: "裁剪图片" })).getByRole("menuitem", { name: "矩形裁剪" }));

    await waitFor(() => expect(screen.getByTestId("sketch-image-crop-overlay")).toBeTruthy());
    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const eastHandle = screen.getByTestId("sketch-resize-handle-e");
    dispatchPointerEvent(eastHandle, "pointerdown", 280, 110);
    dispatchPointerEvent(stage, "pointermove", 230, 110);
    dispatchPointerEvent(stage, "pointerup", 230, 110);
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "image")).toMatchObject({ width: 150, height: 100 }));

    // Dragging inside the crop frame moves only the source content.
    dispatchPointerEvent(stage, "pointerdown", 150, 100);
    dispatchPointerEvent(stage, "pointermove", 150, 140);
    dispatchPointerEvent(stage, "pointerup", 150, 140);
    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "image");
      expect(node).toMatchObject({
        x: 80,
        y: 60,
        width: 150,
        height: 100,
        imageCrop: { sourceRect: { x: 0, y: -0.4, width: 0.75, height: 1 } },
      });
      expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("y")).toBe("100");
      expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("clip-path")).toBeNull();
      expect(screen.getByTestId("sketch-image-crop-overlay").querySelector('mask rect[fill="white"]')?.getAttribute("y")).toBe("100");
    });

    // The part of the translated image outside the crop node remains draggable.
    dispatchPointerEvent(stage, "pointerdown", 260, 120);
    dispatchPointerEvent(stage, "pointermove", 260, 130);
    dispatchPointerEvent(stage, "pointerup", 260, 130);
    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "image");
      expect(node).toMatchObject({ x: 80, y: 60, width: 150, height: 100 });
      expect(node?.imageCrop?.sourceRect).toMatchObject({ x: 0, y: -0.5, width: 0.75, height: 1 });
      expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("y")).toBe("110");
      expect(screen.getByTestId("sketch-image-crop-overlay").querySelector('mask rect[fill="white"]')?.getAttribute("y")).toBe("110");
    });

    // Resizing after a pan keeps the translated content position while only changing the crop frame.
    const resizedEastHandle = screen.getByTestId("sketch-resize-handle-e");
    dispatchPointerEvent(resizedEastHandle, "pointerdown", 230, 110);
    dispatchPointerEvent(stage, "pointermove", 210, 110);
    dispatchPointerEvent(stage, "pointerup", 210, 110);
    await waitFor(() => {
      const node = readRenderedScene().nodes.find((item) => item.id === "image");
      expect(node).toMatchObject({ x: 80, y: 60, width: 130, height: 100 });
      expect(node?.imageCrop?.sourceRect).toMatchObject({ x: 0, y: -0.5, width: 0.65, height: 1 });
      expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("y")).toBe("110");
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("sketch-image-crop-overlay")).toBeNull());
    expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("clip-path")).toContain("sketch-image-crop-image");
    expect(document.querySelector('image[data-sketch-node-id="image"]')?.getAttribute("y")).toBe("110");
  });

  it("records a continuous crop pan as one undo checkpoint", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "image", type: "image", x: 80, y: 60, width: 200, height: 100, src: "data:image/png;base64,abc" }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={imageScene} />);
    clickLayerNode("image");
    fireEvent.click(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" }).querySelector('[aria-label="悬浮裁剪图片"]') as HTMLElement);
    fireEvent.click(within(screen.getByRole("menu", { name: "裁剪图片" })).getByRole("menuitem", { name: "矩形裁剪" }));
    await waitFor(() => expect(screen.getByTestId("sketch-image-crop-overlay")).toBeTruthy());

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    dispatchPointerEvent(stage, "pointerdown", 150, 100);
    dispatchPointerEvent(stage, "pointermove", 150, 110);
    dispatchPointerEvent(stage, "pointermove", 150, 120);
    dispatchPointerEvent(stage, "pointerup", 150, 120);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "image")?.imageCrop?.sourceRect.y).toBe(-0.2));

    const undoButton = screen.getAllByRole("button", { name: "撤销" }).find((button) => !(button as HTMLButtonElement).disabled);
    expect(undoButton).toBeTruthy();
    fireEvent.click(undoButton as HTMLButtonElement);
    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "image")).toMatchObject({
        x: 80,
        y: 60,
        width: 200,
        height: 100,
      });
      expect(readRenderedScene().nodes.find((node) => node.id === "image")).not.toHaveProperty("imageCrop");
    });
  });

  it("adds a 0–20px stroke width slider for images while keeping exact input", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "image", type: "image", x: 40, y: 50, width: 120, height: 80, src: "data:image/png;base64,abc" }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={imageScene} />);
    clickLayerNode("image");

    const propertySlider = screen.getByLabelText("描边宽度") as HTMLInputElement;
    const strokeWidthControl = propertySlider.closest('[data-testid="sketch-stroke-width-control"]') as HTMLElement;
    expect(strokeWidthControl.className).toContain("bg-white");
    expect(strokeWidthControl.className).toContain("border-slate-200");
    expect(strokeWidthControl.className).toContain("text-slate-700");
    expect(within(strokeWidthControl).getByText("描边宽度").className).toContain("text-xs");
    expect(within(strokeWidthControl).getByText("描边宽度").className).not.toContain("font-semibold");
    expect(propertySlider.className).toContain("appearance-none");
    expect(propertySlider.style.colorScheme).toBe("light");
    expect(strokeWidthControl.querySelector('[data-testid="sketch-stroke-width-track"]')).toBeTruthy();
    expect(propertySlider.min).toBe("0");
    expect(propertySlider.max).toBe("20");
    expect(propertySlider.step).toBe("1");
    fireEvent.change(propertySlider, { target: { value: "8" } });
    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "image")?.style?.strokeWidth).toBe(8);
      expect((strokeWidthControl.querySelector('[data-testid="sketch-stroke-width-fill"]') as HTMLElement).style.width).toBe("40%");
    });

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    fireEvent.click(within(toolbar).getByLabelText("悬浮描边"));
    const floatingSlider = screen.getAllByLabelText("描边宽度").find((element) => element.closest('[role="menu"]')) as HTMLInputElement;
    expect(floatingSlider).toBeTruthy();
    expect(floatingSlider.closest('[role="menu"]')?.className).toContain("gap-2");
    fireEvent.change(floatingSlider, { target: { value: "12" } });
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "image")?.style?.strokeWidth).toBe(12));
  });

  it("replaces an image by dropping a file over it while preserving position style bindings and layer order", async () => {
    const imageScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "behind", type: "rect", x: 10, y: 10, width: 40, height: 40 },
        {
          id: "image",
          type: "image",
          x: 60,
          y: 50,
          width: 120,
          height: 80,
          src: "data:image/png;base64,old",
          alt: "Old image",
          style: { radius: 10, imageFit: "cover" },
          bindings: { text: "heroLabel" },
        },
        { id: "front", type: "rect", x: 220, y: 10, width: 40, height: 40 },
      ],
    };
    render(<ControlledEditor initialScene={imageScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const imageNode = document.querySelector('[data-sketch-node-id="image"]');
    expect(imageNode).not.toBeNull();

    fireEvent.drop(imageNode as Element, {
      clientX: 80,
      clientY: 70,
      dataTransfer: { files: [new File(["replacement"], "replacement.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.map((node) => node.id)).toEqual(["behind", "image", "front"]);
      const image = parsed.nodes.find((node) => node.id === "image");
      expect(image).toMatchObject({
        x: 60,
        y: 50,
        width: 240,
        height: 135,
        alt: "replacement.png",
        style: { radius: 10, imageFit: "cover" },
        bindings: { text: "heroLabel" },
      });
      expect(image?.src).toContain("data:image/png;base64");
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
      expect((screen.getByRole("button", { name: "填充选择器" }) as HTMLButtonElement).disabled).toBe(true);
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

  it("treats semantic groups as layer units in layer order commands", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "outside", type: "rect", x: 20, y: 30, width: 40, height: 40, zIndex: 0 },
        { id: "card", type: "card", x: 80, y: 60, width: 120, height: 70, text: "Card", zIndex: 1 },
        { id: "accent", type: "rect", x: 100, y: 80, width: 40, height: 30, zIndex: 2 },
        { id: "group", type: "group", x: 80, y: 60, width: 120, height: 70, visible: false, children: ["card", "accent"], zIndex: 3 },
        { id: "top", type: "button", x: 240, y: 60, width: 100, height: 42, text: "Top", zIndex: 4 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    fireEvent.click(screen.getByTitle("分组"));
    const menu = openCanvasContextMenu();
    expect((within(menu).getByRole("menuitem", { name: "复制" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole("menuitem", { name: "删除" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole("menuitem", { name: "置顶" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole("menuitem", { name: "置底" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "上移一层" }));

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.map((node) => node.id)).toEqual(["outside", "top", "card", "accent", "group"]);
      expect(parsed.nodes.find((node) => node.id === "card")?.zIndex).toBeLessThan(parsed.nodes.find((node) => node.id === "accent")?.zIndex ?? -1);
      expect(parsed.nodes.find((node) => node.id === "accent")?.zIndex).toBeLessThan(parsed.nodes.find((node) => node.id === "group")?.zIndex ?? -1);
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

  it("runs layout and arrange commands from the property panel", async () => {
    const arrangeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "a", type: "rect", x: 20, y: 30, width: 20, height: 20 },
        { id: "b", type: "rect", x: 90, y: 70, width: 20, height: 20 },
        { id: "c", type: "rect", x: 220, y: 110, width: 20, height: 20 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={arrangeScene} />);

    clickLayerNode("a");
    clickLayerNode("b", { shiftKey: true });
    clickLayerNode("c", { shiftKey: true });

    const arrangeSection = screen.getByText("Layout/Arrange").closest("details");
    expect(arrangeSection).not.toBeNull();
    const arrangeControls = within(arrangeSection as HTMLElement);
    fireEvent.click(arrangeControls.getByRole("button", { name: "水平分布" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "b")?.x).toBe(120);
    });

    fireEvent.click(arrangeControls.getByRole("button", { name: "左对齐" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "a")?.x).toBe(20);
      expect(parsed.nodes.find((node) => node.id === "b")?.x).toBe(20);
      expect(parsed.nodes.find((node) => node.id === "c")?.x).toBe(20);
    });

    fireEvent.click(arrangeControls.getByRole("button", { name: "成组" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      const group = parsed.nodes.find((node) => node.type === "group");
      expect(group?.children).toEqual(["a", "b", "c"]);
    });
  });

  it("shows property sections, color swatches, reset, and export controls", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");

    expect(screen.getByText("Position")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();
    expect(screen.getByText("Text")).toBeTruthy();
    expect(screen.getByText("Export")).toBeTruthy();
    expect(screen.getByLabelText("快捷锁定")).toBeTruthy();
    expect(screen.getByText("导出整页")).toBeTruthy();
    expect(screen.getByText("选区尺寸：80 x 40")).toBeTruthy();
    expect(screen.getByText("PNG 输出：400 x 300 px，透明背景")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("导出倍率"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText("导出带背景"));
    expect(screen.getByText("PNG 输出：800 x 600 px，带白色背景")).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制 PNG" }).hasAttribute("disabled")).toBe(false);
    const rotationScrubber = screen.getByLabelText("旋转拖拽调整");
    expect(rotationScrubber.textContent).toBe("R");
    expect(rotationScrubber.getAttribute("title")).toContain("旋转");

    const fillPicker = getSharedColorPickerContainer("填充");
    clickSharedPreset(fillPicker, "填充", "#ef4444");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({
        style: { fill: "#ef4444" },
      });
    });

    const fillDialog = getColorPickerDialog(fillPicker, "填充");
    expect(within(fillDialog).getByRole("list", { name: "预设颜色" })).toBeTruthy();
    expect(within(fillDialog).getByRole("button", { name: "选择预设颜色：填充 最近 #EF4444" })).toBeTruthy();
    expect(screen.getByTestId("scene-json").textContent).not.toContain("recentColors");

    fireEvent.click(getPresetColorButton(fillDialog, "#3B82F6"));
    expect(within(fillDialog).getByRole("button", { name: "选择预设颜色：填充 最近 #3B82F6" })).toBeTruthy();
    fireEvent.click(within(fillDialog).getByRole("button", { name: "选择预设颜色：填充 最近 #EF4444" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({
        style: { fill: "#ef4444" },
      });
      expect(screen.getByTestId("scene-json").textContent).not.toContain("recentColors");
    });

    fireEvent.click(within(fillDialog).getByRole("button", { name: "清除" }));
    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.style?.fill).toBe("transparent");
    });
    expect(screen.queryByRole("button", { name: "文字颜色选择器" })).not.toBeNull();

    fireEvent.click(screen.getByTitle("重置填充"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.fill).toBeUndefined();
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.stroke).toBe("#111827");
    });

    fireEvent.change(screen.getByLabelText("字号"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("字重"), { target: { value: "700" } });
    fireEvent.click(screen.getByTitle("重置字号"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.fontSize).toBeUndefined();
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.fontWeight).toBe(700);
    });

    fireEvent.click(screen.getByLabelText("重置外观"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.stroke).toBeUndefined();
    });
  });

  it("shows a download fallback status when SVG clipboard copy is blocked", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40 },
      ],
    };
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:sketch-export") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    try {
      render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);
      clickLayerNode("rect");
      const originalSceneJson = screen.getByTestId("scene-json").textContent;

      fireEvent.click(screen.getByRole("button", { name: "复制 SVG" }));

      expect(await screen.findByText("剪贴板不可用，已下载 SVG")).toBeTruthy();
      expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
      expect(linkClick).toHaveBeenCalledTimes(1);
    } finally {
      linkClick.mockRestore();
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    }
  });

  it("merges continuous property panel numeric input into one undo step", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");
    const xInput = screen.getByLabelText("X");
    fireEvent.change(xInput, { target: { value: "30" } });
    fireEvent.change(xInput, { target: { value: "40" } });
    fireEvent.blur(xInput);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.x).toBe(40);
    });

    fireEvent.click(screen.getByLabelText("撤销"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.x).toBe(20);
    });

    fireEvent.click(screen.getByLabelText("重做"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.x).toBe(40);
    });
  });

  it("supports numeric expressions, keyboard nudging, scrubber drag, and size ratio lock", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");
    fireEvent.click(screen.getByLabelText("开启尺寸比例锁定"));
    fireEvent.change(screen.getByLabelText("W"), { target: { value: "+20" } });
    fireEvent.keyDown(screen.getByLabelText("W"), { key: "Enter" });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")).toMatchObject({
        width: 100,
        height: 50,
      });
    });

    fireEvent.keyDown(screen.getByLabelText("X"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByLabelText("X"), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText("X"), { key: "ArrowDown", altKey: true });

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.x).toBe(30.9);
    });

    fireEvent.mouseDown(screen.getByLabelText("Y拖拽调整"), { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 16 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.y).toBe(34);
    });
  });

  it("keeps key property controls accessible by aria label and keyboard behavior", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");

    for (const label of ["名称", "锁定", "可见", "X", "Y", "W", "H", "旋转", "填充", "描边", "导出倍率"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    const xInput = screen.getByLabelText("X");
    fireEvent.keyDown(xInput, { key: "ArrowUp" });

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "rect")?.x).toBe(21);
    });

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Accessible rect" } });
    fireEvent.keyDown(screen.getByLabelText("名称"), { key: "Enter" });

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.name).toBe("Accessible rect");
    });
  });

  it("shows a single-selection shape toolbar without a separate text action", async () => {
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "rect", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(within(toolbar).getByLabelText("悬浮填充")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮描边")).toBeTruthy();
    expect(within(toolbar).queryByLabelText("悬浮文本")).toBeNull();
    expect(within(toolbar).getByLabelText("悬浮层级")).toBeTruthy();
    expect(within(toolbar).queryByLabelText("悬浮复制样式")).toBeNull();
    expect(within(toolbar).queryByLabelText("悬浮属性")).toBeNull();
    expect(within(toolbar).getByLabelText("悬浮更多")).toBeTruthy();
    expect(within(toolbar).getByTestId("sketch-floating-fill-indicator")).toBeTruthy();
    expect(within(toolbar).getByTestId("sketch-floating-stroke-indicator")).toBeTruthy();
    for (const label of ["填充", "描边", "文本", "层级", "更多"]) {
      expect(within(toolbar).queryByText(label, { exact: true })).toBeNull();
    }
    for (const button of Array.from(within(toolbar).getAllByRole("button"))) {
      expect(button.getAttribute("title")).toBeNull();
    }

    fireEvent.click(within(toolbar).getByLabelText("悬浮填充"));
    expect(await screen.findByRole("dialog", { name: "草图工具菜单" })).toBeTruthy();
    fireEvent.click(within(toolbar).getByLabelText("悬浮填充"));
    await waitFor(() => expect(screen.queryByRole("menu", { name: "填充" })).toBeNull());
    fireEvent.click(within(toolbar).getByLabelText("悬浮填充"));
    const fillMenu = screen.getByRole("menu", { name: "填充" });
    clickSharedPreset(fillMenu, "填充", "#fafafa");

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "rect")?.style?.fill).toBe("#fafafa");
    });

    fireEvent.doubleClick(getSketchNodeElement("rect"));
    expect(await screen.findByLabelText("画布文本编辑")).toBeTruthy();
    expect(await screen.findByRole("toolbar", { name: "图文工具栏" })).toBeTruthy();
  });

  it("shows combined shape and text controls for a shape with text", async () => {
    const textShapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{
        id: "rect",
        type: "rect",
        x: 20,
        y: 30,
        width: 120,
        height: 60,
        text: "Shape label",
        style: { fill: "#ffffff", stroke: "#111827", color: "#123456", fontSize: 20 },
      }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={textShapeScene} />);

    clickLayerNode("rect");

    const toolbar = await screen.findByRole("toolbar", { name: "图文工具栏" });
    expect(within(toolbar).getByLabelText("悬浮填充")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮描边")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮文字颜色")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮字号")).toHaveProperty("value", "20");
    expect(within(toolbar).getByLabelText("悬浮加粗")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮斜体")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮下划线")).toBeTruthy();
    expect(within(toolbar).getByLabelText("对齐方式")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮层级")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮更多")).toBeTruthy();
    expect(within(toolbar).queryByLabelText("悬浮文本")).toBeNull();
    expect(within(toolbar).getByTestId("sketch-text-color-indicator")).toBeTruthy();
    expect(within(toolbar).getByTestId("sketch-text-color-underline")).toHaveProperty("style.backgroundColor", "rgb(18, 52, 86)");

    const buttonLabels = Array.from(within(toolbar).getAllByRole("button"), (button) => button.getAttribute("aria-label"));
    expect(buttonLabels).toEqual([
      "悬浮填充",
      "悬浮描边",
      "悬浮文字颜色",
      "打开字号选项",
      "悬浮加粗",
      "悬浮斜体",
      "悬浮下划线",
      "对齐方式",
      "悬浮层级",
      "悬浮更多",
    ]);

    fireEvent.click(within(toolbar).getByLabelText("悬浮文字颜色"));
    clickSharedPreset(screen.getByRole("menu", { name: "文字颜色" }), "文字颜色", "#ef4444");
    fireEvent.click(within(toolbar).getByLabelText("悬浮加粗"));
    fireEvent.click(within(toolbar).getByLabelText("悬浮斜体"));
    fireEvent.click(within(toolbar).getByLabelText("悬浮下划线"));
    fireEvent.click(within(toolbar).getByLabelText("对齐方式"));
    fireEvent.click(within(screen.getByRole("menu", { name: "对齐方式" })).getByLabelText("对齐方式 居中对齐"));

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")).toMatchObject({
        width: 120,
        height: 60,
        style: {
          color: "#ef4444",
          fontWeight: 700,
          italic: true,
          textDecoration: "underline",
          textAlign: "center",
        },
      });
    });
  });

  it("shows the full text toolbar while editing an empty shape and commits draft styles", async () => {
    const emptyTextShapeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{
        id: "rect",
        type: "rect",
        x: 20,
        y: 30,
        width: 120,
        height: 60,
        style: { fill: "#ffffff", stroke: "#111827" },
      }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={emptyTextShapeScene} />);

    fireEvent.doubleClick(getSketchNodeElement("rect"));
    const editor = await screen.findByLabelText("画布文本编辑") as HTMLTextAreaElement;
    const toolbar = await screen.findByRole("toolbar", { name: "图文工具栏" });
    expect(within(toolbar).getByLabelText("悬浮文字颜色")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮字号")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮加粗")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮斜体")).toBeTruthy();
    expect(within(toolbar).getByLabelText("悬浮下划线")).toBeTruthy();
    expect(within(toolbar).getByLabelText("对齐方式")).toBeTruthy();

    fireEvent.click(within(toolbar).getByLabelText("悬浮加粗"));
    fireEvent.click(within(toolbar).getByLabelText("悬浮文字颜色"));
    clickSharedPreset(screen.getByRole("menu", { name: "文字颜色" }), "文字颜色", "#2563eb");
    fireEvent.change(editor, { target: { value: "Styled shape" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      expect(readRenderedScene().nodes.find((node) => node.id === "rect")).toMatchObject({
        text: "Styled shape",
        style: { color: "#2563eb", fontWeight: 700 },
      });
    });
  });

  it("supports no-color, layer order, and the compact more menu", async () => {
    const menuScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "back", type: "rect", x: 20, y: 30, width: 80, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "front", type: "ellipse", x: 140, y: 50, width: 80, height: 60, style: { fill: "#ef4444", stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={menuScene} />);
    clickLayerNode("front");
    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    const fillIndicator = within(toolbar).getByTestId("sketch-floating-fill-indicator");
    expect(fillIndicator.className).toContain("h-4");
    expect(fillIndicator.className).toContain("w-4");

    fireEvent.click(within(toolbar).getByLabelText("悬浮填充"));
    const fillMenu = screen.getByRole("menu", { name: "填充" });
    const fillDialog = getColorPickerDialog(fillMenu, "填充");
    expect(within(fillDialog).getByRole("button", { name: "清除" })).toBeTruthy();
    fireEvent.click(within(fillDialog).getByRole("button", { name: "清除" }));
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "front")?.style?.fill).toBe("transparent"));
    expect(within(toolbar).getByTestId("sketch-floating-fill-indicator").className).toContain("bg-white");

    fireEvent.click(within(toolbar).getByLabelText("悬浮描边"));
    const strokeMenu = screen.getByRole("menu", { name: "描边" });
    const strokeDialog = getColorPickerDialog(strokeMenu, "描边");
    expect(within(strokeDialog).getByRole("button", { name: "清除" })).toBeTruthy();
    const strokeIndicator = within(toolbar).getByTestId("sketch-floating-stroke-indicator");
    const strokeIcon = strokeIndicator.querySelector("svg");
    expect(strokeIcon).toBeTruthy();
    expect(strokeIcon?.getAttribute("stroke")).toBe("currentColor");
    expect(strokeIcon?.style.color).toBe("rgb(17, 24, 39)");
    fireEvent.click(within(strokeDialog).getByRole("button", { name: "清除" }));
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "front")?.style?.stroke).toBe("transparent"));
    const noStrokeIcon = within(toolbar).getByTestId("sketch-floating-stroke-indicator").querySelector("svg");
    expect(noStrokeIcon?.style.color).toBe("rgb(203, 213, 225)");

    fireEvent.click(within(toolbar).getByLabelText("悬浮层级"));
    const layerMenu = screen.getByRole("menu", { name: "层级" });
    expect(within(layerMenu).getByRole("menuitem", { name: /置顶/ })).toBeTruthy();
    expect(within(layerMenu).getByRole("menuitem", { name: /上移一层/ })).toBeTruthy();
    expect(within(layerMenu).getByRole("menuitem", { name: /下移一层/ })).toBeTruthy();
    expect(within(layerMenu).getByRole("menuitem", { name: /置底/ })).toBeTruthy();
    fireEvent.click(within(layerMenu).getByRole("menuitem", { name: /置顶/ }));
    await waitFor(() => expect(readRenderedScene().nodes.at(-1)?.id).toBe("front"));

    const moreTrigger = within(toolbar).getByLabelText("悬浮更多") as HTMLButtonElement;
    moreTrigger.getBoundingClientRect = () => ({
      left: 180,
      top: 40,
      width: 60,
      height: 36,
      right: 240,
      bottom: 76,
      x: 180,
      y: 40,
      toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.click(moreTrigger);
    const moreMenu = screen.getByRole("menu", { name: "更多操作" });
    const moreDialog = screen.getByRole("dialog", { name: "草图工具菜单" });
    await waitFor(() => expect(moreDialog.style.left).toBe("108px"));
    expect(moreDialog.className).toContain("w-max");
    for (const label of ["删除", "剪切", "复制", "复制样式", "粘贴样式", "位置与大小"]) {
      const pattern = label === "复制" ? /^复制 ⌘ C$/ : new RegExp(label);
      expect(within(moreMenu).getByRole("menuitem", { name: pattern })).toBeTruthy();
    }
    expect(within(moreMenu).queryByText("副本")).toBeNull();
    expect(within(moreMenu).queryByText("图层管理")).toBeNull();
    expect(within(moreMenu).queryByText("属性与导出")).toBeNull();
    expect((within(moreMenu).getByRole("menuitem", { name: /粘贴样式/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(moreMenu).getByRole("menuitem", { name: /位置与大小/ }));
    expect(screen.getByLabelText("水平位置")).toBeTruthy();
    expect(screen.getByLabelText("垂直位置")).toBeTruthy();
    expect(screen.getByLabelText("宽度")).toBeTruthy();
    expect(screen.getByLabelText("高度")).toBeTruthy();
    for (const label of ["水平位置", "垂直位置", "宽度", "高度"]) {
      expect(screen.getByLabelText(label).parentElement?.className).toContain("grid-cols-[3rem_minmax(0,1fr)]");
    }
    expect(screen.queryByText("关闭")).toBeNull();
    fireEvent.change(screen.getByLabelText("水平位置"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("高度"), { target: { value: "72" } });
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "front")).toMatchObject({ x: 180, height: 72 }));
  });

  it("shows the main toolbar tooltip after 200ms hover or focus without a native title", async () => {
    vi.useFakeTimers();
    try {
      render(<ControlledPartsEditorWithToolbarAndProperties initialScene={scene} />);

      const selectButton = screen.getByRole("button", { name: /^选择$/ });
      expect(selectButton.getAttribute("title")).toBeNull();

      fireEvent.mouseEnter(selectButton.parentElement as HTMLElement);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(199);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      const hoverTooltip = screen.getByRole("tooltip");
      expect(hoverTooltip.textContent).toBe("选择");
      expect(hoverTooltip.parentElement).toBe(document.body);
      expect(hoverTooltip.className).not.toContain("after:");

      fireEvent.mouseLeave(selectButton.parentElement as HTMLElement);
      expect(screen.queryByRole("tooltip")).toBeNull();

      fireEvent.focus(selectButton);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(screen.getByRole("tooltip").textContent).toBe("选择");
      fireEvent.blur(selectButton);
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the multi-selection floating toolbar matrix and moves distribution into more", async () => {
    const arrangeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "a", type: "rect", x: 20, y: 30, width: 20, height: 20 },
        { id: "b", type: "rect", x: 90, y: 70, width: 20, height: 20 },
        { id: "c", type: "rect", x: 220, y: 110, width: 20, height: 20 },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={arrangeScene} />);

    clickLayerNode("a");
    clickLayerNode("b", { shiftKey: true });
    clickLayerNode("c", { shiftKey: true });

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    const toolbarButtonLabels = Array.from(
      within(toolbar).getAllByRole("button"),
      (button) => button.getAttribute("aria-label"),
    );
    expect(toolbarButtonLabels).toEqual([
      "悬浮边框",
      "悬浮颜色",
      "悬浮对齐方式",
      "悬浮组合",
      "悬浮图层",
      "悬浮更多",
    ]);
    expect(within(toolbar).queryByLabelText("悬浮水平分布")).toBeNull();
    expect(within(toolbar).queryByLabelText("悬浮复制")).toBeNull();
    expect(within(toolbar).queryByLabelText("悬浮删除")).toBeNull();
    expect(within(toolbar).getByLabelText("悬浮组合").querySelector('[data-sketch-icon="group"]')).not.toBeNull();
    expect(within(toolbar).getByLabelText("悬浮组合").querySelector('[data-sketch-icon="ungroup"]')).toBeNull();

    fireEvent.click(within(toolbar).getByLabelText("悬浮对齐方式"));
    const alignmentMenu = screen.getByRole("menu", { name: "对齐方式" });
    expect(alignmentMenu.className).toContain("rounded-lg");
    expect(alignmentMenu.className).toContain("p-1");
    expect(alignmentMenu.className).not.toContain("rounded-2xl");
    expect(alignmentMenu.className).not.toContain("p-2");
    for (const button of alignmentMenu.querySelectorAll<HTMLButtonElement>("[data-sketch-alignment]")) {
      expect(button.className).toContain("h-8");
      expect(button.className).toContain("w-8");
      expect(button.querySelector("svg")?.getAttribute("class")).toContain("h-3.5");
      expect(button.querySelector("svg")?.getAttribute("class")).toContain("w-3.5");
    }
    expect(Array.from(alignmentMenu.querySelectorAll<HTMLElement>("[data-sketch-alignment]"), (element) => element.getAttribute("data-sketch-alignment"))).toEqual([
      "left",
      "center",
      "right",
      "top",
      "middle",
      "bottom",
    ]);
    expect(document.activeElement?.getAttribute("data-sketch-alignment")).toBe("left");
    fireEvent.keyDown(alignmentMenu, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-sketch-alignment")).toBe("center");
    fireEvent.keyDown(alignmentMenu, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "对齐方式" })).toBeNull();

    fireEvent.click(within(toolbar).getByLabelText("悬浮更多"));
    const moreMenu = screen.getByRole("menu", { name: "更多操作" });
    expect(within(moreMenu).getByRole("menuitem", { name: /^删除/ }).className).toContain("h-8");
    expect(within(moreMenu).getByRole("menuitem", { name: "水平分布" })).toBeTruthy();
    expect(within(moreMenu).getByRole("menuitem", { name: "垂直分布" })).toBeTruthy();
    fireEvent.click(within(moreMenu).getByRole("menuitem", { name: "水平分布" }));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.id === "b")?.x).toBe(120);
    });

    fireEvent.click(within(toolbar).getByLabelText("悬浮组合"));

    await waitFor(() => {
      const parsed = JSON.parse(screen.getByTestId("scene-json").textContent ?? "{}") as SketchSceneDocument;
      expect(parsed.nodes.find((node) => node.type === "group")?.children).toEqual(["a", "b", "c"]);
    });
    const groupedToolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(within(groupedToolbar).getByLabelText("悬浮解组").querySelector('[data-sketch-icon="ungroup"]')).not.toBeNull();
    expect(within(groupedToolbar).getByLabelText("悬浮解组").querySelector('[data-sketch-icon="group"]')).toBeNull();
  });

  it("batch-edits mixed graphic and pure-text selections without changing text styles", async () => {
    const mixedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "left", type: "rect", x: 20, y: 30, width: 60, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "right", type: "ellipse", x: 120, y: 80, width: 70, height: 50, style: { fill: "#ef4444", stroke: "#2563eb" } },
        { id: "label", type: "text", x: 240, y: 120, width: 100, height: 30, text: "Label", style: { color: "#123456" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={mixedScene} />);

    clickLayerNode("left");
    clickLayerNode("right", { shiftKey: true });
    clickLayerNode("label", { shiftKey: true });

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(Array.from(within(toolbar).getAllByRole("button"), (button) => button.getAttribute("aria-label"))).toEqual([
      "悬浮边框",
      "悬浮颜色",
      "悬浮对齐方式",
      "悬浮组合",
      "悬浮图层",
      "悬浮更多",
    ]);
    expect(within(toolbar).getByTestId("sketch-floating-fill-indicator").querySelector("span")).toBeTruthy();

    fireEvent.click(within(toolbar).getByLabelText("悬浮颜色"));
    const colorMenu = screen.getByRole("menu", { name: "颜色" });
    expect(within(colorMenu).getByText("当前选区颜色不同")).toBeTruthy();
    clickSharedPreset(colorMenu, "颜色", "#2563eb");

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "left")?.style?.fill).toBe("#2563eb");
      expect(parsed.nodes.find((node) => node.id === "right")?.style?.fill).toBe("#2563eb");
      expect(parsed.nodes.find((node) => node.id === "label")?.style).toMatchObject({ color: "#123456" });
      expect(parsed.nodes.find((node) => node.id === "label")?.style?.fill).toBeUndefined();
    });

    fireEvent.click(within(toolbar).getByLabelText("悬浮边框"));
    const strokeMenu = screen.getByRole("menu", { name: "边框" });
    clickSharedPreset(strokeMenu, "边框", "#dc2626");

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "left")?.style?.stroke).toBe("#dc2626");
      expect(parsed.nodes.find((node) => node.id === "right")?.style?.stroke).toBe("#dc2626");
      expect(parsed.nodes.find((node) => node.id === "label")?.style).toMatchObject({ color: "#123456" });
      expect(parsed.nodes.find((node) => node.id === "label")?.style?.stroke).toBeUndefined();
    });
  });

  it("skips unsupported fill targets while keeping the border action available", async () => {
    const capabilityScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "shape", type: "rect", x: 20, y: 30, width: 60, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "line", type: "line", x: 100, y: 40, width: 80, height: 30, style: { stroke: "#111827" } },
        { id: "path", type: "path", x: 200, y: 40, width: 80, height: 30, path: "M 200 40 L 280 70", style: { stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={capabilityScene} />);

    clickLayerNode("shape");
    clickLayerNode("line", { shiftKey: true });
    clickLayerNode("path", { shiftKey: true });
    let toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect((within(toolbar).getByLabelText("悬浮颜色") as HTMLButtonElement).disabled).toBe(false);
    expect((within(toolbar).getByLabelText("悬浮边框") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(within(toolbar).getByLabelText("悬浮颜色"));
    clickSharedPreset(screen.getByRole("menu", { name: "颜色" }), "颜色", "#f59e0b");
    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "shape")?.style?.fill).toBe("#f59e0b");
      expect(parsed.nodes.find((node) => node.id === "line")?.style?.fill).toBeUndefined();
      expect(parsed.nodes.find((node) => node.id === "path")?.style?.fill).toBeUndefined();
    });

    clickLayerNode("shape", { shiftKey: true });
    toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect((within(toolbar).getByLabelText("悬浮颜色") as HTMLButtonElement).disabled).toBe(true);
    expect((within(toolbar).getByLabelText("悬浮边框") as HTMLButtonElement).disabled).toBe(false);
  });

  it("applies all six alignment axes and closes the menu from Escape or outside pointer down", async () => {
    const alignmentCases: Array<{ axis: string; label: string; expected: Record<string, number> }> = [
      { axis: "left", label: "左对齐", expected: { a: 20, b: 20, c: 20 } },
      { axis: "center", label: "水平居中", expected: { a: 125, b: 115, c: 120 } },
      { axis: "right", label: "右对齐", expected: { a: 230, b: 210, c: 220 } },
      { axis: "top", label: "顶对齐", expected: { a: 30, b: 30, c: 30 } },
      { axis: "middle", label: "垂直居中", expected: { a: 80, b: 75, c: 70 } },
      { axis: "bottom", label: "底对齐", expected: { a: 130, b: 120, c: 110 } },
    ];

    for (const alignmentCase of alignmentCases) {
      const alignmentScene: SketchSceneDocument = {
        version: 1,
        pageSize: { width: 400, height: 300 },
        nodes: [
          { id: "a", type: "rect", x: 20, y: 30, width: 20, height: 20 },
          { id: "b", type: "rect", x: 90, y: 70, width: 40, height: 30 },
          { id: "c", type: "rect", x: 220, y: 110, width: 30, height: 40 },
        ],
      };
      render(<ControlledPartsEditorWithToolbar initialScene={alignmentScene} />);
      clickLayerNode("a");
      clickLayerNode("b", { shiftKey: true });
      clickLayerNode("c", { shiftKey: true });
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      fireEvent.click(within(toolbar).getByLabelText("悬浮对齐方式"));
      const menu = screen.getByRole("menu", { name: "对齐方式" });
      fireEvent.click(within(menu).getByLabelText(alignmentCase.label));

      await waitFor(() => {
        const parsed = readRenderedScene();
        const a = parsed.nodes.find((node) => node.id === "a");
        const b = parsed.nodes.find((node) => node.id === "b");
        const c = parsed.nodes.find((node) => node.id === "c");
        const values = alignmentCase.axis === "left" || alignmentCase.axis === "center" || alignmentCase.axis === "right"
          ? { a: a?.x, b: b?.x, c: c?.x }
          : { a: a?.y, b: b?.y, c: c?.y };
        expect(values).toEqual(alignmentCase.expected);
      });
      expect(screen.queryByRole("menu", { name: "对齐方式" })).toBeNull();
      cleanup();
    }

    const closeScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "a", type: "rect", x: 20, y: 30, width: 40, height: 40 },
        { id: "b", type: "rect", x: 100, y: 80, width: 40, height: 40 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={closeScene} />);
    clickLayerNode("a");
    clickLayerNode("b", { shiftKey: true });
    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    fireEvent.click(within(toolbar).getByLabelText("悬浮对齐方式"));
    expect(screen.getByRole("menu", { name: "对齐方式" })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "对齐方式" })).toBeNull();
    fireEvent.click(within(toolbar).getByLabelText("悬浮对齐方式"));
    fireEvent.keyDown(screen.getByRole("menu", { name: "对齐方式" }), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "对齐方式" })).toBeNull();
  });

  it("renders group bounds and keeps group selection on an ordinary child click before drilling", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["rect", "line"] },
        { id: "rect", type: "rect", x: 50, y: 40, width: 60, height: 40, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "line", type: "line", x: 150, y: 100, width: 100, height: 20, style: { stroke: "#111827" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={groupedScene} />);

    clickLayerNode("group");
    const groupToolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(Array.from(within(groupToolbar).getAllByRole("button"), (button) => button.getAttribute("aria-label"))).toEqual([
      "悬浮边框",
      "悬浮颜色",
      "悬浮解组",
      "悬浮图层",
      "悬浮更多",
    ]);
    expect(screen.getByTestId("sketch-selection-box")).toMatchObject({
      style: expect.objectContaining({ left: "50px", top: "40px", width: "200px", height: "80px" }),
    });
    expect(screen.queryByTestId("sketch-resize-handle")).toBeNull();
    expect(screen.queryByTestId("sketch-rotate-handle")).toBeNull();

    fireEvent.click(within(groupToolbar).getByLabelText("悬浮颜色"));
    clickSharedPreset(screen.getByRole("menu", { name: "颜色" }), "颜色", "#2563eb");
    await waitFor(() => expect(readRenderedScene().nodes.find((node) => node.id === "rect")?.style?.fill).toBe("#2563eb"));

    fireEvent.pointerDown(getSketchNodeElement("rect"), { button: 0, clientX: 80, clientY: 60 });
    fireEvent.pointerUp(getCanvasStage(), { button: 0, clientX: 80, clientY: 60 });
    await waitFor(() => {
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      expect(within(toolbar).getByLabelText("悬浮解组")).toBeTruthy();
      expect(within(toolbar).queryByLabelText("悬浮填充")).toBeNull();
    });

    fireEvent.doubleClick(getSketchNodeElement("rect"), { clientX: 80, clientY: 60 });
    await waitFor(() => {
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      expect(within(toolbar).getByLabelText("悬浮填充")).toBeTruthy();
      expect(within(toolbar).getByLabelText("悬浮描边")).toBeTruthy();
      expect(within(toolbar).queryByLabelText("悬浮解组")).toBeNull();
    });
  });

  it("selects a group on the first canvas click and moves only visible unlocked descendants as one history step", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 500, height: 360 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["rect", "line", "arrow", "path", "image", "locked", "hidden"] },
        { id: "rect", type: "rect", x: 40, y: 40, width: 60, height: 40 },
        { id: "line", type: "line", x: 130, y: 50, width: 80, height: 20 },
        { id: "arrow", type: "arrow", x: 230, y: 60, width: 70, height: 30 },
        { id: "path", type: "path", x: 320, y: 70, width: 50, height: 30, path: "M 320 70 L 370 100" },
        { id: "image", type: "image", x: 60, y: 150, width: 50, height: 40, src: "data:image/png;base64,AAAA" },
        { id: "locked", type: "rect", x: 140, y: 150, width: 60, height: 40, locked: true },
        { id: "hidden", type: "rect", x: 240, y: 150, width: 60, height: 40, visible: false },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage, 500, 360);
    const originalPositions = new Map(
      readRenderedScene().nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    const rect = getSketchNodeElement("rect");
    dispatchPointerEvent(rect, "pointerdown", 70, 60);
    dispatchPointerEvent(stage, "pointermove", 100, 85);
    await waitFor(() => {
      expect(screen.getByTestId("sketch-selection-box")).toMatchObject({
        style: expect.objectContaining({ left: "56px", top: "54.16666666666667px", width: "264px", height: "125px" }),
      });
    });
    dispatchPointerEvent(stage, "pointerup", 100, 85);

    await waitFor(() => {
      const parsed = readRenderedScene();
      for (const id of ["rect", "line", "arrow", "path", "image"]) {
        const node = parsed.nodes.find((item) => item.id === id);
        const original = originalPositions.get(id);
        expect(node?.x).toBe((original?.x ?? 0) + 30);
        expect(node?.y).toBe((original?.y ?? 0) + 25);
      }
      expect(parsed.nodes.find((node) => node.id === "locked")).toMatchObject(originalPositions.get("locked") ?? {});
      expect(parsed.nodes.find((node) => node.id === "hidden")).toMatchObject(originalPositions.get("hidden") ?? {});
      expect(parsed.nodes.find((node) => node.id === "group")).toMatchObject(originalPositions.get("group") ?? {});
    });
    expect(within(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" })).getByLabelText("悬浮解组")).toBeTruthy();
    expect(screen.getByTestId("sketch-selection-box")).toMatchObject({
      style: expect.objectContaining({ left: "56px", top: "54.16666666666667px", width: "264px", height: "125px" }),
    });

    fireEvent.keyDown(window, { key: "z", metaKey: true });

    await waitFor(() => {
      const parsed = readRenderedScene();
      for (const [id, position] of originalPositions) {
        expect(parsed.nodes.find((node) => node.id === id)).toMatchObject(position);
      }
    });
  });

  it("keeps the group selected after a canvas click and drags the group as one unit", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["first", "second"] },
        { id: "first", type: "rect", x: 40, y: 50, width: 80, height: 50 },
        { id: "second", type: "ellipse", x: 180, y: 80, width: 70, height: 50 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    dispatchPointerEvent(getSketchNodeElement("first"), "pointerdown", 70, 70);
    dispatchPointerEvent(stage, "pointerup", 70, 70);

    await waitFor(() => {
      expect(within(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" })).getByLabelText("悬浮解组")).toBeTruthy();
    });

    dispatchPointerEvent(getSketchNodeElement("first"), "pointerdown", 70, 70);
    dispatchPointerEvent(stage, "pointermove", 90, 90);
    dispatchPointerEvent(stage, "pointerup", 90, 90);

    await waitFor(() => {
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      expect(within(toolbar).getByLabelText("悬浮解组")).toBeTruthy();
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "first")).toMatchObject({ x: 60, y: 70 });
      expect(parsed.nodes.find((node) => node.id === "second")).toMatchObject({ x: 200, y: 100 });
    });
  });

  it("moves every editable descendant when dragging an already selected group", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["first", "second"] },
        { id: "first", type: "rect", x: 40, y: 50, width: 80, height: 50 },
        { id: "second", type: "ellipse", x: 180, y: 80, width: 70, height: 50 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    clickLayerNode("group");
    const originalPositions = new Map(
      readRenderedScene().nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );

    dispatchPointerEvent(getSketchNodeElement("first"), "pointerdown", 70, 70);
    dispatchPointerEvent(stage, "pointermove", 100, 95);
    dispatchPointerEvent(stage, "pointerup", 100, 95);

    await waitFor(() => {
      const parsed = readRenderedScene();
      for (const id of ["first", "second"]) {
        const node = parsed.nodes.find((item) => item.id === id);
        const original = originalPositions.get(id);
        expect(node?.x).toBe((original?.x ?? 0) + 30);
        expect(node?.y).toBe((original?.y ?? 0) + 25);
      }
      expect(within(screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" })).getByLabelText("悬浮解组")).toBeTruthy();
    });
  });

  it("keeps an ordinary child click on the group and drills only on the first double click", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["first", "second"] },
        { id: "first", type: "rect", x: 40, y: 50, width: 80, height: 50 },
        { id: "second", type: "ellipse", x: 180, y: 80, width: 70, height: 50 },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    clickLayerNode("group");

    dispatchPointerEvent(getSketchNodeElement("first"), "pointerdown", 70, 70);
    dispatchPointerEvent(stage, "pointerup", 70, 70);
    await waitFor(() => {
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      expect(within(toolbar).getByLabelText("悬浮解组")).toBeTruthy();
      expect(within(toolbar).queryByLabelText("悬浮填充")).toBeNull();
    });

    fireEvent.doubleClick(getSketchNodeElement("first"), { clientX: 70, clientY: 70 });
    await waitFor(() => {
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      expect(within(toolbar).getByLabelText("悬浮填充")).toBeTruthy();
      expect(within(toolbar).queryByLabelText("悬浮解组")).toBeNull();
    });
  });

  it("shows only ungroup for a mixed group selection", async () => {
    const groupedScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "group", type: "group", x: 0, y: 0, width: 12, height: 12, visible: false, children: ["rect", "label"] },
        { id: "rect", type: "rect", x: 30, y: 40, width: 80, height: 50, style: { fill: "#ffffff", stroke: "#111827" } },
        { id: "label", type: "text", x: 150, y: 110, width: 100, height: 30, text: "Label", style: { color: "#123456" } },
      ],
    };
    render(<ControlledPartsEditorWithToolbar initialScene={groupedScene} />);
    clickLayerNode("group");

    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    expect(Array.from(within(toolbar).getAllByRole("button"), (button) => button.getAttribute("aria-label"))).toEqual([
      "悬浮解组",
      "悬浮图层",
      "悬浮更多",
    ]);
    expect(within(toolbar).queryByLabelText("悬浮边框")).toBeNull();
    expect(within(toolbar).queryByLabelText("悬浮颜色")).toBeNull();
    expect(within(toolbar).queryByLabelText("悬浮对齐方式")).toBeNull();
    expect(screen.getByTestId("sketch-selection-box")).toBeTruthy();
  });

  it("keeps the floating toolbar centered when it fits and shifts it away from horizontal edges", async () => {
    const toolbarWidth = 220;
    const toolbarRectSpy = mockFloatingToolbarRect(toolbarWidth);
    const renderSelection = async (x: number, y = 40) => {
      const panelScene: SketchSceneDocument = {
        version: 1,
        pageSize: { width: 400, height: 300 },
        nodes: [{ id: "rect", type: "rect", x, y, width: 40, height: 40, style: { fill: "#ffffff" } }],
      };
      render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);
      clickLayerNode("rect");
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      await waitFor(() => expect(toolbar.style.left).not.toBe(""));
      return toolbar;
    };

    const leftToolbar = await renderSelection(0);
    expect(leftToolbar.style.left).toBe("126px");

    cleanup();
    const centeredToolbar = await renderSelection(180);
    expect(centeredToolbar.style.left).toBe("224px");

    cleanup();
    const rightToolbar = await renderSelection(360);
    expect(rightToolbar.style.left).toBe("322px");

    const container = rightToolbar.parentElement as HTMLElement;
    Object.defineProperty(container, "clientWidth", { configurable: true, value: 320 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(rightToolbar.style.left).toBe("194px"));

    toolbarRectSpy.mockRestore();
  });

  it("keeps the existing vertical toolbar placement while resolving horizontal bounds", async () => {
    const toolbarRectSpy = mockFloatingToolbarRect(220);
    const panelScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [{ id: "rect", type: "rect", x: 180, y: 100, width: 40, height: 40, style: { fill: "#ffffff" } }],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

    clickLayerNode("rect");
    const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
    await waitFor(() => expect(toolbar.style.top).toBe("40px"));

    toolbarRectSpy.mockRestore();
  });

  it("flips contextual menus above the toolbar and clamps them to the canvas edges", async () => {
    const toolbarRectSpy = mockFloatingToolbarRect(220);
    try {
      const panelScene: SketchSceneDocument = {
        version: 1,
        pageSize: { width: 400, height: 300 },
        nodes: [{ id: "rect", type: "rect", x: 360, y: 240, width: 40, height: 40 }],
      };
      render(<ControlledPartsEditorWithToolbarAndProperties initialScene={panelScene} />);

      clickLayerNode("rect");
      const toolbar = screen.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
      const trigger = within(toolbar).getByLabelText("悬浮更多") as HTMLButtonElement;
      trigger.getBoundingClientRect = () => ({
        left: 360,
        top: 180,
        width: 40,
        height: 32,
        right: 400,
        bottom: 212,
        x: 360,
        y: 180,
        toJSON: () => ({}),
      }) as DOMRect;

      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "草图工具菜单" });
      await waitFor(() => {
        expect(dialog.style.left).toBe("184px");
        expect(dialog.style.top).toBe("12px");
      });
    } finally {
      toolbarRectSpy.mockRestore();
    }
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
    expect(screen.getByText("图片来源：内嵌 data URL")).toBeTruthy();
    expect(screen.getByText(/资源大小：约/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("图片地址"), { target: { value: nextImageSrc } });
    fireEvent.change(screen.getByLabelText("Alt 文本"), { target: { value: "Hero image" } });
    fireEvent.change(screen.getByLabelText("裁剪/适配"), { target: { value: "contain" } });

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

  it("shows connector candidate points while dragging arrow endpoints without changing scene data", async () => {
    const connectorScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "arrow", type: "arrow", x: 40, y: 50, width: 80, height: 0 },
        { id: "card", type: "card", x: 180, y: 90, width: 100, height: 70, text: "Target" },
        { id: "hidden", type: "rect", x: 300, y: 90, width: 40, height: 40, visible: false },
      ],
    };
    render(<ControlledEditor initialScene={connectorScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const originalSceneJson = screen.getByTestId("scene-json").textContent;
    const arrowNode = document.querySelector('[data-sketch-node-id="arrow"]');
    expect(arrowNode).not.toBeNull();
    dispatchPointerEvent(arrowNode as Element, "pointerdown", 80, 50);
    dispatchPointerEvent(stage, "pointerup", 80, 50);

    const endHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(endHandle, "pointerdown", 120, 50);

    await waitFor(() => {
      const candidates = screen.getAllByTestId("sketch-connector-candidate-point");
      expect(candidates).toHaveLength(5);
      expect(candidates[0].style.left).toBe("230px");
      expect(candidates[0].style.top).toBe("90px");
    });
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);

    dispatchPointerEvent(stage, "pointerup", 120, 50);
    await waitFor(() => expect(screen.queryByTestId("sketch-connector-candidate-point")).toBeNull());
  });

  it("binds arrow endpoints to shape anchors and follows the connected shape while moving", async () => {
    const connectorScene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        { id: "arrow", type: "arrow", x: 40, y: 50, width: 80, height: 0 },
        { id: "card", type: "card", x: 180, y: 90, width: 100, height: 70, text: "Target" },
      ],
    };
    render(<ControlledPartsEditorWithToolbarAndProperties initialScene={connectorScene} />);

    const stage = getCanvasStage();
    setCanvasStageRect(stage);
    const arrowNode = document.querySelector('[data-sketch-node-id="arrow"]');
    expect(arrowNode).not.toBeNull();
    dispatchPointerEvent(arrowNode as Element, "pointerdown", 80, 50);
    dispatchPointerEvent(stage, "pointerup", 80, 50);

    const endHandle = await screen.findByTestId("sketch-resize-handle");
    dispatchPointerEvent(endHandle, "pointerdown", 120, 50);
    dispatchPointerEvent(stage, "pointermove", 180, 125);
    dispatchPointerEvent(stage, "pointerup", 180, 125);

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "arrow")).toMatchObject({
        x: 40,
        y: 50,
        width: 140,
        height: 75,
        connections: { end: { nodeId: "card", anchor: "left" } },
      });
    });

    expect(screen.getByText("终点绑定：card / left")).toBeTruthy();
    const cardNode = document.querySelector('[data-sketch-node-id="card"]');
    expect(cardNode).not.toBeNull();
    dispatchPointerEvent(cardNode as Element, "pointerdown", 200, 110);
    dispatchPointerEvent(stage, "pointermove", 220, 120);
    dispatchPointerEvent(stage, "pointerup", 220, 120);

    await waitFor(() => {
      const parsed = readRenderedScene();
      expect(parsed.nodes.find((node) => node.id === "card")).toMatchObject({ x: 200, y: 100 });
      expect(parsed.nodes.find((node) => node.id === "arrow")).toMatchObject({
        x: 40,
        y: 50,
        width: 160,
        height: 85,
        connections: { end: { nodeId: "card", anchor: "left" } },
      });
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
    dispatchPointerEvent(getSketchNodeElement("right-bottom"), "pointerdown", 110, 70, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeLabelElement("card"), "pointerdown", 80, 120, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeElement("line-b"), "pointerdown", 105, 50, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeElement("line-b"), "pointerdown", 140, 50, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeElement("line-b"), "pointerdown", 21, 50, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeElement("line-b"), "pointerdown", 50, 105, { shiftKey: true });
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
    dispatchPointerEvent(getSketchNodeLabelElement("card"), "pointerdown", 80, 120, { shiftKey: true });
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

  it("does not capture the pointer or start a drag on right-click", () => {
    render(<ControlledEditor />);

    const stage = getCanvasStage();
    const captureSpy = vi.fn();
    Object.defineProperty(stage, "setPointerCapture", { configurable: true, value: captureSpy });

    fireEvent.pointerDown(stage, { button: 2, pointerId: 7, clientX: 120, clientY: 120 });

    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("shows export and copy actions in the canvas context menu without changing scene data", async () => {
    render(<ControlledEditor />);

    const cardLabel = document.querySelector('[data-sketch-node-label="card"]');
    expect(cardLabel).not.toBeNull();
    const originalSceneJson = screen.getByTestId("scene-json").textContent;

    fireEvent.contextMenu(cardLabel as Element, { clientX: 120, clientY: 140 });

    const menu = await screen.findByRole("menu", { name: "草图右键菜单" });
    expect(within(menu).getByRole("menuitem", { name: "复制 SVG" })).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "复制 PNG" })).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "导出选区" })).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "导出整页" })).not.toBeNull();
    expect(screen.getByTestId("scene-json").textContent).toBe(originalSceneJson);
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
