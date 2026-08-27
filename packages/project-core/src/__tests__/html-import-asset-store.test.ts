import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HtmlImportAssetStore } from "../html-import-asset-store";

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("HtmlImportAssetStore", () => {
  it("deduplicates content and only prunes unreachable asset hashes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-assets-"));
    roots.push(root);
    const store = new HtmlImportAssetStore(root);
    const first = store.persist(Buffer.from("same"), "images/logo.png");
    const repeated = store.persist(Buffer.from("same"), "copy/logo.png");
    const stale = store.persist(Buffer.from("stale"), "font.woff2");
    expect(repeated).toEqual(first);
    expect(store.read(first.hash)?.toString()).toBe("same");
    expect(store.prune([first.hash])).toEqual([stale.hash]);
    expect(store.read(stale.hash)).toBeNull();
    expect(fs.existsSync(path.join(root, first.path))).toBe(true);
  });
});
