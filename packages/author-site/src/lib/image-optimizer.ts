import sharp from "sharp";

export const OPTIMIZATION_MIN_BYTES = 500 * 1024;
const JPEG_MIN_SAVINGS_RATIO = 0.1;
const PNG_LOSSY_MIN_SAVINGS_RATIO = 0.25;

export interface ImageOptimizationResult {
  buffer: Buffer;
  optimized: boolean;
}

/**
 * Compresses eligible raster uploads without changing their file format or
 * raster dimensions. Optimisation is deliberately best-effort: unsupported
 * or malformed inputs continue through the image store unchanged.
 */
export async function optimizeRasterImage(params: {
  buffer: Buffer;
  extension: string;
}): Promise<ImageOptimizationResult> {
  const { buffer, extension } = params;

  if (buffer.length <= OPTIMIZATION_MIN_BYTES) {
    return { buffer, optimized: false };
  }

  try {
    if (extension === "jpg" || extension === "jpeg") {
      return optimizeJpeg(buffer);
    }

    if (extension === "png") {
      return optimizeStaticPng(buffer);
    }
  } catch {
    // Optimisation must never prevent a valid image upload from completing.
  }

  return { buffer, optimized: false };
}

async function optimizeJpeg(buffer: Buffer): Promise<ImageOptimizationResult> {
  const candidate = await sharp(buffer)
    // Preserve EXIF orientation and colour metadata. No rotate() or resize()
    // is used, so the uploaded raster dimensions remain unchanged.
    .withMetadata()
    .jpeg({
      quality: 82,
      progressive: true,
      mozjpeg: true,
    })
    .toBuffer();

  return candidate.length <= buffer.length * (1 - JPEG_MIN_SAVINGS_RATIO)
    ? { buffer: candidate, optimized: true }
    : { buffer, optimized: false };
}

async function optimizeStaticPng(buffer: Buffer): Promise<ImageOptimizationResult> {
  const metadata = await sharp(buffer, { animated: true }).metadata();
  if ((metadata.pages ?? 1) > 1) {
    return { buffer, optimized: false };
  }

  const lossless = await sharp(buffer)
    .withMetadata()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  const lossy = await sharp(buffer)
    .withMetadata()
    .png({
      palette: true,
      quality: 92,
      effort: 7,
      dither: 1,
    })
    .toBuffer();

  if (
    lossy.length < lossless.length &&
    lossy.length <= buffer.length * (1 - PNG_LOSSY_MIN_SAVINGS_RATIO)
  ) {
    return { buffer: lossy, optimized: true };
  }

  return lossless.length < buffer.length
    ? { buffer: lossless, optimized: true }
    : { buffer, optimized: false };
}
