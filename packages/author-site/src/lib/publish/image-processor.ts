import crypto from 'crypto';
import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import type { ImageReference, PublishContext, UploadResult } from './types';
import {
  isApiImagePath,
  isExternalImageUrl,
  isLocalPath,
  isSessionAssetPath,
  scanImageReferences,
} from './image-scanner';

export interface ImageProcessResult {
  success: boolean;
  urlMap: Map<string, string>;
  errors: UploadResult[];
  imageCount: number;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg'],
]);

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map((part) => Number(part));
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:') ||
      normalized === '::'
    );
  }

  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_URL_PROTOCOL');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('PRIVATE_NETWORK_BLOCKED');
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error('PRIVATE_NETWORK_BLOCKED');
  }
  return url;
}

function ensureAssetDir(publishDir: string): string {
  const dir = path.join(publishDir, 'assets', 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function localUrl(projectId: string, filename: string): string {
  return `/data/${projectId}/assets/images/${filename}`;
}

function extensionFromLocalPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext || '.bin';
}

function contentTypeExtension(contentType: string | null): string {
  const normalized = (contentType || '').split(';')[0]?.trim().toLowerCase();
  const ext = normalized ? ALLOWED_CONTENT_TYPES.get(normalized) : undefined;
  if (!ext) {
    throw new Error('INVALID_CONTENT_TYPE');
  }
  return ext;
}

function copyLocalImage(
  ref: ImageReference,
  context: PublishContext,
): UploadResult {
  if (!fs.existsSync(ref.absolutePath)) {
    return {
      localPath: ref.originalPath,
      ossUrl: '',
      ossKey: '',
      size: 0,
      success: false,
      error: 'FILE_NOT_FOUND',
    };
  }

  const stat = fs.statSync(ref.absolutePath);
  if (!stat.isFile()) {
    return {
      localPath: ref.originalPath,
      ossUrl: '',
      ossKey: '',
      size: 0,
      success: false,
      error: 'FILE_NOT_FOUND',
    };
  }
  if (stat.size > MAX_IMAGE_SIZE) {
    return {
      localPath: ref.originalPath,
      ossUrl: '',
      ossKey: '',
      size: stat.size,
      success: false,
      error: 'FILE_TOO_LARGE',
    };
  }

  const buffer = fs.readFileSync(ref.absolutePath);
  const filename = `${hashBuffer(buffer).slice(0, 24)}${extensionFromLocalPath(ref.absolutePath)}`;
  const assetDir = ensureAssetDir(context.publishDir);
  fs.writeFileSync(path.join(assetDir, filename), buffer);
  return {
    localPath: ref.originalPath,
    ossUrl: localUrl(context.projectId, filename),
    ossKey: `assets/images/${filename}`,
    size: buffer.length,
    success: true,
  };
}

async function fetchExternalImage(
  rawUrl: string,
  redirectCount = 0,
): Promise<{ buffer: Buffer; ext: string }> {
  const url = await assertPublicHttpUrl(rawUrl);
  const response = await fetch(url, { redirect: 'manual' });

  if (
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.get('location')
  ) {
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error('TOO_MANY_REDIRECTS');
    }
    const nextUrl = new URL(response.headers.get('location') || '', url);
    return fetchExternalImage(nextUrl.toString(), redirectCount + 1);
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const ext = contentTypeExtension(response.headers.get('content-type'));
  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > MAX_IMAGE_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }
  return { buffer, ext };
}

async function downloadExternalImage(
  ref: ImageReference,
  context: PublishContext,
): Promise<UploadResult> {
  try {
    const { buffer, ext } = await fetchExternalImage(ref.originalPath);
    const filename = `${hashBuffer(buffer).slice(0, 24)}${ext}`;
    const assetDir = ensureAssetDir(context.publishDir);
    fs.writeFileSync(path.join(assetDir, filename), buffer);
    return {
      localPath: ref.originalPath,
      ossUrl: localUrl(context.projectId, filename),
      ossKey: `assets/images/${filename}`,
      size: buffer.length,
      success: true,
    };
  } catch (error) {
    return {
      localPath: ref.originalPath,
      ossUrl: '',
      ossKey: '',
      size: 0,
      success: false,
      error: error instanceof Error ? error.message : 'DOWNLOAD_FAILED',
    };
  }
}

function isPublishableReference(ref: ImageReference): boolean {
  return (
    isExternalImageUrl(ref.originalPath) ||
    isLocalPath(ref.originalPath) ||
    isApiImagePath(ref.originalPath) ||
    isSessionAssetPath(ref.originalPath)
  );
}

export async function processImagesForPublish(
  context: PublishContext,
): Promise<ImageProcessResult> {
  const { workspacePath, onProgress } = context;

  onProgress?.(0, 100, '扫描图片引用...');
  const references = scanImageReferences(workspacePath).filter(isPublishableReference);

  if (references.length === 0) {
    onProgress?.(100, 100, '未发现需要本地化的图片引用');
    return { success: true, urlMap: new Map(), errors: [], imageCount: 0 };
  }

  const urlMap = new Map<string, string>();
  const errors: UploadResult[] = [];
  const cache = new Map<string, UploadResult>();

  for (let index = 0; index < references.length; index += 1) {
    const ref = references[index];
    const cacheKey = ref.absolutePath;
    const cached = cache.get(cacheKey);
    const result = cached || (isExternalImageUrl(ref.originalPath)
      ? await downloadExternalImage(ref, context)
      : copyLocalImage(ref, context));
    cache.set(cacheKey, result);

    if (result.success) {
      urlMap.set(ref.originalPath, result.ossUrl);
    } else {
      if (isExternalImageUrl(ref.originalPath)) {
        console.warn(
          `[publish] 外部图片本地化失败，发布产物将保留原 URL: ${ref.originalPath} (${result.error || 'UNKNOWN'})`,
        );
      } else {
        errors.push({ ...result, localPath: ref.originalPath });
      }
    }

    const percent = 10 + Math.floor(((index + 1) / references.length) * 80);
    onProgress?.(percent, 100, `本地化图片 ${index + 1}/${references.length}...`);
  }

  onProgress?.(100, 100, `图片本地化完成（成功: ${urlMap.size}, 阻断失败: ${errors.length}）`);

  return {
    success: errors.length === 0,
    urlMap,
    errors,
    imageCount: references.length,
  };
}
