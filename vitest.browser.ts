import type { UserConfig } from "vitest/config";

export const workbenchVitestBrowser = {
  test: {
    environment: "jsdom",
  },
} satisfies UserConfig;
