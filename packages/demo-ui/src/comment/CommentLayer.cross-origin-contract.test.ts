import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const commentLayerSource = fs.readFileSync(
  path.join(testDirectory, "CommentLayer.tsx"),
  "utf8",
);

describe("CommentLayer cross-origin iframe contract", () => {
  it("uses reported viewport dimensions instead of reading cross-origin window properties", () => {
    expect(commentLayerSource).not.toMatch(/contentWindow\??\.innerWidth/);
    expect(commentLayerSource).toContain("const designWidth = payload.viewportWidth;");
    expect(commentLayerSource).toContain("const designWidth = viewState.viewportWidth;");
  });
});
