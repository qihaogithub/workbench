import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import rewriteRelativeTsImports from "./turbopack-rewrite-relative-ts-imports.cjs";

const projectCorePath = path.resolve("packages/project-core/src/service.ts");

test("rewrites relative NodeNext JavaScript specifiers only for workspace source packages", () => {
  const source = [
    'import { config } from "./config.js";',
    'export type { Project } from "./types.js";',
    'const load = () => import("./utils.js");',
    'import external from "external-package.js";',
  ].join("\n");

  const result = rewriteRelativeTsImports.call({ resourcePath: projectCorePath }, source);

  assert.match(result, /from "\.\/config\.ts"/);
  assert.match(result, /from "\.\/types\.ts"/);
  assert.match(result, /import\("\.\/utils\.ts"\)/);
  assert.match(result, /from "external-package\.js"/);
});

test("leaves author-site source untouched", () => {
  const source = 'import { config } from "./config.js";';
  const result = rewriteRelativeTsImports.call(
    { resourcePath: path.resolve("packages/author-site/src/lib/module.ts") },
    source,
  );

  assert.equal(result, source);
});
