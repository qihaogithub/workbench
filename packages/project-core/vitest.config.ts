import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@workbench/preview-contract": path.resolve(__dirname, "../preview-contract/src"),
      "@workbench/preview-contract/runtime": path.resolve(__dirname, "../preview-contract/src/runtime.ts"),
    },
  },
});
