import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@workbench/sketch-core": path.resolve(__dirname, "../sketch-core/src/index.ts") } },
  test: { environment: "node" },
});
