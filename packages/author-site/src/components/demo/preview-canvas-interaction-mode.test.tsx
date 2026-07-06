import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  CanvasDocumentContent,
  PreviewCanvas,
  type CanvasKnowledgeDocument,
  type CanvasState,
} from "@workbench/demo-ui";

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

function TestEditorCanvas({
  editingPageId,
}: {
  editingPageId?: string;
} = {}) {
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
        editingPageId={editingPageId}
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

const documentA: CanvasKnowledgeDocument = {
  id: "knowledge_a",
  title: "文档 A",
  fileName: "a.md",
};

const documentB: CanvasKnowledgeDocument = {
  id: "knowledge_b",
  title: "文档 B",
  fileName: "b.md",
};

describe("CanvasDocumentContent", () => {
  it("渲染单个 Markdown 文档内容", () => {
    render(
      <CanvasDocumentContent
        node={{
          id: "doc_single",
          kind: "document",
          title: "说明文档",
          markdown: "# 说明文档\n\n- 第一项",
          layout: { x: 0, y: 0, width: 420, height: 360 },
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "说明文档" })).toBeInTheDocument();
    expect(screen.getByText("第一项")).toBeInTheDocument();
  });
});

function TestEditorCanvasWithKnowledgeDocuments({
  aggregate = false,
}: {
  aggregate?: boolean;
}) {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 1 },
    pages: {},
    nodes: aggregate
      ? {
          doc_group: {
            id: "doc_group",
            kind: "document",
            title: "文档 A 等 2 个文档",
            documents: [
              { id: documentA.id, title: documentA.title, knowledgeDocument: documentA },
              { id: documentB.id, title: documentB.title, knowledgeDocument: documentB },
            ],
            activeDocumentId: documentA.id,
            layout: { x: 100, y: 100, width: 620, height: 420 },
            createdAt: 1,
            updatedAt: 1,
          },
        }
      : {
          doc_a: {
            id: "doc_a",
            kind: "document",
            title: documentA.title,
            knowledgeDocument: documentA,
            layout: { x: 100, y: 100, width: 420, height: 360 },
            createdAt: 1,
            updatedAt: 1,
          },
          doc_b: {
            id: "doc_b",
            kind: "document",
            title: documentB.title,
            knowledgeDocument: documentB,
            layout: { x: 560, y: 120, width: 420, height: 360 },
            createdAt: 1,
            updatedAt: 1,
          },
        },
  });

  return (
    <>
      <PreviewCanvas
        interactionMode="editor"
        pages={[]}
        canvasState={state}
        onCanvasStateChange={setState}
        knowledgeDocuments={[documentA, documentB]}
        onReadKnowledgeDocument={async (document) =>
          document.id === documentA.id
            ? "# 文档 A\n\nAlpha content"
            : "# 文档 B\n\nBeta content"
        }
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function TestEditorCanvasWithOffscreenKnowledgeDocuments({
  onReadKnowledgeDocument,
}: {
  onReadKnowledgeDocument: (document: CanvasKnowledgeDocument) => Promise<string>;
}) {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 0, y: 0, zoom: 1 },
    pages: {},
    nodes: {
      doc_a: {
        id: "doc_a",
        kind: "document",
        title: documentA.title,
        knowledgeDocument: documentA,
        layout: { x: 100, y: 100, width: 420, height: 360 },
        createdAt: 1,
        updatedAt: 1,
      },
      doc_b: {
        id: "doc_b",
        kind: "document",
        title: documentB.title,
        knowledgeDocument: documentB,
        layout: { x: 5000, y: 100, width: 420, height: 360 },
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });

  return (
    <PreviewCanvas
      interactionMode="editor"
      pages={[]}
      canvasState={state}
      onCanvasStateChange={setState}
      knowledgeDocuments={[documentA, documentB]}
      onReadKnowledgeDocument={onReadKnowledgeDocument}
    />
  );
}

function TestEditorCanvasWithFirstEntryFit() {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {
      page_1: { x: 100, y: 120, width: 375, height: 812 },
    },
    nodes: {},
  });
  const [showCanvas, setShowCanvas] = useState(false);
  const [fitToScreenOnMount, setFitToScreenOnMount] = useState(false);
  const [initialFitRequested, setInitialFitRequested] = useState(false);

  const enterCanvas = () => {
    if (!initialFitRequested) {
      setInitialFitRequested(true);
      setFitToScreenOnMount(true);
    }
    setShowCanvas(true);
  };

  return (
    <>
      <button type="button" onClick={enterCanvas}>
        显示画布
      </button>
      <button type="button" onClick={() => setShowCanvas(false)}>
        隐藏画布
      </button>
      {showCanvas && (
        <PreviewCanvas
          interactionMode="editor"
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
          fitToScreenOnMount={fitToScreenOnMount}
          onFitToScreenOnMountComplete={() => setFitToScreenOnMount(false)}
        />
      )}
      <output data-testid="fit-to-screen-on-mount">
        {String(fitToScreenOnMount)}
      </output>
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function TestCanvasWithParentVisibleState({
  onVisibleChange,
}: {
  onVisibleChange: (pageIds: string[]) => void;
}) {
  const [state, setState] = useState<CanvasState>(initialState);
  const [visiblePageIds, setVisiblePageIds] = useState<string[]>([]);

  return (
    <>
      <PreviewCanvas
        interactionMode="editor"
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
        onVisiblePageIdsChange={(pageIds) => {
          onVisibleChange(pageIds);
          setVisiblePageIds(pageIds);
        }}
      />
      <output data-testid="visible-page-ids">{visiblePageIds.join(",")}</output>
    </>
  );
}

function TestEditorCanvasWithConfigCallback({
  onPageConfigEdit,
  onRequestDeletePages,
}: {
  onPageConfigEdit: (pageId: string) => void;
  onRequestDeletePages?: (pageIds: string[]) => void;
}) {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {
      page_1: { x: 100, y: 120, width: 375, height: 812 },
    },
    nodes: {},
  });

  return (
    <PreviewCanvas
      interactionMode="editor"
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
      onPageConfigEdit={onPageConfigEdit}
      onRequestDeletePages={onRequestDeletePages}
    />
  );
}

function TestMultiPageEditorCanvas({
  onRequestDeletePages,
}: {
  onRequestDeletePages?: (pageIds: string[]) => void;
} = {}) {
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
        onRequestDeletePages={onRequestDeletePages}
      />
      <output data-testid="canvas-state">{JSON.stringify(state)}</output>
    </>
  );
}

function TestTextNodeEditorCanvas() {
  const [state, setState] = useState<CanvasState>({
    viewport: { x: 0, y: 0, zoom: 1 },
    pages: {},
    nodes: {
      text_1: {
        id: "text_1",
        kind: "text",
        title: "两行文字",
        text: "第一行\n第二行",
        fontSize: 22,
        color: "#ffffff",
        layout: { x: 100, y: 100, width: 240, height: 80 },
        createdAt: 1,
        updatedAt: 1,
      },
      text_2: {
        id: "text_2",
        kind: "text",
        title: "文字",
        text: "文字",
        fontSize: 18,
        color: "#ffffff",
        layout: { x: 420, y: 100, width: 240, height: 40 },
        createdAt: 1,
        updatedAt: 1,
      },
      text_3: {
        id: "text_3",
        kind: "text",
        title: "持续输入",
        text: "",
        fontSize: 18,
        color: "#ffffff",
        layout: { x: 100, y: 240, width: 80, height: 25 },
        createdAt: 1,
        updatedAt: 1,
      },
      text_4: {
        id: "text_4",
        kind: "text",
        title: "三行中文",
        text: "文字文字文字文字文字文字文字",
        fontSize: 18,
        color: "#ffffff",
        layout: { x: 100, y: 340, width: 90, height: 120 },
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });

  return (
    <>
      <PreviewCanvas
        interactionMode="editor"
        pages={[]}
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
    expect(screen.queryByLabelText("结构化图层")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Excalidraw 标注验证")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("自动排版")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("重置布局")).not.toBeInTheDocument();
  });

  it("向上层回传当前可见页面集合", async () => {
    const handleVisibleChange = jest.fn();
    render(
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
        canvasState={initialState}
        onCanvasStateChange={jest.fn()}
        onVisiblePageIdsChange={handleVisibleChange}
      />,
    );

    await waitFor(() => {
      expect(handleVisibleChange).toHaveBeenCalledWith(["page_1"]);
    });
  });

  it("可见页面集合内容不变时不重复回调父级，避免进入画布后循环更新", async () => {
    const handleVisibleChange = jest.fn();
    render(<TestCanvasWithParentVisibleState onVisibleChange={handleVisibleChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("visible-page-ids")).toHaveTextContent("page_1");
    });

    await waitFor(() => {
      expect(handleVisibleChange).toHaveBeenCalledTimes(1);
    });
  });

  it("editor 妯″紡榛樿閫変腑閫夋嫨宸ュ叿", () => {
    render(<TestEditorCanvas />);

    expect(screen.getByLabelText("拖动工具")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("选择工具")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("结构化图层")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Excalidraw 标注验证")).not.toBeInTheDocument();
  });

  it("editor 妯″紡鏄剧ず鑷敱鏍囨敞宸ュ叿鍏ュ彛", () => {
    render(<TestEditorCanvas />);

    expect(screen.getByLabelText("添加文档")).toBeInTheDocument();
    expect(screen.getByLabelText("添加文字")).toBeInTheDocument();
    expect(screen.queryByLabelText("添加箭头")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("画笔")).not.toBeInTheDocument();
    expect(screen.getByLabelText("添加图片")).toBeInTheDocument();
    expect(screen.queryByLabelText("结构化图层")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Excalidraw 标注验证")).not.toBeInTheDocument();
  });

  it("editor 模式点击页面更新画布选择态，并触发配置编辑回调", async () => {
    const onPageConfigEdit = jest.fn();
    const { container } = render(
      <TestEditorCanvasWithConfigCallback onPageConfigEdit={onPageConfigEdit} />,
    );
    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;

    Object.defineProperty(page, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 120,
        right: 475,
        bottom: 932,
        width: 375,
        height: 812,
        x: 100,
        y: 120,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(page, {
      button: 0,
      clientX: 220,
      clientY: 260,
      pointerId: 21,
    });
    fireEvent.pointerUp(page, {
      clientX: 220,
      clientY: 260,
      pointerId: 21,
    });

    await waitFor(() => {
      expect(
        container.querySelector("[data-page-id='page_1'] [data-canvas-selection-box='true']"),
      ).toBeInTheDocument();
    });
    expect(onPageConfigEdit).toHaveBeenCalledWith("page_1");
  });

  it("editor 模式选中页面后按 Delete 请求删除页面", async () => {
    const onRequestDeletePages = jest.fn();
    const { container } = render(
      <TestEditorCanvasWithConfigCallback
        onPageConfigEdit={jest.fn()}
        onRequestDeletePages={onRequestDeletePages}
      />,
    );
    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;

    Object.defineProperty(page, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 120,
        right: 475,
        bottom: 932,
        width: 375,
        height: 812,
        x: 100,
        y: 120,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(page, {
      button: 0,
      clientX: 220,
      clientY: 260,
      pointerId: 22,
    });
    fireEvent.pointerUp(page, {
      clientX: 220,
      clientY: 260,
      pointerId: 22,
    });

    await waitFor(() => {
      expect(
        container.querySelector("[data-page-id='page_1'] [data-canvas-selection-box='true']"),
      ).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Delete" });

    expect(onRequestDeletePages).toHaveBeenCalledWith(["page_1"]);
  });

  it("editor 模式页面右键菜单可以请求删除页面", async () => {
    const onRequestDeletePages = jest.fn();
    const { container } = render(
      <TestEditorCanvasWithConfigCallback
        onPageConfigEdit={jest.fn()}
        onRequestDeletePages={onRequestDeletePages}
      />,
    );
    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;

    fireEvent.contextMenu(page, { clientX: 240, clientY: 260 });
    fireEvent.click(screen.getByText("删除页面"));

    expect(onRequestDeletePages).toHaveBeenCalledWith(["page_1"]);
  });

  it("editor 模式单选页面后显示删除按钮", async () => {
    const onRequestDeletePages = jest.fn();
    const { container } = render(
      <TestEditorCanvasWithConfigCallback
        onPageConfigEdit={jest.fn()}
        onRequestDeletePages={onRequestDeletePages}
      />,
    );
    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;

    Object.defineProperty(page, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 120,
        right: 475,
        bottom: 932,
        width: 375,
        height: 812,
        x: 100,
        y: 120,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(page, {
      button: 0,
      clientX: 220,
      clientY: 260,
      pointerId: 23,
    });
    fireEvent.pointerUp(page, {
      clientX: 220,
      clientY: 260,
      pointerId: 23,
    });

    const deleteButton = await screen.findByTitle("删除页面");
    fireEvent.click(deleteButton);

    expect(onRequestDeletePages).toHaveBeenCalledWith(["page_1"]);
  });

  it("支持 Shift 多选页面并合并为带目录的页面组", async () => {
    const { container } = render(<TestMultiPageEditorCanvas />);
    const pageA = container.querySelector("[data-page-id='page_1']") as HTMLElement;
    const pageB = container.querySelector("[data-page-id='page_2']") as HTMLElement;
    Object.defineProperty(pageA, "getBoundingClientRect", {
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
    Object.defineProperty(pageB, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 300,
        top: 130,
        right: 400,
        bottom: 230,
        width: 100,
        height: 100,
        x: 300,
        y: 130,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(pageA, {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 41,
    });
    fireEvent.pointerUp(pageA, {
      clientX: 120,
      clientY: 120,
      pointerId: 41,
    });
    await waitFor(() => {
      expect(
        container.querySelector(
          "[data-page-id='page_1'] [data-canvas-selection-box='true']",
        ),
      ).toBeInTheDocument();
    });
    fireEvent.pointerDown(pageB, {
      button: 0,
      clientX: 320,
      clientY: 150,
      pointerId: 42,
      shiftKey: true,
    });
    fireEvent.pointerUp(pageB, {
      clientX: 320,
      clientY: 150,
      pointerId: 42,
      shiftKey: true,
    });

    fireEvent.click(await screen.findByRole("button", { name: "合并页面" }));

    await waitFor(() => {
      const state = getCanvasState();
      const groups = Object.values(state.pageGroups ?? {});
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({
        kind: "page-group",
        activePageId: "page_1",
        layout: {
          x: 100,
          y: 100,
          width: 100,
          height: 100,
        },
      });
      expect(groups[0].pages.map((entry) => entry.pageId)).toEqual([
        "page_1",
        "page_2",
      ]);
      expect(state.hiddenPageIds).toEqual(["page_1", "page_2"]);
      expect(state.pages.page_1).toEqual({ x: 100, y: 100, width: 100, height: 100 });
      expect(state.pages.page_2).toEqual({ x: 300, y: 130, width: 100, height: 100 });
    });

    const groupElement = container.querySelector("[data-page-group-id]") as HTMLElement;
    expect(groupElement).toHaveStyle({
      left: "100px",
      top: "100px",
      width: "100px",
      height: "100px",
    });

    fireEvent.click(screen.getByRole("button", { name: "折叠页面目录" }));

    await waitFor(() => {
      const group = Object.values(getCanvasState().pageGroups ?? {})[0];
      expect(group.directoryCollapsed).toBe(true);
    });
    expect(
      screen.getByRole("button", { name: /展开页面目录/ }),
    ).toHaveTextContent("2");
  });

  it("页面组目录切换和拖拽缩放只更新页面组布局", async () => {
    const { container } = render(<TestMultiPageEditorCanvas />);
    const pageA = container.querySelector("[data-page-id='page_1']") as HTMLElement;
    const pageB = container.querySelector("[data-page-id='page_2']") as HTMLElement;
    Object.defineProperty(pageA, "getBoundingClientRect", {
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
    Object.defineProperty(pageB, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 300,
        top: 130,
        right: 400,
        bottom: 230,
        width: 100,
        height: 100,
        x: 300,
        y: 130,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(pageA, {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 43,
    });
    fireEvent.pointerUp(pageA, {
      clientX: 120,
      clientY: 120,
      pointerId: 43,
    });
    await waitFor(() => {
      expect(
        container.querySelector(
          "[data-page-id='page_1'] [data-canvas-selection-box='true']",
        ),
      ).toBeInTheDocument();
    });
    fireEvent.pointerDown(pageB, {
      button: 0,
      clientX: 320,
      clientY: 150,
      pointerId: 44,
      shiftKey: true,
    });
    fireEvent.pointerUp(pageB, {
      clientX: 320,
      clientY: 150,
      pointerId: 44,
      shiftKey: true,
    });
    fireEvent.click(await screen.findByRole("button", { name: "合并页面" }));

    fireEvent.click(await screen.findByRole("button", { name: "页面二" }));

    await waitFor(() => {
      const group = Object.values(getCanvasState().pageGroups ?? {})[0];
      expect(group.activePageId).toBe("page_2");
    });

    const groupElement = await waitFor(() => {
      const element = container.querySelector("[data-page-group-id]") as HTMLElement | null;
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });

    Object.defineProperty(groupElement, "getBoundingClientRect", {
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

    fireEvent.pointerDown(groupElement, {
      button: 0,
      clientX: 200,
      clientY: 180,
      pointerId: 45,
    });
    fireEvent.pointerMove(groupElement, {
      clientX: 230,
      clientY: 205,
      pointerId: 45,
    });
    fireEvent.pointerUp(groupElement, {
      clientX: 230,
      clientY: 205,
      pointerId: 45,
    });

    await waitFor(() => {
      const state = getCanvasState();
      const group = Object.values(state.pageGroups ?? {})[0];
      expect(group.layout).toMatchObject({ x: 130, y: 125, width: 100, height: 100 });
      expect(state.pages.page_1).toEqual({ x: 100, y: 100, width: 100, height: 100 });
      expect(state.pages.page_2).toEqual({ x: 300, y: 130, width: 100, height: 100 });
    });

    fireEvent.pointerMove(groupElement, {
      clientX: 198,
      clientY: 150,
      pointerId: 46,
    });
    fireEvent.pointerDown(groupElement, {
      button: 0,
      clientX: 198,
      clientY: 150,
      pointerId: 46,
    });
    fireEvent.pointerMove(groupElement, {
      clientX: 238,
      clientY: 150,
      pointerId: 46,
    });
    fireEvent.pointerUp(groupElement, {
      clientX: 238,
      clientY: 150,
      pointerId: 46,
    });

    await waitFor(() => {
      const state = getCanvasState();
      const group = Object.values(state.pageGroups ?? {})[0];
      expect(group.layout.width).toBe(140);
      expect(state.pages.page_1).toEqual({ x: 100, y: 100, width: 100, height: 100 });
      expect(state.pages.page_2).toEqual({ x: 300, y: 130, width: 100, height: 100 });
    });
  });

  it("文字工具在画布目标位置点击后创建文字节点", async () => {
    const user = userEvent.setup();
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
        color: "#ffffff",
        autoWidth: true,
        layout: {
          x: 520,
          y: 400,
          width: 18,
          height: 25,
        },
      });
      expect(nodes[0]).not.toHaveProperty("backgroundColor");
    });
    expect(screen.getByLabelText("编辑文字")).toHaveFocus();
    expect(screen.getByLabelText("文字属性")).toBeInTheDocument();
    expect(screen.getByLabelText("编辑文字")).not.toHaveAttribute("placeholder");
    expect(
      container.querySelector("[data-canvas-node-id] [data-canvas-selection-box='true']"),
    ).toBeInTheDocument();

    await user.keyboard("hello world");

    await waitFor(() => {
      const nodes = Object.values(getCanvasState().nodes ?? {});
      expect(nodes[0]).toMatchObject({
        kind: "text",
        title: "hello world",
        text: "hello world",
      });
      expect(nodes[0].layout.width).toBeGreaterThan(18);
      expect(nodes[0].layout.height).toBe(25);
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

  it("文字节点缩放高度不能小于当前文本内容高度", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_1']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    Object.defineProperty(textNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 100,
        right: 340,
        bottom: 180,
        width: 240,
        height: 80,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 220,
      clientY: 179,
      pointerId: 11,
    });
    fireEvent.pointerMove(textNode, {
      clientX: 220,
      clientY: 120,
      pointerId: 11,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 220,
      clientY: 120,
      pointerId: 11,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.nodes?.text_1.layout.height).toBe(60);
    });
  });

  it("文字节点缩放宽度最小为一个字宽度并按当前宽度提高最小高度", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_2']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    Object.defineProperty(textNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 420,
        top: 100,
        right: 660,
        bottom: 140,
        width: 240,
        height: 40,
        x: 420,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 659,
      clientY: 120,
      pointerId: 12,
    });
    fireEvent.pointerMove(textNode, {
      clientX: 430,
      clientY: 120,
      pointerId: 12,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 430,
      clientY: 120,
      pointerId: 12,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.nodes?.text_2.layout.width).toBe(18);
      expect(state.nodes?.text_2.layout.height).toBe(49);
    });
  });

  it("选中文字节点时光标位于文本末尾", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_2']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 430,
      clientY: 110,
      pointerId: 18,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 430,
      clientY: 110,
      pointerId: 18,
    });
    expect(container.querySelector("textarea")).not.toBeInTheDocument();
    fireEvent.doubleClick(textNode);

    await waitFor(() => {
      const textArea = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(textArea.selectionStart).toBe(textArea.value.length);
      expect(textArea.selectionEnd).toBe(textArea.value.length);
    });
  });

  it("选择工具框选文本节点时只选中文本框不进入编辑", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    dragMarquee(root, { clientX: 410, clientY: 90 }, { clientX: 670, clientY: 150 });

    await waitFor(() => {
      expect(
        container.querySelector(
          "[data-canvas-node-id='text_2'] [data-canvas-selection-box='true']",
        ),
      ).toBeInTheDocument();
    });
    expect(container.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("选中文本节点后拖拽文本框内部可以移动节点", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_2']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    Object.defineProperty(textNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 420,
        top: 100,
        right: 660,
        bottom: 140,
        width: 240,
        height: 40,
        x: 420,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 520,
      clientY: 120,
      pointerId: 19,
    });
    fireEvent.pointerMove(textNode, {
      clientX: 550,
      clientY: 145,
      pointerId: 19,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 550,
      clientY: 145,
      pointerId: 19,
    });

    await waitFor(() => {
      expect(getCanvasState().nodes?.text_2.layout).toMatchObject({
        x: 450,
        y: 125,
        width: 240,
        height: 40,
      });
    });
  });

  it("文字节点按当前宽度下的中文实际换行限制最小高度", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_4']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    Object.defineProperty(textNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 340,
        right: 190,
        bottom: 460,
        width: 90,
        height: 120,
        x: 100,
        y: 340,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 145,
      clientY: 459,
      pointerId: 15,
    });
    fireEvent.pointerMove(textNode, {
      clientX: 145,
      clientY: 380,
      pointerId: 15,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 145,
      clientY: 380,
      pointerId: 15,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.nodes?.text_4.layout.height).toBe(73);
    });
  });

  it("文字节点拖拽四角时等比例缩放文本框和字号", async () => {
    const { container } = render(<TestTextNodeEditorCanvas />);
    const textNode = container.querySelector(
      "[data-canvas-node-id='text_2']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    Object.defineProperty(textNode, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 420,
        top: 100,
        right: 660,
        bottom: 140,
        width: 240,
        height: 40,
        x: 420,
        y: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(textNode, {
      button: 0,
      clientX: 659,
      clientY: 139,
      pointerId: 16,
    });
    fireEvent.pointerMove(textNode, {
      clientX: 779,
      clientY: 159,
      pointerId: 16,
    });
    fireEvent.pointerUp(textNode, {
      clientX: 779,
      clientY: 159,
      pointerId: 16,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.nodes?.text_2.layout.width).toBe(360);
      expect(state.nodes?.text_2.layout.height).toBe(60);
      expect(state.nodes?.text_2.kind === "text" ? state.nodes.text_2.fontSize : undefined).toBe(27);
    });
  });

  it("文字节点持续输入时自动增高而不是出现滚动条", async () => {
    const user = userEvent.setup();
    render(<TestTextNodeEditorCanvas />);
    const nodeElement = document.querySelector(
      "[data-canvas-node-id='text_3']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    fireEvent.pointerDown(nodeElement, {
      button: 0,
      clientX: 110,
      clientY: 250,
      pointerId: 13,
    });
    fireEvent.pointerUp(nodeElement, {
      clientX: 110,
      clientY: 250,
      pointerId: 13,
    });
    fireEvent.doubleClick(nodeElement);

    const textNode = await screen.findByLabelText("编辑文字");
    await user.click(textNode);
    await user.keyboard("第一行{Enter}第二行{Enter}第三行");

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.nodes?.text_3.layout.height).toBeGreaterThan(25);
    });
    expect(textNode).toHaveStyle({ overflow: "hidden" });
  });

  it("文字节点删除行后自动缩小高度", async () => {
    render(<TestTextNodeEditorCanvas />);
    const nodeElement = document.querySelector(
      "[data-canvas-node-id='text_3']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    fireEvent.pointerDown(nodeElement, {
      button: 0,
      clientX: 110,
      clientY: 250,
      pointerId: 17,
    });
    fireEvent.pointerUp(nodeElement, {
      clientX: 110,
      clientY: 250,
      pointerId: 17,
    });
    fireEvent.doubleClick(nodeElement);

    const textNode = await screen.findByLabelText("编辑文字");
    fireEvent.change(textNode, {
      target: { value: "line one\nline two\nline three" },
    });

    await waitFor(() => {
      expect(getCanvasState().nodes?.text_3.layout.height).toBe(98);
    });

    fireEvent.change(textNode, {
      target: { value: "line one\nline two" },
    });

    await waitFor(() => {
      expect(getCanvasState().nodes?.text_3.layout.height).toBe(49);
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

  it("白色描边的当前配置页面仍可显示缩放光标并调整页面框尺寸", async () => {
    const { container } = render(<TestEditorCanvas editingPageId="page_1" />);
    const page = container.querySelector("[data-page-id='page_1']") as HTMLElement;
    Object.defineProperty(page, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 120,
        right: 475,
        bottom: 932,
        width: 375,
        height: 812,
        x: 100,
        y: 120,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(page, {
      button: 0,
      clientX: 220,
      clientY: 300,
      pointerId: 2,
    });
    fireEvent.pointerUp(page, {
      clientX: 220,
      clientY: 300,
      pointerId: 2,
    });

    fireEvent.pointerMove(page, {
      clientX: 475,
      clientY: 500,
      pointerId: 2,
    });

    await waitFor(() => {
      expect(page.style.cursor).toBe("ew-resize");
    });

    const resizeHandle = await waitFor(() => {
      const handle = container.querySelector(
        "[data-page-id='page_1'] [data-resize-handle='se']",
      ) as HTMLElement | null;
      expect(handle).not.toBeNull();
      return handle as HTMLElement;
    });

    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      clientX: 475,
      clientY: 932,
      pointerId: 3,
    });
    fireEvent.pointerMove(page, {
      clientX: 525,
      clientY: 982,
      pointerId: 3,
    });
    fireEvent.pointerUp(page, {
      clientX: 525,
      clientY: 982,
      pointerId: 3,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.pages.page_1.width).toBeGreaterThan(375);
      expect(state.pages.page_1.height).toBeGreaterThan(812);
      expect(state.pages.page_1.sizeMode).toBe("custom");
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

  it("editor 首次进入画布时适应屏幕，后续重新进入不重置用户缩放", async () => {
    render(<TestEditorCanvasWithFirstEntryFit />);

    fireEvent.click(screen.getByText("显示画布"));

    const expected = getExpectedFitViewport();
    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport.zoom).toBeCloseTo(expected.zoom, 5);
      expect(state.viewport.x).toBeCloseTo(expected.x, 5);
      expect(state.viewport.y).toBeCloseTo(expected.y, 5);
      expect(screen.getByTestId("fit-to-screen-on-mount")).toHaveTextContent(
        "false",
      );
    });

    fireEvent.click(screen.getByLabelText("放大"));

    let zoomAfterManualChange = expected.zoom;
    await waitFor(() => {
      zoomAfterManualChange = getCanvasState().viewport.zoom;
      expect(zoomAfterManualChange).toBeGreaterThan(expected.zoom);
    });

    fireEvent.click(screen.getByText("隐藏画布"));
    fireEvent.click(screen.getByText("显示画布"));

    await waitFor(() => {
      expect(getCanvasState().viewport.zoom).toBeCloseTo(
        zoomAfterManualChange,
        5,
      );
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

  it("editor 抓手工具左键拖动只平移画布视口", async () => {
    const { container } = render(<TestEditorCanvas />);
    const root = container.querySelector("[data-canvas-root='true']") as HTMLElement;

    fireEvent.click(screen.getByLabelText("拖动工具"));

    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 9,
    });
    fireEvent.pointerMove(root, {
      clientX: 140,
      clientY: 125,
      pointerId: 9,
    });
    fireEvent.pointerUp(root, {
      clientX: 140,
      clientY: 125,
      pointerId: 9,
    });

    await waitFor(() => {
      const state = getCanvasState();
      expect(state.viewport).toMatchObject({ x: 80, y: 65, zoom: 0.5 });
      expect(state.pages.page_1).toEqual({
        x: 100,
        y: 120,
        width: 375,
        height: 812,
      });
    });
  });

  it("默认不挂载结构化图层和 Excalidraw 标注验证层", () => {
    const { container } = render(<TestEditorCanvas />);

    expect(container.querySelector("[data-structured-graph-layer='true']")).toBeNull();
    expect(container.querySelector("[data-excalidraw-spike-layer='true']")).toBeNull();
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

  it("支持 Shift 多选文档节点并合并为聚合文档节点", async () => {
    const { container } = render(<TestEditorCanvasWithKnowledgeDocuments />);
    const docA = container.querySelector(
      "[data-canvas-node-id='doc_a']",
    ) as HTMLElement;
    const docB = container.querySelector(
      "[data-canvas-node-id='doc_b']",
    ) as HTMLElement;

    fireEvent.click(screen.getByLabelText("选择工具"));
    fireEvent.pointerDown(docA, {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 31,
    });
    fireEvent.pointerUp(docA, {
      clientX: 120,
      clientY: 120,
      pointerId: 31,
    });
    fireEvent.pointerDown(docB, {
      button: 0,
      clientX: 580,
      clientY: 140,
      pointerId: 32,
      shiftKey: true,
    });
    fireEvent.pointerUp(docB, {
      clientX: 580,
      clientY: 140,
      pointerId: 32,
      shiftKey: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "合并文档" }));

    await waitFor(() => {
      const state = getCanvasState();
      const nodes = Object.values(state.nodes ?? {});
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: "document",
        title: "文档 A 等 2 个文档",
        activeDocumentId: documentA.id,
        layout: {
          x: 100,
          y: 100,
          width: 880,
          height: 420,
        },
      });
      expect(nodes[0].kind === "document" ? nodes[0].documents : []).toEqual([
        { id: documentA.id, title: documentA.title, knowledgeDocument: documentA },
        { id: documentB.id, title: documentB.title, knowledgeDocument: documentB },
      ]);
      expect(state.hiddenKnowledgeDocumentIds).toEqual([
        documentA.id,
        documentB.id,
      ]);
    });
  });

  it("聚合文档节点支持通过左侧目录切换当前文档", async () => {
    render(<TestEditorCanvasWithKnowledgeDocuments aggregate />);

    await waitFor(() => {
      expect(screen.getByText("Alpha content")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: documentB.title }));

    await waitFor(() => {
      const state = getCanvasState();
      const node = state.nodes?.doc_group;
      expect(node?.kind === "document" ? node.activeDocumentId : "").toBe(
        documentB.id,
      );
      expect(screen.getByText("Beta content")).toBeInTheDocument();
    });
  });

  it("画布只读取可见文档正文，离屏文档不抢占首屏资源", async () => {
    const onReadKnowledgeDocument = jest
      .fn<Promise<string>, [CanvasKnowledgeDocument]>()
      .mockImplementation(async (document) => `# ${document.title}`);

    render(
      <TestEditorCanvasWithOffscreenKnowledgeDocuments
        onReadKnowledgeDocument={onReadKnowledgeDocument}
      />,
    );

    await waitFor(() => {
      expect(onReadKnowledgeDocument).toHaveBeenCalledWith(documentA);
    });
    expect(onReadKnowledgeDocument).not.toHaveBeenCalledWith(documentB);
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
