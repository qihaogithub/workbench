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
            name: "页面一",
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

function getCanvasState() {
  return JSON.parse(screen.getByTestId("canvas-state").textContent || "{}") as CanvasState;
}

describe("PreviewCanvas viewer 交互模式", () => {
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

  it("显示 viewer 工具栏并隐藏编辑入口", () => {
    render(<TestCanvas />);

    expect(screen.getByLabelText("拖动工具")).toBeInTheDocument();
    expect(screen.getByLabelText("适应屏幕")).toBeInTheDocument();
    expect(screen.getByLabelText("缩小")).toBeInTheDocument();
    expect(screen.getByLabelText("放大")).toBeInTheDocument();
    expect(screen.getByLabelText("重置布局")).toBeInTheDocument();

    expect(screen.queryByLabelText("选择工具")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加文档")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("自动排版")).not.toBeInTheDocument();
  });

  it("初始加载后自动适应屏幕", async () => {
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

  it("支持缩放和重置视图且不重置页面布局", async () => {
    render(<TestCanvas />);

    const expected = getExpectedFitViewport();
    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeCloseTo(expected.zoom, 5);
    });

    fireEvent.click(screen.getByLabelText("放大"));

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeGreaterThan(expected.zoom);
    });

    fireEvent.click(screen.getByLabelText("重置布局"));

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport).toEqual({ x: 40, y: 40, zoom: 0.5 });
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
});
