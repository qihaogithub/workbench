import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const previewStageSource = fs.readFileSync(
  path.join(testDirectory, "PreviewStage.tsx"),
  "utf8",
);

describe("PreviewStage lazy canvas contract", () => {
  it("keeps PreviewCanvas out of single/document startup and loads it only from the canvas branch", () => {
    expect(previewStageSource).not.toMatch(
      /import\s*{\s*PreviewCanvas\s*}\s*from\s*["']\.\/PreviewCanvas["']/,
    );
    expect(previewStageSource).toMatch(
      /lazy\(\(\)\s*=>\s*import\(["']\.\/PreviewCanvas["']\)/,
    );
    expect(previewStageSource).toMatch(
      /previewMode\s*===\s*["']canvas["'][\s\S]*?<Suspense[\s\S]*?<PreviewCanvas/,
    );
  });
});
