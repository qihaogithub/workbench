import type { AppGraph } from "@workbench/shared";

import {
  isViewerAppActionResolution,
  resolveViewerAppAction,
} from "../viewer-app-graph-runtime";

describe("viewer 应用图运行时", () => {
  const appGraph: AppGraph = {
    version: 1,
    entry: "home",
    pages: {
      home: { pageId: "home_1234", title: "首页" },
      detail: { pageId: "detail_1234", title: "详情页" },
    },
    actions: [
      {
        from: "home",
        event: "viewDetail",
        to: "detail",
        params: ["productId"],
        setState: {
          selectedProductId: "$params.productId",
          previousStep: "$state.currentStep",
        },
      },
    ],
    state: {},
  };

  it("根据 APP_ACTION 的 pageId 与 event 解析目标页面、参数和运行时状态", () => {
    const result = resolveViewerAppAction({
      appGraph,
      pages: [
        { id: "home_1234", routeKey: "home" },
        { id: "detail_1234", routeKey: "detail" },
      ],
      message: {
        pageId: "home_1234",
        event: "viewDetail",
        payload: { productId: "sku-1", ignored: true },
      },
      previousState: { currentStep: "home" },
    });

    expect(isViewerAppActionResolution(result)).toBe(true);
    if (!isViewerAppActionResolution(result)) return;
    expect(result.targetPageId).toBe("detail_1234");
    expect(result.routeParams).toEqual({ productId: "sku-1" });
    expect(result.nextState).toEqual({
      currentStep: "home",
      selectedProductId: "sku-1",
      previousStep: "home",
    });
  });

  it("未声明 action 时返回可诊断错误，不执行切页", () => {
    const result = resolveViewerAppAction({
      appGraph,
      pages: [{ id: "home_1234", routeKey: "home" }],
      message: { pageId: "home_1234", event: "unknownEvent", payload: {} },
      previousState: {},
    });

    expect(result).toEqual({
      error: "ACTION_MISSING",
      routeKey: "home",
      event: "unknownEvent",
    });
  });
});
