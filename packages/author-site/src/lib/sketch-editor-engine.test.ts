import { resolveSketchEditorEngine } from "./sketch-editor-engine";

describe("resolveSketchEditorEngine", () => {
  it("OpenPencil 开启时在单页手绘编辑态选择 openpencil", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("openpencil");
  });

  it("OpenPencil 关闭时在单页手绘编辑态回退到 native", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: false,
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("项目偏好 native 会覆盖已开启的 OpenPencil 开关", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        enginePreference: "native",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("项目偏好 openpencil 仍受全局开关保护", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: false,
        enginePreference: "openpencil",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("没有项目偏好时使用用户级偏好", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        userEnginePreference: "native",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("项目偏好优先于用户级偏好", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        enginePreference: "openpencil",
        userEnginePreference: "native",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("openpencil");
  });

  it("非手绘编辑态不选择任何手绘 SDK", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        previewMode: "single",
        runtimeType: "prototype-html-css",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBeNull();
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: false,
        viewingDocument: false,
      }),
    ).toBeNull();
  });

  it("画布模式或文档预览时不挂载手绘编辑 SDK", () => {
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        previewMode: "canvas",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBeNull();
    expect(
      resolveSketchEditorEngine({
        openPencilEnabled: true,
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: true,
      }),
    ).toBeNull();
  });
});
