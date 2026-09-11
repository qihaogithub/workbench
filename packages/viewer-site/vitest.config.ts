import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workbenchVitestBrowser } from "../../vitest.browser";

export default defineConfig({
  ...workbenchVitestBrowser,
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    ...workbenchVitestBrowser.test,
    include: ["tests/**/*.test.tsx"],
  },
});
