import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

function solidPng(width = 3, height = 2): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 26, g: 188, b: 156, alpha: 0.5 },
    },
  }).png().toBuffer();
}

function staticGif(): Buffer {
  return Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
}

describe("whiteboard image asset pipeline", () => {
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-whiteboard-assets-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("normalizes PNG, JPEG, WebP, GIF and SVG sources to static PNG assets", async () => {
    const { normalizeWhiteboardImage } = await import("./whiteboard-image-assets");
    const { getImage } = await import("./image-store");
    const sources = [
      { filename: "transparent.png", mimeType: "image/png", buffer: await solidPng() },
      { filename: "photo.jpg", mimeType: "image/jpeg", buffer: await sharp(await solidPng()).jpeg().toBuffer() },
      { filename: "photo.webp", mimeType: "image/webp", buffer: await sharp(await solidPng()).webp().toBuffer() },
      { filename: "frame.gif", mimeType: "image/gif", buffer: staticGif() },
      {
        filename: "vector.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="7" height="5"><rect width="7" height="5" fill="#ef4444"/></svg>'),
      },
    ];

    for (const source of sources) {
      const result = await normalizeWhiteboardImage({ ...source, createdBy: "test" });
      const stored = getImage(result.imageId);
      expect(stored.buffer).toBeDefined();
      const metadata = await sharp(stored.buffer!).metadata();

      expect(result.mimeType).toBe("image/png");
      expect(result.staticFrame).toBe(true);
      expect(result.sourceMimeType).toBe(source.mimeType);
      expect(result.sourceWasAnimated).toBe(false);
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }
  });

  it("preserves transparent pixels and accepts data URLs with multiple parameters", async () => {
    const { decodeWhiteboardDataUrl, normalizeWhiteboardImage } = await import("./whiteboard-image-assets");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#2563eb"/></svg>';
    const dataUrl = `data:image/svg+xml;charset=utf-8;base64,${Buffer.from(svg).toString("base64")}`;
    const decoded = decodeWhiteboardDataUrl(dataUrl);
    expect(decoded.mimeType).toBe("image/svg+xml");
    expect(decoded.buffer.toString("utf8")).toBe(svg);

    const result = await normalizeWhiteboardImage({
      buffer: await solidPng(),
      mimeType: "image/png",
      filename: "alpha.png",
      createdBy: "test",
    });
    const { getImage } = await import("./image-store");
    const image = getImage(result.imageId);
    expect(image.buffer).toBeDefined();
    const pixel = await sharp(image.buffer!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(pixel.data[3]).toBeLessThan(255);
  });

  it("fails closed for undecodable image data", async () => {
    const { normalizeWhiteboardImage } = await import("./whiteboard-image-assets");

    await expect(normalizeWhiteboardImage({
      buffer: Buffer.from("not-an-image"),
      mimeType: "image/png",
      filename: "broken.png",
      createdBy: "test",
    })).rejects.toMatchObject({ code: "IMAGE_DECODE_FAILED" });
  });

  it("leases localized assets, preserves attached assets and collects expired drafts", async () => {
    const {
      attachWhiteboardImage,
      claimWhiteboardDraftImage,
      collectExpiredWhiteboardImages,
      getImage,
      getImageInfo,
      releaseWhiteboardDraftImages,
      syncWhiteboardImages,
      uploadImage,
    } = await import("./image-store");
    const buffer = await solidPng();
    const first = await uploadImage({ buffer, filename: "candidate.png", sourceType: "user_upload", createdBy: "test" });
    if (!first.success) throw new Error(first.error.message);
    expect(claimWhiteboardDraftImage(first.imageId, "wb_draft", Date.now() + 60_000)).toBe(true);
    expect(getImageInfo(first.imageId)?.whiteboardDrafts).toHaveProperty("wb_draft");
    expect(releaseWhiteboardDraftImages("wb_draft")).toEqual([first.imageId]);
    expect(getImageInfo(first.imageId)).toBeNull();
    expect(getImage(first.imageId).buffer).toBeUndefined();

    const second = await uploadImage({ buffer, filename: "attached.png", sourceType: "user_upload", createdBy: "test" });
    if (!second.success) throw new Error(second.error.message);
    expect(claimWhiteboardDraftImage(second.imageId, "wb_draft_2", Date.now() + 60_000)).toBe(true);
    expect(attachWhiteboardImage(second.imageId, "wb_persisted", "wb_draft_2")).toBe(true);
    expect(releaseWhiteboardDraftImages("wb_draft_2")).toEqual([]);
    expect(collectExpiredWhiteboardImages(Date.now() + 24 * 60 * 60_000)).toEqual([]);
    expect(getImageInfo(second.imageId)?.whiteboardRefs).toEqual(["wb_persisted"]);

    const third = await uploadImage({ buffer: await sharp(await solidPng()).png({ compressionLevel: 0 }).toBuffer(), filename: `expired-${crypto.randomUUID()}.png`, sourceType: "user_upload", createdBy: "test" });
    if (!third.success) throw new Error(third.error.message);
    expect(claimWhiteboardDraftImage(third.imageId, "wb_expired", Date.now() + 1)).toBe(true);
    expect(collectExpiredWhiteboardImages(Date.now() + 2)).toContain(third.imageId);
    expect(getImageInfo(third.imageId)).toBeNull();

    const oldImage = await uploadImage({
      buffer: await sharp({ create: { width: 2, height: 2, channels: 4, background: "#ef4444" } }).png().toBuffer(),
      filename: "old.png",
      sourceType: "user_upload",
      createdBy: "test",
    });
    const newImage = await uploadImage({
      buffer: await sharp({ create: { width: 2, height: 2, channels: 4, background: "#2563eb" } }).png().toBuffer(),
      filename: "new.png",
      sourceType: "user_upload",
      createdBy: "test",
    });
    if (!oldImage.success || !newImage.success) throw new Error("failed to create sync fixtures");
    expect(claimWhiteboardDraftImage(oldImage.imageId, "wb_sync", Date.now() + 60_000)).toBe(true);
    expect(claimWhiteboardDraftImage(newImage.imageId, "wb_sync", Date.now() + 60_000)).toBe(true);
    syncWhiteboardImages([oldImage.imageId], "wb_sync", "wb_sync");
    syncWhiteboardImages([newImage.imageId], "wb_sync", "wb_sync", [oldImage.imageId]);
    expect(getImageInfo(oldImage.imageId)).toBeNull();
    expect(getImageInfo(newImage.imageId)?.whiteboardRefs).toEqual(["wb_sync"]);
  });
});
