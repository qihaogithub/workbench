import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const previewCanvasSource = fs.readFileSync(
  path.join(testDirectory, "PreviewCanvas.tsx"),
  "utf8",
);

describe("PreviewCanvas viewer layout contract", () => {
  it("does not pass layout writers to read-only canvas items", () => {
    expect(previewCanvasSource).toMatch(
      /onLayoutChange=\{isEditorMode \? handleLayoutChange : undefined\}/,
    );
    expect(previewCanvasSource).toMatch(
      /isEditorMode \? handlePageGroupLayoutChange : undefined/,
    );
    expect(previewCanvasSource).toMatch(/editable && onLayoutChange/);
    expect(previewCanvasSource).toMatch(
      /onLayoutChange=\{\s*isEditorMode \? handleNodeLayoutChange : undefined\s*\}/,
    );
  });
});
