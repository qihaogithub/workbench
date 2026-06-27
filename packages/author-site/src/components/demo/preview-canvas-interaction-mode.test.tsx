import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { PreviewCanvas } from "../../../../shared/src/demo/PreviewCanvas";
import type { CanvasState } from "../../../../shared/src/demo/types";

const initialState: CanvasState = {
  viewport: { x: 40, y: 40, zoom: 0.5 },
  pages: {
    page_1: { x: 100, y: 120, width: 375, height: 812 },
  },
};

const mockCanvasSize = { width: 1000, height: 800 };

function getExpectedFitViewport() {
  const page = initialState.pages.page_1;
  const zoom =
    Math.min(mockCanvasSize.width / page.width, mockCanvasSize.height / page.height) *
    0.9;
  return {
    x: mockCanvasSize.width / 2 - (page.x + page.width / 2) * zoom,
    y: mockCanvasSize.height / 2 - (page.y + page.height / 2) * zoom,
    zoom,
  };
}

function TestCanvas() {
  const [state, setState] = useState<CanvasState>(initialState);

  return (
    <>
      <PreviewCanvas
        interactionMode="viewer"
        pages={[
          {
            id: "page_1",
            name: "椤甸潰涓€",
            order: 0,
            code: "export default function Demo(){return null}",
            previewSize: { width: 375, height: 812 },
          },
        ]}
        canvasState={state}
        onCanvasStateChange={setState}
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function TestEditorCanvas() {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {
      page_1: { x: 100, y: 120, width: 375, height: 812 },
    },
    nodes: {},
  });

  return (
    <>
      <PreviewCanvas
        interactionMode="editor"
        pages={[
          {
            id: "page_1",
            name: "椤甸潰涓€",
            order: 0,
            code: "export default function Demo(){return null}",
            previewSize: { width: 375, height: 812 },
          },
        ]}
        canvasState={state}
        onCanvasStateChange={setState}
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function TestMultiPageEditorCanvas() {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 0, y: 0, zoom: 1 },
    pages: {
      page_1: { x: 100, y: 100, width: 100, height: 100 },
      page_2: { x: 300, y: 130, width: 100, height: 100 },
      page_3: { x: 520, y: 180, width: 100, height: 100 },
    },
    nodes: {},
  });

  return (
    <>
      <PreviewCanvas
        interactionMode="editor"
        pages={[
          {
            id: "page_1",
            name: "椤甸潰涓€",
            order: 0,
            code: "export default function Demo(){return null}",
            previewSize: { width: 100, height: 100 },
          },
          {
            id: "page_2",
            name: "页面二",
            order: 1,
            code: "export default function Demo(){return null}",
            previewSize: { width: 100, height: 100 },
          },
          {
            id: "page_3",
            name: "页面三",
            order: 2,
            code: "export default function Demo(){return null}",
            previewSize: { width: 100, height: 100 },
          },
        ]}
        canvasState={state}
        onCanvasStateChange={setState}
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function getCanvasState() {
  return JSON.parse(screen.getByTestId("canvas-state").textContent || "{}") as CanvasState;
}

function dropFiles(
  target: HTMLElement,
  files: File[],
  point: { clientX: number; clientY: number },
) {
  const event = new MouseEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: point.clientX,
    clientY: point.clientY,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      items: [],
    },
  });
  fireEvent(target, event);
}

function dragMarquee(
  target: HTMLElement,
  from: { clientX: number; clientY: number },
  to: { clientX: number; clientY: number },
) {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: from.clientX,
    clientY: from.clientY,
    pointerId: 1,
  });
  fireEvent.pointerMove(target, {
    clientX: to.clientX,
    clientY: to.clientY,
    pointerId: 1,
  });
  fireEvent.pointerUp(target, {
    clientX: to.clientX,
    clientY: to.clientY,
    pointerId: 1,
  });
}

describe("PreviewCanvas viewer 浜や簰妯″紡", () => {
  beforeAll(() => {
    class MockPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;

      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 1;
        this.pointerType = props.pointerType ?? "mouse";
      }
    }

    Object.defineProperty(window, "PointerEvent", {
      writable: true,
      value: MockPointerEvent,
    });
    Object.defineProperty(globalThis, "PointerEvent", {
      writable: true,
      value: MockPointerEvent,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      writable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      writable: true,
      value: (id: number) => window.clearTimeout(id),
    });
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 800;
      naturalHeight = 600;

      set src(_value: string) {
        window.setTimeout(() => this.onload?.(), 0);
      }
    }

    Object.defineProperty(window, "Image", {
      writable: true,
      value: MockImage,
    });
    Object.defineProperty(globalThis, "Image", {
      writable: true,
      value: MockImage,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return mockCanvasSize.width;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return mockCanvasSize.height;
      },
    });
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: class MockResizeObserver {
        private callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(target: Element) {
          this.callback(
            [
              {
                target,
                contentRect: {
                  width: mockCanvasSize.width,
                  height: mockCanvasSize.height,
                },
              } as ResizeObserverEntry,
            ],
            this as ResizeObserver,
          );
        }

        unobserve() {}

        disconnect() {}
      },
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("鏄剧ず viewer 宸ュ叿鏍忓苟闅愯棌缂栬緫鍏ュ彛", () => {
    render(<TestCanvas />);

    expect(screen.getByLabelText("拖动工具")).toBeInTheDocument();
    expect(screen.getByLabelText("适应屏幕")).toBeInTheDocument();
    expect(screen.getByLabelText("缩小")).toBeInTheDocument();
    expect(screen.getByLabelText("放大")).toBeInTheDocument();

    expect(screen.queryByLabelText("选择工具")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加文档")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加文字")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加箭头")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("画笔")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加图片")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("自动排版")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("重置布局")).not.toBeInTheDocument();
  });

  it("editor 妯″紡榛樿閫変腑閫夋嫨宸ュ叿", () => {
    const { container } = render(<TestEditorCanvas />);

    const toolButtons = Array.from(
      container.querySelectorAll("button[aria-pressed]"),
    );

    expect(toolButtons).toHaveLength(2);
    expect(toolButtons[0]).toHaveAttribute("aria-pressed", "false");
    expect(toolButtons[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("editor 妯″紡鏄剧ず鑷敱鏍囨敞宸ュ叿鍏ュ彛", () => {
    render(<TestEditorCanvas />);

    expect(screen.getByLabelText("添加文档")).toBeInTheDocument();
    expect(screen.getByLabelText("添加文字")).toBeInTheDocument();
    expect(screen.getByLabelText("添加箭头")).toBeInTheDocument();
    expect(screen.getByLabelText("画笔")).toBeInTheDocument();
    expect(screen.getByLabelText("添加图片")).toBeInTheDocument();
  });
  it("文字工具在画布目标位置点击后创建文字节点", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("添加文字"));
    expect(Object.values(getCanvasState().nodes ?? {})).toHaveLength(0);
    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 300,
      clientY: 240,
      pointerId: 4,
    });
    fireEvent.pointerUp(root, {
      clientX: 300,
      clientY: 240,
      pointerId: 4,
    });

    await waitFor(() => {
      const nodes = Object.values(getCanvasState().nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "text",
        title: "文字",
        text: "",
        fontSize: 18,
        color: "#111827",
        layout: {
          x: 400,
          y: 352,
          width: 240,
          height: 96,
        },
      });
    });
    expect(screen.getByLabelText("编辑文字")).toHaveFocus();
    expect(screen.getByLabelText("标注属性")).toBeInTheDocument();
  });
  it("箭头工具点击空白画布不会创建固定长度箭头", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("添加箭头"));
    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 260,
      clientY: 220,
      pointerId: 7,
    });
    fireEvent.pointerUp(root, {
      clientX: 260,
      clientY: 220,
      pointerId: 7,
    });

    await waitFor(() => {
      expect(Object.values(getCanvasState().nodes ?? {})).toHaveLength(0);
    });
  });
  it("箭头工具支持在画布空白处拖拽创建箭头节点", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("添加箭头"));
    expect(Object.values(getCanvasState().nodes ?? {})).toHaveLength(0);
    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 260,
      clientY: 220,
      pointerId: 5,
    });
    fireEvent.pointerMove(root, {
      clientX: 420,
      clientY: 230,
      pointerId: 5,
    });
    fireEvent.pointerUp(root, {
      clientX: 420,
      clientY: 230,
      pointerId: 5,
    });

    await waitFor(() => {
      const nodes = Object.values(getCanvasState().nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "arrow",
        title: "箭头",
        color: "#2563eb",
        strokeWidth: 6,
        direction: "right",
      });
      expect(nodes[0].layout.width).toBeGreaterThan(160);
    });
  });
  it("图片工具支持从本地选择图片并在目标位置创建图片节点", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["image-bytes"], "toolbar-hero.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [file] } });
    expect(Object.values(getCanvasState().nodes ?? {})).toHaveLength(0);
    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 360,
      clientY: 260,
      pointerId: 6,
    });
    fireEvent.pointerUp(root, {
      clientX: 360,
      clientY: 260,
      pointerId: 6,
    });

    await waitFor(() => {
      const nodes = Object.values(getCanvasState().nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "image",
        title: "toolbar-hero.png",
        fileName: "toolbar-hero.png",
        intrinsicWidth: 800,
        intrinsicHeight: 600,
      });
      expect(nodes[0].kind === "image" ? nodes[0].src : "").toMatch(
        /^data:image\/png;base64,/,
      );
    });
  });

  it("鐢荤瑪妯″紡鏀寔鎷栨嫿鍒涘缓缁樺埗鑺傜偣", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("画笔"));
    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 200,
      clientY: 180,
      pointerId: 3,
    });
    fireEvent.pointerMove(root, {
      clientX: 240,
      clientY: 220,
      pointerId: 3,
    });
    fireEvent.pointerUp(root, {
      clientX: 280,
      clientY: 240,
      pointerId: 3,
    });

    await waitFor(() => {
      const nodes = Object.values(getCanvasState().nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "drawing",
        title: "画笔",
        color: "#111827",
        strokeWidth: 4,
      });
      expect(
        nodes[0].kind === "drawing" ? nodes[0].points.length : 0,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("选择工具支持框选多个页面并执行左对齐", async () => {
    const { container } = render(<TestMultiPageEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    dragMarquee(root, { clientX: 80, clientY: 80 }, { clientX: 430, clientY: 260 });

    await waitFor(() => {
      expect(screen.getByLabelText("多选对齐工具栏")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("左对齐"));

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.pages.page_1.x).toBe(100);
      expect(state.pages.page_2.x).toBe(100);
      expect(state.pages.page_3.x).toBe(520);
    });
  });

  it("澶氶€夊悗鏀寔姘村钩鍧囧垎椤甸潰", async () => {
    const { container } = render(<TestMultiPageEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    dragMarquee(root, { clientX: 80, clientY: 80 }, { clientX: 650, clientY: 320 });

    await waitFor(() => {
      expect(screen.getByLabelText("多选对齐工具栏")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("水平均分"));

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.pages.page_1.x).toBe(100);
      expect(state.pages.page_2.x).toBe(310);
      expect(state.pages.page_3.x).toBe(520);
    });
  });

  it("鎷栧姩澶氶€変腑鐨勯〉闈㈡椂鍚屾绉诲姩鎵€鏈夐€変腑椤甸潰", async () => {
    const { container } = render(<TestMultiPageEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    dragMarquee(root, { clientX: 80, clientY: 80 }, { clientX: 430, clientY: 260 });

    await waitFor(() => {
      expect(screen.getByLabelText("多选对齐工具栏")).toBeInTheDocument();
    });

    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;
    Object.defineProperty(page, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 100,
        right: 200,
        bottom: 200,
        width: 100,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(page, {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 2,
    });
    fireEvent.pointerMove(page, {
      clientX: 180,
      clientY: 190,
      pointerId: 2,
    });
    fireEvent.pointerUp(page, {
      clientX: 180,
      clientY: 190,
      pointerId: 2,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.pages.page_1).toMatchObject({ x: 130, y: 140 });
      expect(state.pages.page_2).toMatchObject({ x: 330, y: 170 });
      expect(state.pages.page_3).toMatchObject({ x: 520, y: 180 });
    });
  });

  it("鍒濆鍔犺浇鍚庤嚜鍔ㄩ€傚簲灞忓箷", async () => {
    render(<TestCanvas />);

    const expected = getExpectedFitViewport();
    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport.zoom).toBeCloseTo(expected.zoom, 5);
      expect(state.viewport.x).toBeCloseTo(expected.x, 5);
      expect(state.viewport.y).toBeCloseTo(expected.y, 5);
      expect(state.pages.page_1).toEqual(initialState.pages.page_1);
    });
  });

  it("选择工具滚轮只在按住 Ctrl 或 Cmd 时缩放画布", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    const initialZoom = getCanvasState().viewport.zoom;

    fireEvent.wheel(root, {
      clientX: 500,
      clientY: 400,
      deltaY: -100,
    });

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeCloseTo(initialZoom, 5);
    });

    fireEvent.wheel(root, {
      clientX: 500,
      clientY: 400,
      deltaY: -100,
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeGreaterThan(initialZoom);
    });
  });

  it("Ctrl 加滚轮缩放画布时阻止浏览器默认缩放", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 400,
      deltaY: -100,
      ctrlKey: true,
    });

    fireEvent(root, event);

    await waitFor(() => {
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("鎶撴墜宸ュ叿婊氳疆鏃犻渶 Ctrl 鎴?Cmd 鍗冲彲缂╂斁鐢诲竷", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;
    const initialZoom = getCanvasState().viewport.zoom;

    fireEvent.click(screen.getByLabelText("拖动工具"));
    fireEvent.wheel(root, {
      clientX: 500,
      clientY: 400,
      deltaY: -100,
    });

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeGreaterThan(initialZoom);
    });
  });

  it("鏀寔宸ュ叿鏍忕缉鏀句笖涓嶇Щ鍔ㄩ〉闈㈠竷灞€", async () => {
    render(<TestCanvas />);

    const expected = getExpectedFitViewport();
    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeCloseTo(expected.zoom, 5);
    });

    fireEvent.click(screen.getByLabelText("放大"));

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport.zoom).toBeGreaterThan(expected.zoom);
      expect(state.pages.page_1).toEqual(initialState.pages.page_1);
    });
  });

  it("拖动画布时只更新视口不移动页面", async () => {
    const { container } = render(<TestCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;
    const expected = getExpectedFitViewport();

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeCloseTo(expected.zoom, 5);
    });

    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 10,
      clientY: 20,
      pointerId: 1,
    });
    fireEvent.pointerMove(root, {
      clientX: 35,
      clientY: 55,
      pointerId: 1,
    });
    fireEvent.pointerUp(root, {
      clientX: 35,
      clientY: 55,
      pointerId: 1,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport.zoom).toBeCloseTo(expected.zoom, 5);
      expect(state.viewport.x).toBeCloseTo(expected.x + 25, 5);
      expect(state.viewport.y).toBeCloseTo(expected.y + 35, 5);
      expect(state.pages.page_1).toEqual(initialState.pages.page_1);
    });
  });

  it("鏀寔鎷栧叆鏈湴 Markdown 鏂囨。骞舵寜钀界偣鍒涘缓鏂囨。鑺傜偣", async () => {
    render(<TestEditorCanvas />);
    const canvas = screen.getByLabelText("画布工作区");
    const file = new File(["# 导入说明\n\n- 第一项"], "导入说明.md", {
      type: "text/markdown",
    });

    dropFiles(canvas, [file], { clientX: 240, clientY: 190 });

    await waitFor(() => {
      const state = getCanvasState();
      const nodes = Object.values(state.nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "document",
        title: "导入说明",
        markdown: "# 导入说明\n\n- 第一项",
        layout: {
          x: 190,
          y: 120,
          width: 420,
          height: 360,
        },
      });
    });
  });

  it("鏀寔鎷栧叆鏈湴鍥剧墖骞舵寜钀界偣鍒涘缓鍥剧墖鑺傜偣", async () => {
    render(<TestEditorCanvas />);
    const canvas = screen.getByLabelText("画布工作区");
    const file = new File(["image-bytes"], "hero.png", {
      type: "image/png",
    });

    dropFiles(canvas, [file], { clientX: 340, clientY: 240 });

    await waitFor(() => {
      const state = getCanvasState();
      const nodes = Object.values(state.nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "image",
        title: "hero.png",
        fileName: "hero.png",
        intrinsicWidth: 800,
        intrinsicHeight: 600,
        layout: {
          x: 320,
          y: 190,
          width: 560,
          height: 420,
        },
      });
      expect(nodes[0].kind === "image" ? nodes[0].src : "").toMatch(
        /^data:image\/png;base64,/,
      );
    });
  });

  it("鍥剧墖鑺傜偣缂╂斁鏃朵繚鎸佸浘鐗囨瘮渚嬩笖涓嶆坊鍔犺儗鏅壊", async () => {
    const { container } = render(<TestEditorCanvas />);
    const canvas = screen.getByLabelText("画布工作区");
    const file = new File(["image-bytes"], "hero.png", {
      type: "image/png",
    });

    dropFiles(canvas, [file], { clientX: 340, clientY: 240 });

    await waitFor(() => {
      expect(container.querySelector("[data-canvas-node-id]")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("选择工具"));

    const imageNode = container.querySelector(
      "[data-canvas-node-id]",
    ) as HTMLElement;
    const image = container.querySelector("img") as HTMLImageElement;
    expect(image.parentElement).not.toHaveClass("bg-black/5");
    expect(image.parentElement?.parentElement).not.toHaveClass("bg-background");

    Object.defineProperty(imageNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 560,
        bottom: 420,
        width: 560,
        height: 420,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(imageNode, {
      button: 0,
      clientX: 559,
      clientY: 210,
      pointerId: 1,
    });
    fireEvent.pointerMove(imageNode, {
      clientX: 699,
      clientY: 210,
      pointerId: 1,
    });
    fireEvent.pointerUp(imageNode, {
      clientX: 699,
      clientY: 210,
      pointerId: 1,
    });

    await waitFor(() => {
      const state = getCanvasState();
      const node = Object.values(state.nodes ?? {})[0];
      expect(node).toMatchObject({
        kind: "image",
        layout: {
          x: 320,
          y: 85,
          width: 840,
          height: 630,
        },
      });
    });
  });
});
