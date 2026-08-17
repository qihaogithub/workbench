import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDataBase } from "../src/lib/api";

describe("resolveDataBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the local author-site data endpoint during development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDataBase({})).toBe("http://localhost:4200");
  });

  it("ignores development data endpoint when building the Docker viewer", () => {
    expect(
      resolveDataBase({
        NEXT_PUBLIC_DATA_BASE: "http://localhost:4200",
        NEXT_PUBLIC_VIEWER_DOCKER_MODE: "true",
      }),
    ).toBe("");
  });
});
