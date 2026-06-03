import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OSS from 'ali-oss';
import type { ImageReference, UploadResult } from './types';
import type { OSSConfig } from './oss-config';

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class OSSUploader {
  private client: OSS;
  private projectId: string;
  private pathPrefix: string;

  constructor(config: OSSConfig, projectId: string) {
    this.client = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      endpoint: config.endpoint,
    });
    this.projectId = projectId;
    this.pathPrefix = config.pathPrefix || 'projects';
  }

  async uploadBatch(
    images: ImageReference[],
    options: {
      concurrency?: number;
      onProgress?: (current: number, total: number) => void;
    } = {},
  ): Promise<UploadResult[]> {
    const { concurrency = 5, onProgress } = options;
    const results: UploadResult[] = [];

    const uniqueImages = this.dedupe(images);
    const total = uniqueImages.length;

    if (total === 0) return results;

    let completed = 0;

    for (let i = 0; i < uniqueImages.length; i += concurrency) {
      const chunk = uniqueImages.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((img) => this.uploadSingle(img)),
      );
      results.push(...chunkResults);
      completed += chunk.length;
      onProgress?.(completed, total);
    }

    return results;
  }

  private async uploadSingle(image: ImageReference): Promise<UploadResult> {
    try {
      if (!isAllowedImage(image.absolutePath)) {
        return {
          localPath: image.originalPath,
          ossUrl: '',
          ossKey: '',
          size: 0,
          success: false,
          error: 'INVALID_FILE_TYPE',
        };
      }

      if (!fs.existsSync(image.absolutePath)) {
        return {
          localPath: image.originalPath,
          ossUrl: '',
          ossKey: '',
          size: 0,
          success: false,
          error: 'FILE_NOT_FOUND',
        };
      }

      const stat = fs.statSync(image.absolutePath);
      if (stat.size > MAX_FILE_SIZE) {
        return {
          localPath: image.originalPath,
          ossUrl: '',
          ossKey: '',
          size: stat.size,
          success: false,
          error: 'FILE_TOO_LARGE',
        };
      }

      const ossKey = this.generateOSSKey(image.absolutePath);
      const result = await this.client.put(ossKey, image.absolutePath);

      return {
        localPath: image.originalPath,
        ossUrl: result.url || '',
        ossKey: result.name || ossKey,
        size: stat.size,
        success: true,
      };
    } catch (error) {
      return {
        localPath: image.originalPath,
        ossUrl: '',
        ossKey: '',
        size: 0,
        success: false,
        error: error instanceof Error ? error.message : 'UPLOAD_FAILED',
      };
    }
  }

  private generateOSSKey(absolutePath: string): string {
    const ext = path.extname(absolutePath);
    const baseName = path.basename(absolutePath, ext);
    const hash = crypto
      .createHash('md5')
      .update(absolutePath + Date.now())
      .digest('hex')
      .slice(0, 8);

    return `${this.pathPrefix}/${this.projectId}/images/${baseName}-${hash}${ext}`;
  }

  private dedupe(images: ImageReference[]): ImageReference[] {
    const seen = new Set<string>();
    return images.filter((img) => {
      const key = img.absolutePath;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function isAllowedImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}
