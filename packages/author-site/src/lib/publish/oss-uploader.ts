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

      const contentHash = this.computeFileMD5(image.absolutePath);
      const ossKey = this.generateOSSKey(contentHash, image.absolutePath);

      // 检查 OSS 上是否已存在相同内容的文件
      const existing = await this.checkIfExists(ossKey);
      if (existing) {
        return {
          localPath: image.originalPath,
          ossUrl: existing.url,
          ossKey,
          size: stat.size,
          success: true,
        };
      }

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

  private computeFileMD5(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  private generateOSSKey(contentMD5: string, filePath: string): string {
    const ext = path.extname(filePath);
    return `${this.pathPrefix}/${this.projectId}/images/${contentMD5}${ext}`;
  }

  private async checkIfExists(ossKey: string): Promise<{ url: string } | null> {
    try {
      const result = await this.client.head(ossKey);
      // head 成功说明文件已存在，拼接访问 URL
      const url = this.client.generateObjectUrl(ossKey);
      return { url };
    } catch {
      return null;
    }
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
