import { defineConfig } from "vitest/config";
import { workbenchVitestBrowser } from "../../vitest.browser";

export default defineConfig({
  ...workbenchVitestBrowser,
  esbuild: { jsx: "automatic" },
  test: {
    ...workbenchVitestBrowser.test,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
