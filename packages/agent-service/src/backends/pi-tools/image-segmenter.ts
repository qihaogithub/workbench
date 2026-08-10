import { logger } from "../../utils/logger";
import { readGlobalImageById } from "./global-image-store";

export interface SegmentResult {
  success: true;
  /** 8-bit 灰度 mask，与原始图片同尺寸（前景=255，背景=0） */
  mask: Buffer;
  width: number;
  height: number;
  /** 是否确认为空（未找到目标元素） */
  empty: boolean;
}

export interface SegmentError {
  success: false;
  error: string;
}

export type SegmentImageElementResult = SegmentResult | SegmentError;

/**
 * 使用 CLIPSeg 做零样本文本-图像分割，抠出与 element 语义匹配的像素区域。
 *
 * 模型懒加载（首次调用时下载约 340MB），进程内单例复用。
 * 返回原图尺寸的 8-bit mask（前景=255，背景=0）。
 */
export async function segmentImageElementByText(
  imageId: string,
  element: string,
  threshold = 0.5,
): Promise<SegmentImageElementResult> {
  const read = readGlobalImageById(imageId);
  if (!read.success) {
    return { success: false, error: `无法读取图片: ${read.error}` };
  }
  const buffer = Buffer.from(read.data, "base64");

  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      return { success: false, error: "无法解析图片尺寸" };
    }

    const runner = await getClipSegRunner();
    const mask = await runner.run(buffer, element);
    const maskBuffer = await resizeMask(mask, width, height, threshold);

    if (isMaskEmpty(maskBuffer)) {
      logger.info(
        { imageId, element, threshold },
        "image-segmenter: mask is all black, element not found",
      );
      return { success: true, mask: maskBuffer, width, height, empty: true };
    }

    return { success: true, mask: maskBuffer, width, height, empty: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { imageId, element, error: message },
      "image-segmenter: segmentation failed",
    );
    return { success: false, error: message };
  }
}

function isMaskEmpty(mask: Buffer): boolean {
  const step = Math.max(1, Math.floor(mask.length / 4096));
  for (let i = 0; i < mask.length; i += step) {
    if (mask[i] > 0) return false;
  }
  return true;
}

async function resizeMask(
  maskBuffer: Buffer,
  width: number,
  height: number,
  threshold: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const resized = await sharp(maskBuffer, {
    raw: { width: 352, height: 352, channels: 1 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const cut = Math.round(threshold * 255);
  for (let i = 0; i < resized.length; i++) {
    resized[i] = resized[i] >= cut ? 255 : 0;
  }
  return resized;
}

let clipSegRunner: ClipSegRunner | null = null;

async function getClipSegRunner(): Promise<ClipSegRunner> {
  if (clipSegRunner) return clipSegRunner;
  const instance = new ClipSegRunner();
  await instance.load();
  clipSegRunner = instance;
  return instance;
}

class ClipSegRunner {
  private model: any = null;
  private tokenizer: any = null;
  private processor: any = null;
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const tf = await import("@xenova/transformers");
    const modelId = "Xenova/clipseg-rd64-refined";
    logger.info(
      { modelId },
      "image-segmenter: loading CLIPSeg model (first call may take a while)",
    );
    const [tok, proc, model] = await Promise.all([
      tf.AutoTokenizer.from_pretrained(modelId),
      tf.AutoProcessor.from_pretrained(modelId),
      tf.CLIPSegForImageSegmentation.from_pretrained(modelId),
    ]);
    this.tokenizer = tok;
    this.processor = proc;
    this.model = model;
    this.loaded = true;
  }

  async run(imageBuffer: Buffer, element: string): Promise<Buffer> {
    const { RawImage } = await import("@xenova/transformers");
    const image = await RawImage.fromBlob(
      new Blob([imageBuffer as unknown as BlobPart]),
    );

    const textInputs = this.tokenizer(element, {
      padding: true,
      truncation: true,
    });
    const imageInputs = await this.processor(image);
    const { logits } = await this.model({ ...textInputs, ...imageInputs });

    // logits: [1, 352, 352] (float32)。unsqueeze → sigmoid → 阈值 → uint8 mask
    const maskTensor = logits
      .unsqueeze_(1)
      .sigmoid_()
      .mul_(255)
      .round_()
      .to("uint8");

    const mask = RawImage.fromTensor(maskTensor[0]);
    const raw = await mask.toSharp().raw().toBuffer();
    return Buffer.from(raw);
  }
}

export function resetClipSegSingleton(): void {
  clipSegRunner = null;
}