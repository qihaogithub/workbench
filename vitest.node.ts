import type { UserConfig } from "vitest/config";

export const workbenchVitestNode = {
  test: {
    environment: "node",
  },
} satisfies UserConfig;
