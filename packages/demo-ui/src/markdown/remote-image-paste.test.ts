import { describe, expect, it } from "vitest";
import { getExternalImageUrlFromClipboard } from "./remote-image-paste";

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
});
