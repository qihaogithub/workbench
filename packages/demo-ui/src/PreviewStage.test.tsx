import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewStage } from "./PreviewStage";
import type { PreviewStagePage } from "./preview-stage-types";

vi.mock("./PreviewCanvas", () => ({
  PreviewCanvas: ({
    pages,
    interactionMode,
  }: {
    pages: PreviewStagePage[];
    interactionMode: string;
  }) => (
    <div
      data-testid="preview-canvas"
      data-width={pages[0]?.previewSize?.width}
      data-mode={interactionMode}
    />
  ),
}));

vi.mock("./SinglePagePreview", () => ({
  SinglePagePreview: ({
    page,
    onRequestPasteHtmlContent,
  }: {
    page?: PreviewStagePage;
    onRequestPasteHtmlContent?: (html: string) => void;
  }) => (
    <div
      data-testid="single-preview"
      data-has-html-paste-handler={String(Boolean(onRequestPasteHtmlContent))}
    >
      {page?.id}:{page?.presentation?.viewport.width ?? page?.previewSize?.width}
    </div>
  ),
}));

const pages: PreviewStagePage[] = [
  {
    id: "page-b",
    name: "页面 B",
    order: 2,
    runtimeType: "high-fidelity-react",
    code: "export default function B() {}",
    schema: JSON.stringify({
      $demo: { presentation: { version: 1, mode: "responsive-page", viewport: { width: 1024, height: 768 }, heightBehavior: "content", preset: "custom", source: "user" } },
    }),
  },
  {
    id: "page-a",
    name: "页面 A",
    order: 1,
    runtimeType: "high-fidelity-react",
    code: "export default function A() {}",
  },
];

function renderStage(
  overrides: Partial<React.ComponentProps<typeof PreviewStage>> = {},
) {
  const onActivePageChange = vi.fn();
  const onPreviewModeChange = vi.fn();
  const onCanvasStateChange = vi.fn();
  render(
    <PreviewStage
      pages={pages}
      activePageId="page-b"
      onActivePageChange={onActivePageChange}
      previewMode="single"
      onPreviewModeChange={onPreviewModeChange}
      canvasState={{ pages: {}, viewport: { x: 0, y: 0, zoom: 1 } }}
      onCanvasStateChange={onCanvasStateChange}
      interactionMode="viewer"
      showDefaultPageSelector
      {...overrides}
    />,
  );
  return {
    onActivePageChange,
    onPreviewModeChange,
    onCanvasStateChange,
  };
}

describe("PreviewStage", () => {
  it("渲染规范化后的单页并支持页面选择", () => {
    const { onActivePageChange, onPreviewModeChange } = renderStage();

    expect(screen.getByTestId("single-preview")).toHaveTextContent(
      "page-b:1024",
    );
    fireEvent.change(screen.getByLabelText("选择预览页面"), {
      target: { value: "page-a" },
    });
    expect(onActivePageChange).toHaveBeenCalledWith("page-a");
    expect(onPreviewModeChange).not.toHaveBeenCalled();
  });

  it.each(["readonly", "viewer", "editor"] as const)(
    "画布接收同一份规范化尺寸和 %s 交互模式",
    async (interactionMode) => {
      renderStage({ previewMode: "canvas", interactionMode });
      const canvas = await screen.findByTestId("preview-canvas");
      expect(canvas).toHaveAttribute("data-width", "1024");
      expect(canvas).toHaveAttribute("data-mode", interactionMode);
    },
  );

  it("画布在页面 schema 尚未加载时仍使用已知的持久化尺寸", async () => {
    renderStage({
      previewMode: "canvas",
      pages: [
        {
          id: "pending-page",
          name: "待加载页面",
          order: 0,
          runtimeType: "high-fidelity-react",
          canvasPreviewSize: { width: 1920, height: 1080 },
        },
      ],
    });

    const canvas = await screen.findByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-width", "1920");
  });

  it("活动页缺失时保留受控值并渲染空单页", () => {
    renderStage({ activePageId: "missing-page" });

    expect(screen.getByTestId("single-preview")).toHaveTextContent(":");
    expect(
      screen.getByLabelText("选择预览页面"),
    ).toHaveValue("");
  });

  it("把画布 HTML 导入回调复用到单页预览", () => {
    renderStage({
      canvasProps: { onRequestPasteHtmlContent: vi.fn() },
    });

    expect(screen.getByTestId("single-preview")).toHaveAttribute(
      "data-has-html-paste-handler",
      "true",
    );
  });

  it("renderSingleContent 返回 undefined 时回退默认单页", () => {
    renderStage({ renderSingleContent: () => undefined });

    expect(screen.getByTestId("single-preview")).toHaveTextContent(
      "page-b:1024",
    );
  });

  it("画布模式不渲染默认单页内容", async () => {
    renderStage({ previewMode: "canvas" });
    const canvas = await screen.findByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-width", "1024");
    expect(screen.queryByTestId("single-preview")).not.toBeInTheDocument();
  });

  it("文档模式不挂载画布", () => {
    renderStage({ previewMode: "document" });

    expect(screen.getByTestId("single-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-canvas")).not.toBeInTheDocument();
  });

  it.each([
    ["ArrowLeft", "page-b", "page-a"],
    ["ArrowRight", "page-a", "page-b"],
  ] as const)(
    "在单页模式按 %s 时按页面顺序切换",
    (key, activePageId, expectedPageId) => {
      const { onActivePageChange } = renderStage({ activePageId });

      fireEvent.keyDown(window, { key });

      expect(onActivePageChange).toHaveBeenCalledWith(expectedPageId);
    },
  );

  it("使用宿主的单页切换处理器，并忽略编辑中的方向键", () => {
    const onSinglePagePrevious = vi.fn();
    const onSinglePageNext = vi.fn();
    renderStage({ onSinglePagePrevious, onSinglePageNext });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(document.body.appendChild(document.createElement("input")), {
      key: "ArrowLeft",
    });

    expect(onSinglePagePrevious).toHaveBeenCalledTimes(1);
    expect(onSinglePageNext).toHaveBeenCalledTimes(1);
  });

  it("在单页编辑工具栏中将连线工具置于宿主尾部控件之前", () => {
    renderStage({
      interactionMode: "editor",
      toolbarTrailing: <button type="button">自定义</button>,
    });

    const connectorTool = screen.getByRole("button", {
      name: "绘制页面跳转热区",
    });
    const customControl = screen.getByRole("button", { name: "自定义" });

    expect(
      connectorTool.compareDocumentPosition(customControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(connectorTool);
    expect(connectorTool).toHaveAttribute("aria-pressed", "true");
  });

  it("支持宿主 selector、toolbar 和单页内容覆盖", () => {
    renderStage({
      selectorSlot: <span>文档选择器</span>,
      toolbarTrailing: <button type="button">历史</button>,
      renderSingleContent: () => <div>文档内容</div>,
    });

    expect(screen.getByText("文档选择器")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "历史" })).toBeInTheDocument();
    expect(screen.getByText("文档内容")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("选择预览页面"),
    ).not.toBeInTheDocument();
  });
});
