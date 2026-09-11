import path from "node:path";
import { defineConfig } from "vitest/config";
import { workbenchVitestNode } from "../../vitest.node";
export default defineConfig({
  ...workbenchVitestNode,
  resolve: { alias: { "@workbench/sketch-core": path.resolve(__dirname, "../sketch-core/src/index.ts") } },
  test: { ...workbenchVitestNode.test },
});
