import {
  applyPrototypeBindings,
  applyPrototypeTextBindings,
} from "@workbench/shared";

describe("prototype preview bindings", () => {
  it("配置绑定的相对图片路径走 session workspace 资源重写", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <img data-bind-src="popupImage" src="" />
      <button data-bind-text="primaryText"></button>
    `;

    applyPrototypeBindings(
      root,
      {
        popupImage: "./images/popup.png",
        primaryText: "去看看",
      },
      {
        sessionId: "sess_1",
        demoId: "demo_a",
        origin: "http://localhost:3200",
      },
    );

    expect(root.querySelector("img")?.getAttribute("src")).toBe(
      "http://localhost:3200/api/sessions/sess_1/workspace/demos/demo_a/images/popup.png",
    );
    expect(root.querySelector("button")?.textContent).toBe("去看看");
  });

  it("缺少配置值时保留原型 HTML 中的兜底内容", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <img data-bind-src="popupImage" src="/fallback/popup.png" />
      <a data-bind-href="targetUrl" href="/fallback">打开</a>
      <button data-bind-text="primaryText">默认按钮</button>
      <span data-bind-style-color="themeColor" style="color: rgb(1, 2, 3)">状态</span>
    `;

    applyPrototypeBindings(root, {});

    expect(root.querySelector("img")?.getAttribute("src")).toBe(
      "/fallback/popup.png",
    );
    expect(root.querySelector("a")?.getAttribute("href")).toBe("/fallback");
    expect(root.querySelector("button")?.textContent).toBe("默认按钮");
    expect((root.querySelector("span") as HTMLElement | null)?.style.color).toBe(
      "rgb(1, 2, 3)",
    );
  });

  it("缺少模板变量配置时保留原始模板文本", () => {
    expect(applyPrototypeTextBindings("{{title}} - {{summary}}", {})).toBe(
      "{{title}} - {{summary}}",
    );
    expect(
      applyPrototypeTextBindings("{{title}} - {{summary}}", {
        title: "配置标题",
      }),
    ).toBe("配置标题 - {{summary}}");
  });

  it("显式空值仍按配置清空绑定内容", () => {
    const root = document.createElement("div");
    root.innerHTML = `<button data-bind-text="primaryText">默认按钮</button>`;

    applyPrototypeBindings(root, { primaryText: "" });

    expect(root.querySelector("button")?.textContent).toBe("");
  });
});
