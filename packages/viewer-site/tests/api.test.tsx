import { describe, expect, it } from "vitest";

import { resolveDataBase } from "../src/lib/api";

describe("resolveDataBase", () => {
  it("ignores development data endpoint when building the Docker viewer", () => {
    expect(
      resolveDataBase({
        NEXT_PUBLIC_DATA_BASE: "http://localhost:4200",
        NEXT_PUBLIC_VIEWER_DOCKER_MODE: "true",
      }),
    ).toBe("");
  });
});
