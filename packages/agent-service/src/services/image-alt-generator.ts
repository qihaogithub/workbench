import type { ImageAttachment } from '../core/types';
import { logger } from '../utils/logger';

type AltDescribeFn = (image: ImageAttachment) => Promise<string | null>;

let _altDescriber: AltDescribeFn | null = null;

export function setImageAltDescriber(fn: AltDescribeFn): void {
  _altDescriber = fn;
}

export async function describeImageAlt(image: ImageAttachment): Promise<string | null> {
  if (!_altDescriber) return null;
  try {
    return await _altDescriber(image);
  } catch (error) {
    logger.warn({ error }, 'describeImageAlt failed');
    return null;
  }
}
