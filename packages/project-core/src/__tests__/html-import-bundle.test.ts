import { describe, expect, it } from "vitest";
import { normalizeHtmlImportBundle, readHtmlImportZipBundle } from "../html-import-bundle";

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: Array<[string, string]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of files) {
    const fileName = Buffer.from(name);
    const body = Buffer.from(value);
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + body.length;
  }
  const centralSize = centrals.reduce((size, item) => size + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe("normalizeHtmlImportBundle", () => {
  it("inlines local relative assets and returns content-addressed references", () => {
    const result = normalizeHtmlImportBundle([
      { path: "site/index.html", content: Buffer.from('<link href="style.css"><img src="images/logo.png">') },
      { path: "site/style.css", content: Buffer.from("body{background:url('./images/logo.png')}") },
      { path: "site/images/logo.png", content: Buffer.from([1, 2, 3]) },
    ]);
    expect(result.entryPath).toBe("site/index.html");
    expect(result.assets).toHaveLength(2);
    expect(result.assets.map((asset) => asset.ref)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]));
    expect(result.html).toContain("data:text/css;base64,");
    expect(result.html).toContain("data:image/png;base64,AQID");
  });

  it("rejects traversal, duplicate entries and ambiguous entry documents", () => {
    expect(() => normalizeHtmlImportBundle([
      { path: "../index.html", content: Buffer.from("x") },
    ])).toThrow("HTML_IMPORT_BUNDLE_FILE_INVALID");
    expect(() => normalizeHtmlImportBundle([
      { path: "index.html", content: Buffer.from("x") },
      { path: "index.html", content: Buffer.from("x") },
    ])).toThrow("HTML_IMPORT_BUNDLE_FILE_INVALID");
    expect(() => normalizeHtmlImportBundle([
      { path: "one/index.html", content: Buffer.from("x") },
      { path: "two/index.html", content: Buffer.from("x") },
    ])).toThrow("HTML_IMPORT_BUNDLE_ENTRY_INVALID");
  });

  it("reads a local ZIP lazily and applies the same bundle policy", async () => {
    const result = await readHtmlImportZipBundle(storedZip([
      ["index.html", '<img src="image.png">'],
      ["image.png", "img"],
    ]));
    expect(result.html).toContain("data:image/png;base64,aW1n");
    await expect(readHtmlImportZipBundle(Buffer.from("not-a-zip"))).rejects.toBeTruthy();
  });
});
