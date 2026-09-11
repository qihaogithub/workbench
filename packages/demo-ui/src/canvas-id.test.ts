// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createCanvasId } from "./canvas-id";

describe("createCanvasId", () => {
  it("falls back when randomUUID is unavailable in an insecure context", () => {
    expect(createCanvasId("section", "-", () => undefined)).toMatch(
      /^section-\d+-[a-z0-9]+$/,
    );
  });
});
