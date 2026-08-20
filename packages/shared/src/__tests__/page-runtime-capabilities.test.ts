import { describe, expect, it } from "vitest";

import {
  PAGE_RUNTIME_CAPABILITIES,
  PageRuntimeCapabilityError,
  getPageRuntimeCapabilities,
} from "../page-runtime-capabilities";

describe("page runtime capabilities", () => {
  it("registers every persisted runtime with a fixed renderer", () => {
    expect(Object.keys(PAGE_RUNTIME_CAPABILITIES).sort()).toEqual([
      "high-fidelity-react",
      "prototype-html-css",
      "sandboxed-html",
      "sketch-scene",
    ]);
    expect(getPageRuntimeCapabilities("sandboxed-html")).toMatchObject({
      sourceKind: "sandbox-html",
      sourceFiles: ["sandbox.html"],
      previewRenderer: "sandbox-html",
      screenshotRenderer: "sandbox-html",
      publishRenderer: "sandbox-html",
    });
  });

  it("fails closed for unknown runtime strings", () => {
    expect(() => getPageRuntimeCapabilities("future-runtime")).toThrow(PageRuntimeCapabilityError);
    try {
      getPageRuntimeCapabilities("future-runtime");
    } catch (error) {
      expect(error).toMatchObject({
        code: "PAGE_RUNTIME_CAPABILITY_UNKNOWN",
        runtimeType: "future-runtime",
        details: { knownRuntimeTypes: expect.arrayContaining(["sandboxed-html"]) },
      });
    }
  });
});
