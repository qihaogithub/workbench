import { defineConfig } from "vitest/config";
import { workbenchVitestNode } from "../../vitest.node";

export default defineConfig({
  ...workbenchVitestNode,
  test: {
    ...workbenchVitestNode.test,
    include: ["tests/**/*.test.ts"],
  },
});
