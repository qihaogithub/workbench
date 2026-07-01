import type { ImageAttachment } from '../core/types';

const DATA_URL_BASE64_RE = /^data:([^;,]+);base64,(.*)$/s;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function normalizeBase64Data(data: string): string {
  return data.replace(/\s/g, '');
}

function assertBase64Data(data: string, index: number): void {
  if (!data || !BASE64_RE.test(data)) {
    throw new Error(`图片附件 ${index + 1} 不是合法 base64 数据`);
  }
}

function normalizeImageAttachment(image: ImageAttachment, index: number): ImageAttachment {
  let mimeType = image.mimeType.trim();
  let data = normalizeBase64Data(image.data.trim());
  const dataUrlMatch = data.match(DATA_URL_BASE64_RE);

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].trim();
    data = normalizeBase64Data(dataUrlMatch[2]);
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error(`图片附件 ${index + 1} 的 MIME 类型无效`);
  }

  assertBase64Data(data, index);

  return {
    ...image,
    data,
    mimeType,
  };
}

export function normalizeImageAttachments(
  images?: ImageAttachment[],
): ImageAttachment[] | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }

  return images.map((image, index) => normalizeImageAttachment(image, index));
}
