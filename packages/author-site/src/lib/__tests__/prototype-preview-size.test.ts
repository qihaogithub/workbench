import { getPrototypePreviewSize } from "../prototype-preview-size";

describe("getPrototypePreviewSize", () => {
  it("从 prototype.meta.json 的 previewSize 读取原型页尺寸", () => {
    expect(
      getPrototypePreviewSize({
        previewSize: {
          width: 375,
          height: 812,
        },
      }),
    ).toEqual({ width: 375, height: 812 });
  });

  it("兼容历史顶层 width 和 height", () => {
    expect(getPrototypePreviewSize({ width: 390, height: 844 })).toEqual({
      width: 390,
      height: 844,
    });
  });
});
