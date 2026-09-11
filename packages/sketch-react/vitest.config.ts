import { defineConfig } from "vitest/config";
import { workbenchVitestBrowser } from "../../vitest.browser";

export default defineConfig({
  ...workbenchVitestBrowser,
  test: {
    ...workbenchVitestBrowser.test,
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
