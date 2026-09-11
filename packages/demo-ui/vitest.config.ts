import { defineConfig } from "vitest/config";
import path from "path";
import { workbenchVitestBrowser } from "../../vitest.browser";

export default defineConfig({
  ...workbenchVitestBrowser,
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      // DocumentEditor 通过 @/ 引用宿主应用的 shadcn UI 组件（创作端）。
      "@": path.resolve(__dirname, "../author-site/src"),
    },
  },
  test: {
    ...workbenchVitestBrowser.test,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
