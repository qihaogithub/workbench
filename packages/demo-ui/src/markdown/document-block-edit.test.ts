import { describe, expect, it } from "vitest";

import { isBlockHandleActivationKey } from "./document-block-edit";

describe("document block handle activation", () => {
  it("uses Enter and Space as the keyboard equivalents of a click", () => {
    expect(isBlockHandleActivationKey("Enter")).toBe(true);
    expect(isBlockHandleActivationKey(" ")).toBe(true);
    expect(isBlockHandleActivationKey("Escape")).toBe(false);
    expect(isBlockHandleActivationKey("ArrowDown")).toBe(false);
  });
});
