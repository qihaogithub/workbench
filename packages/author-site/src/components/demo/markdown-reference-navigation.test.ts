import { navigateToMarkdownMention } from "./markdown-reference-navigation";

describe("navigateToMarkdownMention", () => {
  it("selects and scrolls to the indexed occurrence in the rendered editor", () => {
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const container = document.createElement("div");
    container.innerHTML = '<div class="ProseMirror" contenteditable="true"><p>闯关活动闯关活动</p></div>';
    document.body.append(container);

    const result = navigateToMarkdownMention(container, "闯关活动\n闯关活动", {
      label: "闯关活动",
      start: 5,
      end: 9,
    });

    expect(result).toBe(true);
    expect(window.getSelection()?.toString()).toBe("闯关活动");
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
  });

  it("does not navigate stale indexed offsets", () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="ProseMirror"><p>其他内容</p></div>';

    expect(navigateToMarkdownMention(container, "其他内容", {
      label: "闯关活动",
      start: 0,
      end: 4,
    })).toBe(false);
  });
});
