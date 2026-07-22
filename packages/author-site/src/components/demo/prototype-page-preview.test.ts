import {
  CanvasPageItem,
  PrototypePagePreview,
  sanitizePrototypeCss,
  sanitizePrototypeHtml,
} from "@workbench/demo-ui";
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";

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

  it("可从 SVG 子节点选中语义 SVG 图层并即时显示悬停框", () => {
    const onVisualSelect = jest.fn();
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<button data-ow-id="icon-button"><svg data-ow-id="arrow-icon" viewBox="0 0 24 24"><path d="M4 12h16" /></svg></button>`,
        css: "",
        visualEditMode: true,
        onVisualSelect,
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const shadow = host?.shadowRoot;
    const path = shadow?.querySelector("path");
    const svg = shadow?.querySelector("svg");
    expect(path).not.toBeNull();
    expect(svg).not.toBeNull();

    fireEvent.pointerOver(path!);
    expect(svg).toHaveAttribute("data-prototype-hovered", "true");

    fireEvent.click(path!);
    expect(onVisualSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "arrow-icon",
        tagName: "svg",
      }),
    );
  });

  it("Cmd/Ctrl 连续点击可从最具体图层向父级循环选择", () => {
    const onVisualSelect = jest.fn();
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<button data-ow-id="cta"><span data-ow-id="cta-label">立即开始</span></button>`,
        css: "",
        visualEditMode: true,
        onVisualSelect,
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const span = host?.shadowRoot?.querySelector("span");
    expect(span).not.toBeNull();

    fireEvent.click(span!, { ctrlKey: true, clientX: 12, clientY: 12 });
    fireEvent.click(span!, { ctrlKey: true, clientX: 12, clientY: 12 });

    expect(onVisualSelect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ nodeId: "cta-label" }),
    );
    expect(onVisualSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ nodeId: "cta" }),
    );
  });

  it("Cmd/Ctrl 连续点击可循环选择同一位置的重叠图层", () => {
    const onVisualSelect = jest.fn();
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<section><div data-ow-id="back">底层</div><div data-ow-id="front">顶层</div></section>`,
        css: "",
        visualEditMode: true,
        onVisualSelect,
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const shadow = host?.shadowRoot;
    const root = shadow?.querySelector(".prototype-root");
    const back = shadow?.querySelector("[data-ow-id='back']");
    const front = shadow?.querySelector("[data-ow-id='front']");
    expect(root).not.toBeNull();
    expect(back).not.toBeNull();
    expect(front).not.toBeNull();

    Object.defineProperty(shadow, "elementsFromPoint", {
      configurable: true,
      value: () => [front, back, root],
    });

    fireEvent.click(front!, { ctrlKey: true, clientX: 24, clientY: 24 });
    fireEvent.click(front!, { ctrlKey: true, clientX: 24, clientY: 24 });

    expect(onVisualSelect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ nodeId: "front" }),
    );
    expect(onVisualSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ nodeId: "back" }),
    );
  });

  it("选中后可用 Enter、Shift+Enter 和 Tab 在图层结构中导航", () => {
    const onVisualSelect = jest.fn();
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<section data-ow-id="section"><button data-ow-id="first"><span data-ow-id="label">按钮</span></button><button data-ow-id="second">下一项</button></section>`,
        css: "",
        visualEditMode: true,
        onVisualSelect,
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const label = host?.shadowRoot?.querySelector("[data-ow-id='label']");
    expect(host).not.toBeNull();
    expect(label).not.toBeNull();

    fireEvent.click(label!);
    fireEvent.keyDown(host!, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(host!, { key: "Tab" });

    expect(onVisualSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ nodeId: "first" }),
    );
    expect(onVisualSelect).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ nodeId: "second" }),
    );
  });

  it("支持按图层临时隐藏原型页节点", () => {
    const { container, rerender } = render(
      React.createElement(PrototypePagePreview, {
        html: `<section><div data-ow-id="hero">主视觉</div><p>正文</p></section>`,
        css: "",
        hiddenVisualNodeIds: ["hero"],
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const shadow = host?.shadowRoot;
    const hero = shadow?.querySelector("[data-ow-id='hero']") as HTMLElement | null;

    expect(hero?.style.display).toBe("none");

    rerender(
      React.createElement(PrototypePagePreview, {
        html: `<section><div data-ow-id="hero">主视觉</div><p>正文</p></section>`,
        css: "",
        hiddenVisualNodeIds: [],
      }),
    );

    const visibleHero = shadow?.querySelector("[data-ow-id='hero']") as HTMLElement | null;
    expect(visibleHero?.style.display).toBe("");
  });

  it("按当前会话和页面目录改写原型页相对图片路径", () => {
    const { container } = render(
      React.createElement(PrototypePagePreview, {
        html: `<section><img src="../../assets/football/home/banner.webp" alt="banner" /></section>`,
        css: `.hero { background-image: url("../../assets/football/home/bg.svg"); }`,
        sessionId: "session_1",
        demoId: "page_1",
      }),
    );

    const host = container.querySelector("[data-prototype-preview]");
    const shadow = host?.shadowRoot;
    const image = shadow?.querySelector("img");
    const styleText = shadow?.querySelector("style")?.textContent ?? "";

    expect(image?.getAttribute("src")).toContain(
      "/api/sessions/session_1/workspace/assets/football/home/banner.webp",
    );
    expect(styleText).toContain(
      "/api/sessions/session_1/workspace/assets/football/home/bg.svg",
    );
  });

  it("单页原型页传入 previewSize 时按设计尺寸等比适配容器", async () => {
    const widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(500);
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(700);

    try {
      const { container } = render(
        React.createElement(PrototypePagePreview, {
          html: `<section>手机页面</section>`,
          css: "",
          previewSize: { width: 375, height: 812 },
        }),
      );

      await waitFor(() => {
        const scaleContent = container.querySelector(
          "[style*='transform: scale']",
        ) as HTMLElement | null;
        expect(scaleContent).not.toBeNull();
        expect(scaleContent?.style.width).toBe("375px");
        expect(scaleContent?.style.height).toBe("812px");
        expect(scaleContent?.style.transform).toContain("scale(");
        expect(scaleContent?.style.transform).not.toBe("scale(1)");
      });
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("原型页传入 previewSize 时把 viewport 单位固定到设计画板", async () => {
    const widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(500);
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(700);

    try {
      const { container } = render(
        React.createElement(PrototypePagePreview, {
          html: `<section class="phone-container">手机页面</section>`,
          css: `.phone-container { width: 100vw; height: 100vh; }`,
          previewSize: { width: 375, height: 812 },
        }),
      );

      await waitFor(() => {
        const host = container.querySelector("[data-prototype-preview]");
        const shadow = host?.shadowRoot;
        const styleText = shadow?.querySelector("style")?.textContent ?? "";

        expect(styleText).toContain("width: 375px");
        expect(styleText).toContain("height: 812px");
        expect(styleText).not.toContain("100vw");
        expect(styleText).not.toContain("100vh");
      });
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("单页原型页传入 allowScroll 时设计画板根节点可纵向滚动", async () => {
    const widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(500);
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(700);

    try {
      const { container } = render(
        React.createElement(PrototypePagePreview, {
          html: `<section style="height: 2000px">超高内容</section>`,
          css: "",
          previewSize: { width: 375, height: 812 },
          allowScroll: true,
        }),
      );

      await waitFor(() => {
        const host = container.querySelector("[data-prototype-preview]");
        const styleText =
          host?.shadowRoot?.querySelector("style")?.textContent ?? "";
        expect(styleText).toContain("overflow: auto");
        expect(styleText).not.toContain("overflow: hidden");
      });
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("单页原型页默认不允许滚动时设计画板根节点裁剪超高内容", async () => {
    const widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(500);
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(700);

    try {
      const { container } = render(
        React.createElement(PrototypePagePreview, {
          html: `<section style="height: 2000px">超高内容</section>`,
          css: "",
          previewSize: { width: 375, height: 812 },
        }),
      );

      await waitFor(() => {
        const host = container.querySelector("[data-prototype-preview]");
        const styleText =
          host?.shadowRoot?.querySelector("style")?.textContent ?? "";
        expect(styleText).toContain("overflow: hidden");
        expect(styleText).not.toContain("overflow: auto");
      });
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("画布原型页调整页面框时保持设计画板整体等比缩放", async () => {
    const widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(300);
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(650);

    try {
      const { container } = render(
        React.createElement(CanvasPageItem, {
          page: {
            id: "prototype-page",
            name: "原型页",
            order: 0,
            runtimeType: "prototype-html-css",
            prototypeHtml: `<section><div style="width: 320px">固定宽度内容</div></section>`,
            prototypeCss: "",
            previewSize: { width: 375, height: 812 },
          },
          layout: { x: 0, y: 0, width: 300, height: 650 },
          editable: false,
          renderMode: "prototype",
        }),
      );

      await waitFor(() => {
        const host = container.querySelector("[data-prototype-preview]");
        const scaleContent = host?.parentElement as HTMLElement | null;
        expect(scaleContent).not.toBeNull();
        expect(scaleContent?.style.width).toBe("375px");
        expect(scaleContent?.style.height).toBe("812px");
        expect(scaleContent?.style.transform).toContain("scale(");
        expect(scaleContent?.style.transform).not.toBe("scale(1)");
      });
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("画布原型页缺少显式 previewSize 时仍使用 layout 尺寸计算内容缩放", async () => {
    const { container } = render(
      React.createElement(CanvasPageItem, {
        page: {
          id: "prototype-page-custom",
          name: "放大原型页",
          order: 0,
          runtimeType: "prototype-html-css",
          prototypeHtml: `<section><div style="width: 320px">固定宽度内容</div></section>`,
          prototypeCss: "",
        },
        layout: { x: 0, y: 0, width: 528.75, height: 1144.2 },
        editable: false,
        renderMode: "prototype",
      }),
    );

    await waitFor(() => {
      const host = container.querySelector("[data-prototype-preview]");
      const scaleContent = host?.parentElement as HTMLElement | null;
      expect(scaleContent).not.toBeNull();
      expect(scaleContent?.style.width).toBe("375px");
      expect(scaleContent?.style.height).toBe("812px");
      const scale = Number.parseFloat(
        scaleContent?.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? "0",
      );
      expect(scale).toBeGreaterThan(1.4);
    });
  });
});
