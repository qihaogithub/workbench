import {
  PrototypePagePreview,
  sanitizePrototypeCss,
  sanitizePrototypeHtml,
} from "@opencode-workbench/demo-ui";
import React from "react";
import { render } from "@testing-library/react";

describe("PrototypePagePreview", () => {
  it("清理原型页 HTML 中的脚本、内联事件和 javascript URL", () => {
    const sanitized = sanitizePrototypeHtml(
      `<section onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">打开</a></section>`,
    );

    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).toContain("打开");
  });

  it("清理原型页 CSS 中的高风险能力", () => {
    const sanitized = sanitizePrototypeCss(
      `@import url("https://example.com/x.css"); .box { behavior: url(test.htc); background: url("javascript:alert(1)"); }`,
    );

    expect(sanitized).not.toContain("@import");
    expect(sanitized).not.toContain("behavior");
    expect(sanitized).not.toContain("javascript:");
  });

  it("根据配置数据应用原型页绑定", () => {
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<section><h1 data-bind-text="title">默认标题</h1><p>{{summary}}</p><span data-bind-style-color="themeColor">状态</span></section>`,
        css: "",
        configData: {
          title: "配置标题",
          summary: "配置摘要",
          themeColor: "#2563EB",
        },
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const shadow = host?.shadowRoot;

    expect(shadow?.querySelector("h1")?.textContent).toBe("配置标题");
    expect(shadow?.querySelector("p")?.textContent).toBe("配置摘要");
    expect((shadow?.querySelector("span") as HTMLElement | null)?.style.color).toBe("rgb(37, 99, 235)");
  });
});
