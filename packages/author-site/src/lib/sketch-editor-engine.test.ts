import { resolveSketchEditorEngine } from "./sketch-editor-engine";

describe("resolveSketchEditorEngine", () => {
  it("单页手绘编辑态选择自研 SDK", () => {
    expect(
      resolveSketchEditorEngine({
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("项目偏好 native 保持自研 SDK", () => {
    expect(
      resolveSketchEditorEngine({
        enginePreference: "native",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("没有项目偏好时使用用户级 native 偏好", () => {
    expect(
      resolveSketchEditorEngine({
        userEnginePreference: "native",
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBe("native");
  });

  it("非手绘编辑态不选择任何手绘 SDK", () => {
    expect(
      resolveSketchEditorEngine({
        previewMode: "single",
        runtimeType: "prototype-html-css",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBeNull();
    expect(
      resolveSketchEditorEngine({
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
        previewMode: "canvas",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: false,
      }),
    ).toBeNull();
    expect(
      resolveSketchEditorEngine({
        previewMode: "single",
        runtimeType: "sketch-scene",
        sketchEditing: true,
        viewingDocument: true,
      }),
    ).toBeNull();
  });
});
