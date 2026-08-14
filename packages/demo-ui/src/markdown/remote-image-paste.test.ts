import { describe, expect, it } from "vitest";
import {
  getExternalImageUrlFromClipboard,
  getMarkdownImagePaste,
  replaceMarkdownImageUrls,
} from "./remote-image-paste";

function clipboardHtml(html: string) {
  return { getData: (type: string) => (type === "text/html" ? html : "") };
}

describe("getExternalImageUrlFromClipboard", () => {
  it("recognizes an external image copied from a web page", () => {
    expect(
      getExternalImageUrlFromClipboard(
        clipboardHtml('<p><img src="https://cdn.example.com/hero.png"></p>'),
      ),
    ).toBe("https://cdn.example.com/hero.png");
  });

  it("ignores same-origin, non-HTTP, and non-image clipboard content", () => {
    const localUrl = `${window.location.origin}/api/images/img_local`;
    expect(
      getExternalImageUrlFromClipboard(clipboardHtml(`<img src="${localUrl}">`)),
    ).toBeNull();
    expect(
      getExternalImageUrlFromClipboard(clipboardHtml('<img src="data:image/png;base64,abc">')),
    ).toBeNull();
    expect(getExternalImageUrlFromClipboard(clipboardHtml("<p>plain text</p>"))).toBeNull();
  });

  it("collects every external image from Markdown while preserving text", () => {
    const markdown = [
      "# 说明",
      "第一张：![一](https://cdn.example.com/one.png)",
      "中间文字",
      "第二张：![二](https://cdn.example.com/two.png)",
    ].join("\n");
    const paste = getMarkdownImagePaste({
      getData: (type: string) => (type === "text/plain" ? markdown : ""),
    });
    expect(paste?.externalUrls).toEqual([
      "https://cdn.example.com/one.png",
      "https://cdn.example.com/two.png",
    ]);
    expect(
      replaceMarkdownImageUrls(
        markdown,
        new Map([
          ["https://cdn.example.com/one.png", "/api/images/img_one"],
          ["https://cdn.example.com/two.png", "/api/images/img_two"],
        ]),
      ),
    ).toContain("# 说明\n第一张：![一](/api/images/img_one)\n中间文字\n第二张：![二](/api/images/img_two)");
  });

  it("does not treat a text clipboard payload as a single HTML image", () => {
    const clipboard = {
      getData: (type: string) =>
        type === "text/plain" ? "普通文本" : '<img src="https://cdn.example.com/hero.png">',
    };
    expect(getMarkdownImagePaste(clipboard)).toBeNull();
  });
});
