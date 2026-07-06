import {
  OPENPENCIL_ADAPTER_SOURCE,
  OPENPENCIL_EDITOR_MESSAGE_TYPES,
  createOpenPencilLoadDocumentMessage,
  createOpenPencilErrorMessage,
  createOpenPencilUiStateMessage,
  isOpenPencilEditorMessage,
  isOpenPencilHostMessage,
} from "@workbench/shared";

describe("OpenPencil adapter", () => {
  it("允许 load-document 携带图片代理地址", () => {
    const message = createOpenPencilLoadDocumentMessage({
      pageId: "page-1",
      scene: { version: 1, pageSize: { width: 100, height: 100 }, nodes: [] },
      configData: {},
      previewSize: { width: 100, height: 100 },
      imageProxyUrl: "http://localhost:3200/api/openpencil/image-proxy",
    });

    expect(message.imageProxyUrl).toContain("/api/openpencil/image-proxy");
    expect(isOpenPencilHostMessage(message)).toBe(true);
  });

  it("拒绝非字符串图片代理地址", () => {
    expect(
      isOpenPencilHostMessage({
        type: "openpencil-spike/load-document",
        pageId: "page-1",
        imageProxyUrl: 123,
      }),
    ).toBe(false);
  });

  it("构造并识别编辑器错误消息", () => {
    const message = createOpenPencilErrorMessage({
      pageId: "page-1",
      error: {
        code: "resource-load-failed",
        message: "CanvasKit wasm 加载失败",
        detail: "application/wasm expected",
        recoverable: true,
      },
    });

    expect(message).toEqual({
      type: OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR,
      source: OPENPENCIL_ADAPTER_SOURCE,
      pageId: "page-1",
      error: {
        code: "resource-load-failed",
        message: "CanvasKit wasm 加载失败",
        detail: "application/wasm expected",
        recoverable: true,
      },
    });
    expect(isOpenPencilEditorMessage(message)).toBe(true);
  });

  it("拒绝缺少可读错误文案的错误消息", () => {
    expect(
      isOpenPencilEditorMessage({
        type: OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR,
        source: OPENPENCIL_ADAPTER_SOURCE,
        error: { code: "runtime-error" },
      }),
    ).toBe(false);
  });

  it("允许 ui-state 携带错误态", () => {
    const message = createOpenPencilUiStateMessage({
      state: {
        bridgeStatus: "error",
        error: {
          code: "editor-initialization-failed",
          message: "手绘编辑器初始化失败",
          recoverable: true,
        },
        configKeyCount: 0,
        layerCount: 0,
        layers: [],
        selection: {
          count: 0,
          type: "-",
          current: "-",
        },
        inspector: {
          selectedNode: null,
        },
        commands: {
          duplicateSelection: false,
          deleteSelection: false,
          groupSelection: false,
          ungroupSelection: false,
          zoomToSelection: false,
          undo: false,
          redo: false,
        },
      },
    });

    expect(message.state?.bridgeStatus).toBe("error");
    expect(message.state?.error?.message).toContain("初始化失败");
    expect(isOpenPencilEditorMessage(message)).toBe(true);
  });
});
