import { applyPrototypePropertyChange } from "../prototype-visual-editor";

const repeatedParagraph = {
  nodeId: "prototype-root > section:nth-of-type(1) > p:nth-of-type(2)",
  domPath: "prototype-root > section:nth-of-type(1) > p:nth-of-type(2)",
};

describe("prototype visual editor source-backed writes", () => {
  it("只修改目标文本并持久化稳定节点 ID", () => {
    const source = '<section>\n  <p class="copy">相同</p>\n  <p class="copy">相同</p>\n</section>';

    const result = applyPrototypePropertyChange(
      source,
      repeatedParagraph,
      "text",
      "第二段 & 更多",
      "text",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toMatch(
      /<p class="copy" data-ow-id="ow_[^"]+">第二段 &amp; 更多<\/p>/,
    );
    expect(result.html).toContain('<p class="copy">相同</p>');
    expect(result.inversePatches).toBeDefined();
  });

  it("拒绝用整块文本覆盖嵌套标记", () => {
    const result = applyPrototypePropertyChange(
      "<p>欢迎 <strong>回来</strong></p>",
      {
        nodeId: "prototype-root > p:nth-of-type(1)",
        domPath: "prototype-root > p:nth-of-type(1)",
      },
      "text",
      "新文本",
      "text",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("包含嵌套内容");
  });
});
