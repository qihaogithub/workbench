import { extractPreviewSize } from "../preview-size";

describe("preview size", () => {
  it("从 config.schema.json 的 $demo.presentation.viewport 读取预览尺寸", () => {
    const schema = JSON.stringify({
      type: "object",
      $demo: {
        presentation: {
          version: 1,
          mode: "responsive-page",
          viewport: { width: 1024, height: 768 },
          heightBehavior: "content",
          preset: "custom",
          source: "user",
        },
      },
      properties: {},
    });

    expect(extractPreviewSize(schema)).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("忽略缺失或非法的 presentation", () => {
    expect(extractPreviewSize(JSON.stringify({ type: "object" }))).toBeUndefined();
    expect(
      extractPreviewSize(JSON.stringify({ $demo: { presentation: null } })),
    ).toBeUndefined();
    expect(
      extractPreviewSize(JSON.stringify({ $demo: { presentation: [] } })),
    ).toBeUndefined();
    expect(extractPreviewSize("{")).toBeUndefined();
  });
});
