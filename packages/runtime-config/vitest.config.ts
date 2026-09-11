import { defineConfig } from "vitest/config";
import { workbenchVitestNode } from "../../vitest.node";

export default defineConfig({
  ...workbenchVitestNode,
  test: {
    ...workbenchVitestNode.test,
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
