import { describe, expect, it } from "vitest";
import { createZip, encodeText } from "../src/index.js";

describe("createZip", () => {
  it("creates a deterministic store-only ZIP with UTF-8 paths", () => {
    const zip = createZip([
      { path: "bundle.json", content: encodeText("{}"), mediaType: "application/json" },
      { path: "workspace/页面.html", content: encodeText("ok"), mediaType: "text/html" },
    ]);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(zip)).toContain("workspace/页面.html");
    expect(Array.from(zip.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
