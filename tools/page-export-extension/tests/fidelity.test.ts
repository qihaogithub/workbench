import { describe, expect, it } from "vitest";
import type { VirtualFile } from "@workbench/editable-snapshot-core";
import { compareRgba, rewriteVirtualFileReferences, rewriteVirtualFileReferencesDetailed, virtualFileToDataUrl } from "../src/offscreen/fidelity.js";

const file = (path: string, content: string, mediaType = "text/plain"): VirtualFile => ({ path, content: new TextEncoder().encode(content), mediaType });

describe("compareRgba", () => {
  it("calculates changed pixels, mean absolute error, and max channel delta", () => {
    const result = compareRgba(new Uint8Array([0, 10, 20, 255, 10, 20, 30, 255]), new Uint8Array([0, 20, 40, 255, 20, 20, 30, 250]), 2, 1);
    expect(result.sizeMismatch).toBe(false);
    expect(result.changedPixelRatio).toBe(1);
    expect(result.meanAbsoluteError).toBe(45 / 8);
    expect(result.maxChannelDelta).toBe(20);
    expect(result.comparedPixels).toBe(2);
  });

  it("reports dimensions/byte-length mismatches explicitly", () => {
    const result = compareRgba(new Uint8Array(4), new Uint8Array(8), 2, 1);
    expect(result.sizeMismatch).toBe(true);
    expect(result.comparedPixels).toBe(1);
  });
});

describe("virtual file reference rewriting", () => {
  it("resolves relative paths from the containing virtual file and emits data URLs", () => {
    const files = [file("workspace/index.html", ""), file("workspace/styles/page.css", "body{background:url('../assets/bg.svg')}"), file("workspace/assets/bg.svg", "<svg/>", "image/svg+xml")];
    const rewritten = rewriteVirtualFileReferences(files[1].content ? "body{background:url('../assets/bg.svg')}" : "", files, "workspace/styles/page.css");
    expect(rewritten).toContain("data:image/svg+xml;base64,");
    expect(rewritten).not.toContain("../assets/bg.svg");
  });

  it("rewrites HTML attributes, inline CSS and blocks remote references", () => {
    const files = [file("workspace/index.html", ""), file("workspace/assets/logo.txt", "logo", "text/plain")];
    const result = rewriteVirtualFileReferencesDetailed("<img src='assets/logo.txt' style=\"background:url(assets/logo.txt)\"><img src='https://example.test/a.png'>", files, "workspace/index.html");
    expect(result.content.match(/data:text\/plain;base64,/g)).toHaveLength(2);
    expect(result.content).not.toContain("https://example.test");
    expect(result.warnings).toContain("blocked external document resource: https://example.test/a.png");
  });

  it("encodes binary bytes without changing them", () => {
    const dataUrl = virtualFileToDataUrl({ path: "x.bin", content: new Uint8Array([0, 255, 1]), mediaType: "application/octet-stream" });
    expect(dataUrl).toBe("data:application/octet-stream;base64,AP8B");
  });
});
