import { renderManualMarkdown } from "./markdown";

describe("renderManualMarkdown", () => {
  it("renders headings with stable ids and strips unsafe links/html", () => {
    const result = renderManualMarkdown([
      "## 开始使用",
      "",
      "[安全链接](/manual/quick-start)",
      "[危险链接](javascript:alert(1))",
      "<script>alert(1)</script>",
    ].join("\n"));

    expect(result.headings).toEqual([{ id: "开始使用", level: 2, text: "开始使用" }]);
    expect(result.html).toContain('id="开始使用"');
    expect(result.html).toContain('href="/manual/quick-start"');
    expect(result.html).not.toContain('href="javascript:');
    expect(result.html).not.toContain("<script>");
  });
});
