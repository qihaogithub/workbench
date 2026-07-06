import { applyPrototypeBindings } from "@workbench/shared";

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
});
