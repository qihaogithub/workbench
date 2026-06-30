import {
  hasPreviewPageCode,
  resolvePreviewPageCode,
} from "../preview-page-code";

describe("preview-page-code", () => {
  it("优先使用目标页面自身已加载代码", () => {
    expect(
      resolvePreviewPageCode({
        pageId: "page-a",
        pageCodes: {
          "page-a": "export default function PageA() {}",
        },
        activeCodePageId: "page-b",
        activeCode: "export default function PageB() {}",
      }),
    ).toBe("export default function PageA() {}");
  });

  it("未加载的非当前代码归属页不应回退到活动编辑器代码", () => {
    expect(
      resolvePreviewPageCode({
        pageId: "page-b",
        pageCodes: {
          "page-a": "export default function PageA() {}",
        },
        activeCodePageId: "page-a",
        activeCode: "export default function PageA() {}",
      }),
    ).toBe("");
  });

  it("只有确认编辑器代码归属目标页时才允许回退", () => {
    expect(
      resolvePreviewPageCode({
        pageId: "page-a",
        pageCodes: {},
        activeCodePageId: "page-a",
        activeCode: "export default function PageA() {}",
      }),
    ).toBe("export default function PageA() {}");
  });

  it("空字符串代码是明确的未加载状态，不应被替换", () => {
    expect(
      resolvePreviewPageCode({
        pageId: "page-a",
        pageCodes: {
          "page-a": "",
        },
        activeCodePageId: "page-a",
        activeCode: "export default function PageA() {}",
      }),
    ).toBe("");
  });

  it("hasPreviewPageCode 只在解析到非空代码时返回 true", () => {
    expect(
      hasPreviewPageCode({
        pageId: "page-a",
        pageCodes: { "page-a": "" },
        activeCodePageId: "page-a",
        activeCode: "export default function PageA() {}",
      }),
    ).toBe(false);

    expect(
      hasPreviewPageCode({
        pageId: "page-a",
        pageCodes: {},
        activeCodePageId: "page-a",
        activeCode: "export default function PageA() {}",
      }),
    ).toBe(true);
  });
});
