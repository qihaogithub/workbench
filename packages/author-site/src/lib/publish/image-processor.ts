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

export interface ImageLocalizationOptions {
  /** 完全跳过外部图片下载，外部 URL 保持原样写入产物 */
  skip?: boolean;
  /** 单张外部图片下载超时（毫秒） */
  timeoutMs?: number;
  /** 外部图片并发下载数 */
  concurrency?: number;
}

export interface ImageProcessOutcome {
  url: string;
  kind: "external" | "local";
  success: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface ImageProcessResult {
  success: boolean;
  urlMap: Map<string, string>;
  errors: UploadResult[];
  imageCount: number;
  /** 逐图结果（按去重后的引用），供干跑报告与错误详情使用 */
  outcomes: ImageProcessOutcome[];
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;
const DEFAULT_IMAGE_CONCURRENCY = 4;
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
  timeoutMs: number,
  redirectCount = 0,
): Promise<{ buffer: Buffer; ext: string }> {
  const url = await assertPublicHttpUrl(rawUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.get('location')
  ) {
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error('TOO_MANY_REDIRECTS');
    }
    const nextUrl = new URL(response.headers.get('location') || '', url);
    return fetchExternalImage(nextUrl.toString(), timeoutMs, redirectCount + 1);
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
  timeoutMs: number,
): Promise<UploadResult> {
  try {
    const { buffer, ext } = await fetchExternalImage(ref.originalPath, timeoutMs);
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
    const reason =
      error instanceof Error
        ? error.name === 'TimeoutError'
          ? `TIMEOUT_${timeoutMs}MS`
          : error.message
        : 'DOWNLOAD_FAILED';
    return {
      localPath: ref.originalPath,
      ossUrl: '',
      ossKey: '',
      size: 0,
      success: false,
      error: reason,
    };
  }
}

/** 简单并发池：以固定并发度执行任务，保序返回 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await run(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
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
  options: ImageLocalizationOptions = {},
): Promise<ImageProcessResult> {
  const { workspacePath, onProgress } = context;
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_IMAGE_CONCURRENCY;

  onProgress?.(0, 100, '扫描图片引用...');
  const references = scanImageReferences(workspacePath).filter(isPublishableReference);

  if (references.length === 0) {
    onProgress?.(100, 100, '未发现需要本地化的图片引用');
    return { success: true, urlMap: new Map(), errors: [], imageCount: 0, outcomes: [] };
  }

  // 按去重键分组：外部引用按 URL、本地引用按绝对路径，同一资源只处理一次
  const uniqueRefs = new Map<string, ImageReference>();
  for (const ref of references) {
    const key = isExternalImageUrl(ref.originalPath)
      ? ref.originalPath
      : ref.absolutePath;
    if (!uniqueRefs.has(key)) uniqueRefs.set(key, ref);
  }

  const urlMap = new Map<string, string>();
  const errors: UploadResult[] = [];
  const outcomes: ImageProcessOutcome[] = [];

  const externalRefs = [...uniqueRefs.values()].filter((ref) =>
    isExternalImageUrl(ref.originalPath),
  );
  const localRefs = [...uniqueRefs.values()].filter(
    (ref) => !isExternalImageUrl(ref.originalPath),
  );

  if (options.skip) {
    onProgress?.(10, 100, `跳过 ${externalRefs.length} 张外部图片下载`);
    for (const ref of externalRefs) {
      outcomes.push({
        url: ref.originalPath,
        kind: 'external',
        success: false,
        skipped: true,
        reason: 'SKIPPED',
      });
    }
  } else if (externalRefs.length > 0) {
    let finished = 0;
    const results = await runWithConcurrency(
      externalRefs,
      concurrency,
      async (ref) => {
        const result = await downloadExternalImage(ref, context, timeoutMs);
        finished += 1;
        const percent = 10 + Math.floor((finished / externalRefs.length) * 70);
        onProgress?.(
          percent,
          100,
          `本地化外部图片 ${finished}/${externalRefs.length}...`,
        );
        return result;
      },
    );
    results.forEach((result, index) => {
      const ref = externalRefs[index];
      if (result.success) {
        urlMap.set(ref.originalPath, result.ossUrl);
        outcomes.push({ url: ref.originalPath, kind: 'external', success: true });
      } else {
        // 外部图片失败不阻断发布，产物保留原 URL
        console.warn(
          `[publish] 外部图片本地化失败，发布产物将保留原 URL: ${ref.originalPath} (${result.error || 'UNKNOWN'})`,
        );
        outcomes.push({
          url: ref.originalPath,
          kind: 'external',
          success: false,
          reason: result.error || 'UNKNOWN',
        });
      }
    });
  }

  for (const ref of localRefs) {
    const result = copyLocalImage(ref, context);
    if (result.success) {
      urlMap.set(ref.originalPath, result.ossUrl);
      outcomes.push({ url: ref.originalPath, kind: 'local', success: true });
    } else {
      errors.push({ ...result, localPath: ref.originalPath });
      outcomes.push({
        url: ref.originalPath,
        kind: 'local',
        success: false,
        reason: result.error || 'UNKNOWN',
      });
    }
  }

  // 同一资源的其余引用路径也要写入 urlMap，保证替换覆盖所有出现位置
  for (const ref of references) {
    if (urlMap.has(ref.originalPath)) continue;
    const key = isExternalImageUrl(ref.originalPath)
      ? ref.originalPath
      : ref.absolutePath;
    const canonical = uniqueRefs.get(key);
    if (canonical && urlMap.has(canonical.originalPath)) {
      urlMap.set(ref.originalPath, urlMap.get(canonical.originalPath) as string);
    }
  }

  onProgress?.(
    100,
    100,
    `图片本地化完成（成功: ${urlMap.size}, 阻断失败: ${errors.length}）`,
  );

  return {
    success: errors.length === 0,
    urlMap,
    errors,
    imageCount: uniqueRefs.size,
    outcomes,
  };
}
