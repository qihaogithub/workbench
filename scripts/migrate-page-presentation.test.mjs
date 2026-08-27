import assert from "node:assert/strict";
import test from "node:test";

import { migratePresentationSchema } from "./migrate-page-presentation.mjs";

test("migrates a Figma preview size to a fixed presentation", () => {
  const result = migratePresentationSchema(
    { type: "object", $demo: { previewSize: { width: 1440, height: 1024 } } },
    { runtimeType: "prototype-html-css", isFigma: true },
  );
  assert.deepEqual(result.$demo.presentation, {
    version: 1,
    mode: "fixed-canvas",
    viewport: { width: 1440, height: 1024 },
    heightBehavior: "fixed",
    preset: "custom",
    source: "figma",
  });
  assert.equal("previewSize" in result.$demo, false);
});

test("uses desktop responsive presentation for ambiguous sandbox HTML", () => {
  const result = migratePresentationSchema(
    { type: "object", properties: {} },
    { runtimeType: "sandboxed-html", isFigma: false },
  );
  assert.deepEqual(result.$demo.presentation.viewport, { width: 1440, height: 900 });
  assert.equal(result.$demo.presentation.mode, "responsive-page");
  assert.equal(result.$demo.presentation.heightBehavior, "content");
  assert.equal(result.$demo.presentation.source, "recommended");
});
