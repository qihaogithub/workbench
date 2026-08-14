import assert from "node:assert/strict";
import test from "node:test";
import rawTextLoader from "./turbopack-raw-text-loader.cjs";

test("emits a safe ESM default export for Markdown source", () => {
  const source = '# Prompt\n\nUse `${value}` and "quotes".';
  assert.equal(
    rawTextLoader(source),
    `export default ${JSON.stringify(source)};`,
  );
});
