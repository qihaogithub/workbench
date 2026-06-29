import { extractPreviewSize } from "../preview-size";

describe("preview size", () => {
  it("从 config.schema.json 的 $demo.previewSize 读取预览尺寸", () => {
    const schema = JSON.stringify({
      type: "object",
      $demo: {
        previewSize: {
          width: 1024,
          height: 768,
          minHeight: "640px",
          maxHeight: 1200,
          scale: "0.75",
        },
      },
      properties: {},
    });

    expect(extractPreviewSize(schema)).toEqual({
      width: 1024,
      height: 768,
      minHeight: "640px",
      maxHeight: 1200,
      scale: 0.75,
    });
  });

  it("忽略缺失或非法的 previewSize", () => {
    expect(extractPreviewSize(JSON.stringify({ type: "object" }))).toBeUndefined();
    expect(
      extractPreviewSize(JSON.stringify({ $demo: { previewSize: null } })),
    ).toBeUndefined();
    expect(
      extractPreviewSize(JSON.stringify({ $demo: { previewSize: [] } })),
    ).toBeUndefined();
    expect(extractPreviewSize("{")).toBeUndefined();
  });
});
