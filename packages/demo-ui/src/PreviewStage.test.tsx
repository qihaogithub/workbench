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
  SinglePagePreview: ({ page }: { page?: PreviewStagePage }) => (
    <div data-testid="single-preview">
      {page?.id}:{page?.previewSize?.width}
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
      $demo: { previewSize: { width: 1024, height: 768 } },
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
  it("渲染规范化后的单页并发出受控切换请求", () => {
    const { onActivePageChange, onPreviewModeChange } = renderStage();

    expect(screen.getByTestId("single-preview")).toHaveTextContent(
      "page-b:1024",
    );
    fireEvent.change(screen.getByLabelText("选择预览页面"), {
      target: { value: "page-a" },
    });
    expect(onActivePageChange).toHaveBeenCalledWith("page-a");

    fireEvent.click(screen.getByRole("button", { name: "画布" }));
    expect(onPreviewModeChange).toHaveBeenCalledWith("canvas");
    expect(screen.getByTestId("single-preview")).toBeInTheDocument();
  });

  it.each(["readonly", "viewer", "editor"] as const)(
    "画布接收同一份规范化尺寸和 %s 交互模式",
    (interactionMode) => {
      renderStage({ previewMode: "canvas", interactionMode });
      const canvas = screen.getByTestId("preview-canvas");
      expect(canvas).toHaveAttribute("data-width", "1024");
      expect(canvas).toHaveAttribute("data-mode", interactionMode);
    },
  );

  it("活动页缺失时保留受控值并渲染空单页", () => {
    renderStage({ activePageId: "missing-page" });

    expect(screen.getByTestId("single-preview")).toHaveTextContent(":");
    expect(
      screen.getByLabelText("选择预览页面"),
    ).toHaveValue("");
  });

  it("renderSingleContent 返回 undefined 时回退默认单页", () => {
    renderStage({ renderSingleContent: () => undefined });

    expect(screen.getByTestId("single-preview")).toHaveTextContent(
      "page-b:1024",
    );
  });

  it("画布模式不渲染默认单页内容", () => {
    renderStage({ previewMode: "canvas" });
    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-width", "1024");
    expect(screen.queryByTestId("single-preview")).not.toBeInTheDocument();
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
