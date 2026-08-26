import { describe, expect, it } from "vitest";

import { arePreviewPanelPropsEqual } from "./PreviewPanel";
import type { PreviewPanelProps } from "./types";

describe("PreviewPanel visual edit memo boundary", () => {
  const baseProps: PreviewPanelProps = {
    compiledJsUrl: "/preview/module.js",
    visualEditMode: true,
  };

  it("选中节点变化时允许重新渲染并下发 iframe 状态", () => {
    expect(
      arePreviewPanelPropsEqual(baseProps, {
        ...baseProps,
        selectedVisualNodeId: "div:nth-of-type(1)>button:nth-of-type(1)",
      }),
    ).toBe(false);
  });

  it("清空选中节点时允许重新渲染并下发 null 状态", () => {
    const selectedProps: PreviewPanelProps = {
      ...baseProps,
      selectedVisualNodeId: "div:nth-of-type(1)>button:nth-of-type(1)",
    };

    expect(
      arePreviewPanelPropsEqual(selectedProps, {
        ...selectedProps,
        selectedVisualNodeId: null,
      }),
    ).toBe(false);
  });

  it("其余可视化编辑状态变化也不会被 memo 吞掉", () => {
    expect(
      arePreviewPanelPropsEqual(baseProps, {
        ...baseProps,
        visualHoverNodeId: "div:nth-of-type(1)",
      }),
    ).toBe(false);
  });
});
