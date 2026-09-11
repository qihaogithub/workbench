import path from "node:path";

import { defineConfig } from "vitest/config";
import { workbenchVitestNode } from "../../vitest.node";

export default defineConfig({
  ...workbenchVitestNode,
  resolve: {
    alias: {
      "@workbench/preview-contract": path.resolve(__dirname, "../preview-contract/src"),
      "@workbench/preview-contract/runtime": path.resolve(__dirname, "../preview-contract/src/runtime.ts"),
    },
  },
  test: {
    ...workbenchVitestNode.test,
  },
});
