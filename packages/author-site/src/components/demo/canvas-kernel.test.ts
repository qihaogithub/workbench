import {
  getAnnotationsFromCanvasState,
  normalizeCanvasStateLayers,
  routeCanvasPointerLayer,
  screenPointToCanvasPoint,
  withCanvasAnnotationNodes,
} from "@workbench/demo-ui";
import type { CanvasFreeNode, CanvasState } from "@workbench/demo-ui";

describe("Canvas Kernel 插件化基础能力", () => {
  it("将旧 nodes 迁移到 annotations 图层并保持旧字段兼容", () => {
    const node: CanvasFreeNode = {
      id: "text_1",
      kind: "text",
      title: "说明",
      text: "说明",
      fontSize: 16,
      color: "#111827",
      layout: { x: 10, y: 20, width: 180, height: 80 },
      createdAt: 1,
      updatedAt: 1,
    };
    const state: CanvasState = {
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: {},
      nodes: { text_1: node },
    };

    const normalized = normalizeCanvasStateLayers(state);

    expect(normalized.nodes).toEqual({ text_1: node });
    expect(normalized.layers?.annotations?.nodes).toEqual({ text_1: node });
    expect(getAnnotationsFromCanvasState(normalized)).toEqual({ text_1: node });
  });

  it("更新 annotations 图层时同步写回旧 nodes 字段", () => {
    const node: CanvasFreeNode = {
      id: "text_1",
      kind: "text",
      title: "说明",
      text: "说明",
      fontSize: 16,
      color: "#111827",
      layout: { x: 0, y: 0, width: 120, height: 120 },
      createdAt: 1,
      updatedAt: 1,
    };

    const next = withCanvasAnnotationNodes(
      { viewport: { x: 0, y: 0, zoom: 1 }, pages: {} },
      { text_1: node },
    );

    expect(next.nodes?.text_1).toBe(node);
    expect(next.layers?.annotations?.nodes?.text_1).toBe(node);
  });

  it("按工具态路由 pointer 事件优先级", () => {
    expect(routeCanvasPointerLayer({ toolMode: "hand", hitPage: true })).toBe("kernel");
    expect(routeCanvasPointerLayer({ toolMode: "select", hitPage: true })).toBe("page-preview");
    expect(routeCanvasPointerLayer({ toolMode: "text", hitPage: true })).toBe("free-annotation");
    expect(routeCanvasPointerLayer({ toolMode: "select", isOverlayTarget: true })).toBe("overlay");
  });

  it("提供 viewport 坐标转换", () => {
    expect(
      screenPointToCanvasPoint(140, 90, { left: 20, top: 10 }, { x: 40, y: 20, zoom: 2 }),
    ).toEqual({ x: 40, y: 30 });
  });
});
