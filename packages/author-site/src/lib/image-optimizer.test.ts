import sharp from "sharp";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { OPTIMIZATION_MIN_BYTES, optimizeRasterImage } from "./image-optimizer";

function createNoise(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  let state = 0x12345678;

  for (let index = 0; index < pixels.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    pixels[index] = state & 0xff;
  }

  return pixels;
}

function createPaletteImage(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  const colours = [
    [25, 44, 86, 255],
    [58, 109, 140, 255],
    [243, 190, 83, 255],
    [244, 102, 89, 255],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const colour = colours[(Math.floor(x / 24) + Math.floor(y / 24)) % colours.length];
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = colour[3];
    }
  }

  return pixels;
}

describe("optimizeRasterImage", () => {
  it("skips files at or below the 500KiB threshold", async () => {
    const source = Buffer.alloc(OPTIMIZATION_MIN_BYTES);

    const result = await optimizeRasterImage({ buffer: source, extension: "jpg" });

    expect(result).toEqual({ buffer: source, optimized: false });
  });

  it("compresses large JPEGs without changing raster dimensions or format", async () => {
    const width = 1400;
    const height = 1000;
    const source = await sharp(createNoise(width, height), {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toBuffer();
    expect(source.length).toBeGreaterThan(OPTIMIZATION_MIN_BYTES);

    const result = await optimizeRasterImage({ buffer: source, extension: "jpeg" });
    const metadata = await sharp(result.buffer).metadata();

    expect(result.optimized).toBe(true);
    expect(result.buffer.length).toBeLessThanOrEqual(source.length * 0.9);
    expect(metadata).toMatchObject({ format: "jpeg", width, height });
  });

  it("compresses large static PNGs without changing raster dimensions or format", async () => {
    const width = 1200;
    const height = 900;
    const source = await sharp(createPaletteImage(width, height), {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(source.length).toBeGreaterThan(OPTIMIZATION_MIN_BYTES);

    const result = await optimizeRasterImage({ buffer: source, extension: "png" });
    const metadata = await sharp(result.buffer).metadata();

    expect(result.optimized).toBe(true);
    expect(result.buffer.length).toBeLessThan(source.length);
    expect(metadata).toMatchObject({ format: "png", width, height });
  });
});

describe("optimizeStoredImages", () => {
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-image-store-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("replaces an eligible stored JPEG and removes its unreferenced source blob", async () => {
    const width = 1400;
    const height = 1000;
    const source = await sharp(createNoise(width, height), {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const sha256 = crypto.createHash("sha256").update(source).digest("hex");
    const blobDir = path.join(dataDir, "image-store", "blobs");
    const sourcePath = path.join(blobDir, `${sha256.slice(0, 16)}.jpg`);
    fs.mkdirSync(blobDir, { recursive: true });
    fs.writeFileSync(sourcePath, source);
    fs.writeFileSync(
      path.join(dataDir, "image-store", "manifest.json"),
      JSON.stringify({
        version: 1,
        images: [
          {
            id: "img_existing",
            sha256,
            filename: "existing.jpg",
            mimeType: "image/jpeg",
            sizeBytes: source.length,
            width,
            height,
            sourceType: "user_upload",
            createdAt: Date.now(),
            createdBy: "test",
            projectRefs: [],
          },
        ],
      }),
      "utf-8",
    );

    const { getImage, getImageInfo, optimizeStoredImages } = await import("./image-store");
    const dryRun = await optimizeStoredImages({ dryRun: true });

    expect(dryRun).toMatchObject({ dryRun: true, scanned: 1, eligible: 1, optimized: 1, failed: 0 });
    expect(fs.existsSync(sourcePath)).toBe(true);

    const report = await optimizeStoredImages();
    const info = getImageInfo("img_existing");
    const stored = getImage("img_existing");

    expect(report).toMatchObject({ dryRun: false, scanned: 1, eligible: 1, optimized: 1, failed: 0 });
    expect(report.bytesSaved).toBeGreaterThan(0);
    expect(info?.sizeBytes).toBeLessThan(source.length);
    expect(info?.sha256).not.toBe(sha256);
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(stored.buffer).toBeDefined();
    await expect(sharp(stored.buffer).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width,
      height,
    });
  });
});
