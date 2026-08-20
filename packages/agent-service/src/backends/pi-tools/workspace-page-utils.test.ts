import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getPageEntryFileName,
  isCompletePageDir,
  isCompletePageDirFromSnapshot,
} from "./workspace-page-utils";

describe("workspace page runtime files", () => {
  it("uses sandbox.html plus html-import.meta.json for sandbox pages", () => {
    expect(getPageEntryFileName("sandboxed-html")).toBe("sandbox.html");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-page-"));
    const pageDir = path.join(root, "demos", "page_1");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), "{}");
    fs.writeFileSync(path.join(pageDir, "sandbox.html"), "<main />");
    expect(isCompletePageDir(root, "page_1", "sandboxed-html")).toBe(false);
    fs.writeFileSync(path.join(pageDir, "html-import.meta.json"), "{}");
    expect(isCompletePageDir(root, "page_1", "sandboxed-html")).toBe(true);
  });

  it("rejects unknown runtimes instead of falling back to React", () => {
    expect(() => getPageEntryFileName("unknown-runtime")).toThrow(
      "Unknown page runtime",
    );
    expect(
      isCompletePageDirFromSnapshot(
        { "demos/page_1/config.schema.json": "{}" },
        "page_1",
        "unknown-runtime",
      ),
    ).toBe(false);
  });
});
