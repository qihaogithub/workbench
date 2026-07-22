import { act, renderHook } from "@testing-library/react";
import { useVisualEditState } from "../hooks/useVisualEditState";
import type { VisualNodeInfo } from "@workbench/demo-ui";

const mockToast = jest.fn();

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

function createNode(overrides: Partial<VisualNodeInfo> = {}): VisualNodeInfo {
  return {
    nodeId: "node-1",
    domPath: "main > h1",
    tagName: "h1",
    textContent: "默认标题",
    className: "title",
    rect: { x: 0, y: 0, width: 120, height: 32 },
    attrs: {},
    computedStyle: {
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgba(0, 0, 0, 0)",
    },
    editCapabilities: ["text", "style"],
    ...overrides,
  };
}

function renderVisualEditState(
  overrides: Partial<Parameters<typeof useVisualEditState>[0]> = {},
) {
  let configDataMap: Record<string, Record<string, unknown>> = {};
  const setConfigDataMap = jest.fn(
    (
      updater:
        | Record<string, Record<string, unknown>>
        | ((
            previous: Record<string, Record<string, unknown>>,
          ) => Record<string, Record<string, unknown>>),
    ) => {
      configDataMap =
        typeof updater === "function" ? updater(configDataMap) : updater;
    },
  );
  const setTabValue = jest.fn();
  const setTriggerAutoSend = jest.fn();
  const applyDemoSnapshot = jest.fn();
  const markWorkspaceChanged = jest.fn();
  const params: Parameters<typeof useVisualEditState>[0] = {
    codeRef: { current: "export default function Demo() { return <h1>默认标题</h1>; }" },
    schemaRef: { current: "{}" },
    projectConfigSchema: "{}",
    activeDemoIdRef: { current: "page-1" },
    sessionId: "session-1",
    activeDemoId: "page-1",
    applyDemoSnapshot,
    markWorkspaceChanged,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend,
    isPrototypeVisualPage: () => false,
    ...overrides,
  };

  const hook = renderHook(() => useVisualEditState(params));
  return {
    ...hook,
    getConfigDataMap: () => configDataMap,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend,
    applyDemoSnapshot,
    markWorkspaceChanged,
  };
}

describe("useVisualEditState 智能属性写回", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("重复选择同一 DOM 路径时刷新节点文本与样式快照", () => {
    const view = renderVisualEditState();
    const first = createNode();
    const updated = createNode({
      textContent: "更新后的标题",
      computedStyle: {
        color: "rgb(220, 38, 38)",
        backgroundColor: "rgba(0, 0, 0, 0)",
      },
    });

    act(() => {
      view.result.current.handleVisualSelect(first);
      view.result.current.handleVisualSelect(updated);
    });

    expect(view.result.current.selectedVisualNode).toMatchObject({
      domPath: "main > h1",
      textContent: "更新后的标题",
      computedStyle: { color: "rgb(220, 38, 38)" },
    });
  });

  it("原型页页面级文本配置项可直接写回，不触发 AI", () => {
    const applyPrototypeVisualConfig = jest.fn(() => ({
      ok: true as const,
      html: "<h1 data-bind-text=\"title\">默认标题</h1>",
      schema: "{}",
      configPatch: { title: "默认标题" },
    }));
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => true,
      applyPrototypeVisualConfig,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleMarkVisualConfig(
        node,
        "textContent",
        "标题",
        "默认标题",
        "text",
      );
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 1,
      kind: "save",
      label: "保存",
    });

    act(() => {
      view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(applyPrototypeVisualConfig).toHaveBeenCalledTimes(1);
    expect(view.setTriggerAutoSend).not.toHaveBeenCalled();
    expect(view.getConfigDataMap()["page-1"]).toEqual({ title: "默认标题" });
    expect(view.result.current.visualPropertySubmission.status).toBe("sent");
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("原型页项目级配置项不阻断，自动转交 AI", () => {
    const applyPrototypeVisualConfig = jest.fn();
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => true,
      applyPrototypeVisualConfig,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleMarkVisualConfig(
        node,
        "textContent",
        "标题",
        "默认标题",
        "text",
      );
    });
    act(() => {
      const mark = view.result.current.visualConfigMarks[0];
      view.result.current.handleUpdateVisualConfigMark(mark.id, {
        scope: "project",
      });
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 1,
      kind: "send",
      label: "发送给AI",
    });

    act(() => {
      view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(applyPrototypeVisualConfig).not.toHaveBeenCalled();
    expect(view.setTabValue).toHaveBeenCalledWith("ai");
    expect(view.setTriggerAutoSend).toHaveBeenCalledTimes(1);
    const triggerArg = view.setTriggerAutoSend.mock.calls[0][0] as {
      hiddenPrompt: string;
    };
    expect(triggerArg.hiddenPrompt).toContain("项目级配置项");
    expect(triggerArg.hiddenPrompt).toContain(
      "原型页直接写回暂不支持项目级配置项",
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("原型页混合变更时直接写回支持项，剩余项进入 AI prompt", () => {
    const applyPrototypeVisualPropertyChange = jest.fn(() => true);
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => true,
      applyPrototypeVisualPropertyChange,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleVisualPropertyChange(
        node,
        "color",
        "颜色",
        "#ff0000",
        "style",
        "rgb(17, 24, 39)",
      );
      view.result.current.handleMarkVisualConfig(
        node,
        "gap",
        "元素间距",
        "12",
        "style",
      );
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 2,
      kind: "send",
      label: "发送给AI",
    });

    act(() => {
      view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(applyPrototypeVisualPropertyChange).toHaveBeenCalledTimes(1);
    const triggerArg = view.setTriggerAutoSend.mock.calls[0][0] as {
      hiddenPrompt: string;
    };
    expect(triggerArg.hiddenPrompt).toContain("已直接写回的原型页变更");
    expect(triggerArg.hiddenPrompt).toContain("颜色（style:color）已直接写回原型 HTML");
    expect(triggerArg.hiddenPrompt).toContain("原型页直接写回只支持文本、图片和颜色配置项");
  });

  it("原型页属性直接写回失败时进入 AI 兜底并保留原因", () => {
    const applyPrototypeVisualPropertyChange = jest.fn(() => false);
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => true,
      applyPrototypeVisualPropertyChange,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleVisualPropertyChange(
        node,
        "filter",
        "滤镜",
        "blur(4px)",
        "style",
        "无",
      );
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 1,
      kind: "send",
      label: "发送给AI",
    });

    act(() => {
      view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(view.setTabValue).toHaveBeenCalledWith("ai");
    const triggerArg = view.setTriggerAutoSend.mock.calls[0][0] as {
      hiddenPrompt: string;
    };
    expect(triggerArg.hiddenPrompt).toContain(
      "原型页属性无法直接写回，已准备交给 AI 处理",
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("高保真页快捷配置化失败时自动交给 AI", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: "无法在代码中唯一定位选中文本" },
      }),
    });
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => false,
    });
    const node = createNode();

    act(() => {
      view.result.current.initializeVisualConfigDialog(node);
    });
    await act(async () => {
      await view.result.current.handleApplyVisualConfig();
    });

    expect(view.setTabValue).toHaveBeenCalledWith("ai");
    expect(view.setTriggerAutoSend).toHaveBeenCalledTimes(1);
    expect(view.setTriggerAutoSend.mock.calls[0][0]).toContain(
      "直接写回已尝试但未成功",
    );
    expect(view.setTriggerAutoSend.mock.calls[0][0]).toContain(
      "无法在代码中唯一定位选中文本",
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("原型页已直接写回的普通属性显示保存", () => {
    const applyPrototypeVisualPropertyChange = jest.fn(() => true);
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => true,
      applyPrototypeVisualPropertyChange,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleVisualPropertyChange(
        node,
        "color",
        "颜色",
        "#ff0000",
        "style",
        "rgb(17, 24, 39)",
      );
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 1,
      kind: "save",
      label: "保存",
    });

    act(() => {
      view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(view.setTriggerAutoSend).not.toHaveBeenCalled();
    expect(view.result.current.visualPropertySubmission.status).toBe("sent");
  });

  it("高保真页普通属性修改显示发送给AI", () => {
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => false,
    });
    const node = createNode();

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.handleVisualPropertyChange(
        node,
        "color",
        "颜色",
        "#ff0000",
        "style",
        "rgb(17, 24, 39)",
      );
    });

    expect(view.result.current.visualDraftAction).toEqual({
      count: 1,
      kind: "send",
      label: "发送给AI",
    });
  });

  it("高保真页本地图片指令会先本地化选中图片再发送 AI", async () => {
    const remoteUrl = "https://r2-asset-worker.qihaogo.workers.dev/figma/h_e545eaf5.png";
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("浏览器跨域读取失败"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            assetId: "asset_7007557cac7e",
            contentHash: "7007557cac7e123",
            workspacePath: "assets/images/7007557cac7e-h_e545eaf5.png",
            relativePathFromPage: "../../assets/images/7007557cac7e-h_e545eaf5.png",
            editPreviewUrl:
              "/api/sessions/session-1/workspace/assets/images/7007557cac7e-h_e545eaf5.png",
            mimeType: "image/png",
            size: 142851,
            sourceType: "remote_url",
            originalUrl: remoteUrl,
          },
        }),
      });
    const view = renderVisualEditState({
      isPrototypeVisualPage: () => false,
    });
    const node = createNode({
      nodeId: "img-1",
      domPath: "img.deco-bg",
      tagName: "img",
      textContent: "",
      attrs: { src: remoteUrl, currentSrc: remoteUrl },
      editCapabilities: ["image"],
    });

    act(() => {
      view.result.current.handleVisualSelect(node);
      view.result.current.setVisualAiInstruction("改为本地图片");
    });

    await act(async () => {
      await view.result.current.handleSendVisualPropertiesToAI();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(remoteUrl);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
      "/api/sessions/session-1/assets/localize",
    );
    const localizeBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body,
    ) as {
      pageId?: string;
      source?: { src?: string; currentSrc?: string; domPath?: string };
    };
    expect(localizeBody.pageId).toBe("page-1");
    expect(localizeBody.source).toMatchObject({
      src: remoteUrl,
      currentSrc: remoteUrl,
      domPath: "img.deco-bg",
    });

    const triggerArg = view.setTriggerAutoSend.mock.calls[0][0] as {
      hiddenPrompt: string;
    };
    expect(triggerArg.hiddenPrompt).toContain("【已本地化资源】");
    expect(triggerArg.hiddenPrompt).toContain("../../assets/images/7007557cac7e-h_e545eaf5.png");
    expect(triggerArg.hiddenPrompt).toContain("不要再调用 saveImage 下载这个远程 URL");
    expect(triggerArg.hiddenPrompt).toContain("把选中图片 src 改为已本地化资源的页面引用路径");
  });
});
