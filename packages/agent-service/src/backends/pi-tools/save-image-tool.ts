import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import {
  addProjectImageManifestEntry,
  findProjectImageManifestEntry,
  getProjectImageManifestDataDir,
  resolveProjectImageManifestProjectId,
  type ProjectImageEntry,
} from './project-image-manifest';
import {
  uploadToGlobalImageStore,
} from './global-image-store';

const SUPPORTED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

const URL_DOWNLOAD_TIMEOUT = 10_000;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const BATCH_MAX_CONCURRENT = 5;

const BatchUrlItem = Type.Object({
  url: Type.String({ description: '图片 URL' }),
  filename: Type.Optional(Type.String({ description: '保存文件名，如 product.png，不提供则从 URL 自动提取' })),
});

const SaveImageParams = Type.Object({
  source: Type.Union([
    Type.Literal('assetId'),
    Type.Literal('sessionAsset'),
    Type.Literal('base64'),
    Type.Literal('url'),
  ], {
    description: '图片来源：assetId/sessionAsset 为平台受管资源，base64 为内联数据，url 为远程兜底',
  }),
  data: Type.Optional(Type.String({
    description:
      '图片数据：source=base64 时为 Base64 编码字符串；source=url 时为图片 URL；source=sessionAsset 时可传 session asset URL',
  })),
  urls: Type.Optional(Type.Array(BatchUrlItem, {
    description: '批量下载：source=url 时可一次下载多张图片，每个元素包含 url 和可选 filename。与 data 互斥，优先使用 urls',
  })),
  filename: Type.Optional(Type.String({
    description: '保存的文件名，如 product.png',
  })),
  assetId: Type.Optional(Type.String({
    description: 'source=assetId 时的项目资产 ID，如 asset_7007557cac7e',
  })),
  url: Type.Optional(Type.String({
    description: 'source=sessionAsset 时的 /api/sessions/{sessionId}/assets/{filename} URL',
  })),
  directory: Type.Optional(
    Type.String({
      description: '已废弃：图片统一保存到当前项目工作区 assets/images/ 下，忽略此参数',
    }),
  ),
});

type SaveImageParams = Static<typeof SaveImageParams>;

function getDemoRelativeAssetPathFromWorkspacePath(workspacePath: string): string {
  return `../../${workspacePath}`;
}

function normalizeStoredFilename(filename: string): string {
  return path.basename(filename).replace(/[^a-zA-Z0-9_.-]/g, '-');
}

function getFilenameFromUrl(urlString: string): string | null {
  try {
    const parsed = new URL(urlString, 'http://local.invalid');
    const filename = path.basename(parsed.pathname);
    return filename || null;
  } catch {
    return null;
  }
}

function resolveSessionAssetPath(dataDir: string, urlString: string): {
  filePath?: string;
  filename?: string;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(urlString, 'http://local.invalid');
  } catch {
    return { error: 'Invalid session asset URL' };
  }
  const match = parsed.pathname.match(/^\/api\/sessions\/([^/]+)\/assets\/([^/]+)$/);
  if (!match) return { error: 'Expected /api/sessions/{sessionId}/assets/{filename}' };
  const sessionId = decodeURIComponent(match[1]);
  const filename = normalizeStoredFilename(decodeURIComponent(match[2]));
  if (!sessionId || !filename) return { error: 'Invalid session asset URL' };
  const filePath = path.join(dataDir, 'sessions', sessionId, 'assets', filename);
  if (!fs.existsSync(filePath)) return { error: 'Session asset file not found' };
  return { filePath, filename };
}

function downloadImageFromUrl(
  urlString: string,
  signal?: AbortSignal,
): Promise<{
  buffer?: Buffer;
  error?: string;
  errorCode?: string;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return Promise.resolve({
      error: 'Invalid URL format',
      errorCode: 'invalid_url',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return Promise.resolve({
      error: 'Only http:// and https:// URLs are allowed',
      errorCode: 'invalid_protocol',
    });
  }

  const MAX_REDIRECTS = 3;

  const internalController = new AbortController();
  const dnsTimeout = setTimeout(() => internalController.abort(), URL_DOWNLOAD_TIMEOUT);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(dnsTimeout);
      return Promise.resolve({ error: 'Download cancelled', errorCode: 'download_cancelled' });
    }
    signal.addEventListener('abort', () => internalController.abort(), { once: true });
  }

  function doDownload(url: string, redirectCount: number): Promise<{
    buffer?: Buffer;
    error?: string;
    errorCode?: string;
  }> {
    return new Promise((resolve) => {
      if (internalController.signal.aborted) {
        clearTimeout(dnsTimeout);
        resolve({
          error: 'Download cancelled',
          errorCode: 'download_cancelled',
        });
        return;
      }

      const client = url.startsWith('https') ? https : http;

      const req = client.get(
        url,
        { timeout: URL_DOWNLOAD_TIMEOUT, signal: internalController.signal },
        (res) => {
          if (internalController.signal.aborted) {
            res.destroy();
            clearTimeout(dnsTimeout);
            resolve({
              error: 'Download cancelled',
              errorCode: 'download_cancelled',
            });
            return;
          }

          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirectCount >= MAX_REDIRECTS) {
              res.destroy();
              resolve({
                error: 'Too many redirects (max 3)',
                errorCode: 'download_failed',
              });
              return;
            }
            const redirectUrl = res.headers.location;
            res.destroy();
            doDownload(redirectUrl, redirectCount + 1).then(resolve);
            return;
          }

          if (res.statusCode !== 200) {
            res.destroy();
            resolve({
              error: `HTTP ${res.statusCode} when downloading image`,
              errorCode: 'download_failed',
            });
            return;
          }

          const contentType = res.headers['content-type'] || '';
          if (!contentType.startsWith('image/')) {
            res.destroy();
            resolve({
              error: `URL does not point to an image (Content-Type: ${contentType})`,
              errorCode: 'not_an_image',
            });
            return;
          }

          const chunks: Buffer[] = [];
          let totalSize = 0;

          res.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE) {
              res.destroy();
              resolve({
                error: 'Image exceeds 10MB size limit',
                errorCode: 'file_too_large',
              });
              return;
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            resolve({ buffer: Buffer.concat(chunks) });
          });

          res.on('error', (err) => {
            resolve({
              error: `Download error: ${err.message}`,
              errorCode: 'download_failed',
            });
          });
        },
      );

      const onAbort = () => {
        req.destroy();
        clearTimeout(dnsTimeout);
        resolve({
          error: 'Download cancelled',
          errorCode: 'download_cancelled',
        });
      };

      if (internalController.signal.aborted) {
        onAbort();
        return;
      }
      internalController.signal.addEventListener('abort', onAbort, { once: true });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          error: `Download timed out after ${URL_DOWNLOAD_TIMEOUT / 1000}s`,
          errorCode: 'download_timeout',
        });
      });

      req.on('error', (err) => {
        resolve({
          error: `Network error: ${err.message}`,
          errorCode: 'download_failed',
        });
      });
    });
  }

  return doDownload(urlString, 0).finally(() => {
    clearTimeout(dnsTimeout);
  });
}

interface SaveBufferResult {
  success: boolean;
  imageId?: string;
  url?: string;
  workspacePath?: string;
  relativePathFromPage?: string;
  storedFilename?: string;
  size?: number;
  format?: string;
  sha256?: string;
  error?: string;
  reused?: boolean;
}

async function saveImageBuffer(
  buffer: Buffer,
  filename: string,
  source: string,
  originalUrl: string | undefined,
  _workspaceDir: string,
  manifestProjectId: string | null,
  _sessionId: string,
): Promise<SaveBufferResult> {
  const sourceType =
    source === 'session_asset' ? 'session_asset' as const
    : source === 'base64' ? 'ai_generated' as const
    : 'remote_url' as const;

  const result = uploadToGlobalImageStore({
    buffer,
    filename,
    sourceType,
    sourceUrl: originalUrl,
    projectId: manifestProjectId ?? undefined,
    createdBy: 'ai-agent',
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (manifestProjectId) {
    const entry: ProjectImageEntry = {
      id: result.sha256.slice(0, 12),
      filename: result.filename,
      url: result.url,
      size: result.sizeBytes,
      format: path.extname(filename).slice(1).toLowerCase(),
      createdAt: Date.now(),
      createdBy: 'ai',
      contentHash: result.sha256,
      mimeType: result.mimeType,
      originalUrl,
      sourceType: source === 'session_asset' ? 'session_asset' : 'remote_url',
    };
    try {
      addProjectImageManifestEntry(manifestProjectId, entry);
    } catch (manifestError) {
      logger.warn({ projectId: manifestProjectId, error: manifestError }, 'saveImage: failed to update project image manifest');
    }
  }

  return {
    success: true,
    imageId: result.imageId,
    url: result.url,
    workspacePath: result.url,
    relativePathFromPage: result.url,
    storedFilename: result.filename,
    size: result.sizeBytes,
    format: path.extname(filename).slice(1).toLowerCase(),
    sha256: result.sha256.slice(0, 12),
    reused: result.deduplicated,
  };
}

interface BatchUrlItem {
  url: string;
  filename?: string;
}

interface BatchSaveResult {
  url: string;
  success: boolean;
  filename?: string;
  workspacePath?: string;
  relativePathFromPage?: string;
  size?: number;
  format?: string;
  sha256?: string;
  error?: string;
  reused?: boolean;
}

async function saveImageBatch(
  items: BatchUrlItem[],
  signal: AbortSignal | undefined,
  workspaceDir: string,
  manifestProjectId: string | null,
  sessionId: string,
): Promise<BatchSaveResult[]> {
  const results: BatchSaveResult[] = [];
  const queue = [...items];

  async function processNext() {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const item = queue.shift()!;
      const result: BatchSaveResult = { url: item.url, success: false };

      if (signal?.aborted) {
        result.error = 'Download cancelled';
        results.push(result);
        continue;
      }

      const downloadResult = await downloadImageFromUrl(item.url, signal);
      if (downloadResult.error) {
        logger.warn({ url: item.url, error: downloadResult.error }, 'saveImage batch: URL download failed');
        result.error = downloadResult.error;
        results.push(result);
        continue;
      }

      const filename = item.filename?.trim() || getFilenameFromUrl(item.url) || 'image.png';
      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        result.error = `Invalid filename "${filename}" from URL`;
        results.push(result);
        continue;
      }

      const saveResult = await saveImageBuffer(
        downloadResult.buffer!,
        filename,
        'url',
        item.url,
        workspaceDir,
        manifestProjectId,
        sessionId,
      );

      if (saveResult.success) {
        result.success = true;
        result.filename = saveResult.storedFilename;
        result.workspacePath = saveResult.workspacePath;
        result.relativePathFromPage = saveResult.relativePathFromPage;
        result.size = saveResult.size;
        result.format = saveResult.format;
        result.sha256 = saveResult.sha256;
        result.reused = saveResult.reused;
      } else {
        result.error = saveResult.error;
      }

      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(BATCH_MAX_CONCURRENT, items.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

export function createSaveImageTool(config: AgentConfig): AgentTool<typeof SaveImageParams> {
  return {
    name: 'saveImage',
    label: 'Save Image',
    description:
      'Save or reuse images to the global image store. For a single URL image set source=url and provide data (the URL). For batch downloading multiple images at once, set source=url and provide urls array with {url, filename?} items — all downloads run concurrently (max 5 at a time). Prefer source=assetId or source=sessionAsset when a platform-managed asset already exists; base64 and url are fallbacks. Images are stored in the global image store with durable URLs. Use /api/images/{imageId} directly in page code (img src) and config.schema.json defaults. Supports png, jpg, jpeg, gif, webp, svg formats. Max 10MB per image.',
    parameters: SaveImageParams,
    execute: async (toolCallId: string, args: SaveImageParams, signal?: AbortSignal) => {
      const { source } = args;

      const workspaceDir = config.workingDir ? path.resolve(config.workingDir) : '';
      if (!workspaceDir) {
        return {
          content: [{ type: 'text', text: 'Error: saveImage requires a bound project workspace.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

      const manifestProjectId = resolveProjectImageManifestProjectId(config);

      if (source === 'assetId') {
        const assetId = args.assetId?.trim() || args.data?.trim() || '';
        if (!assetId) {
          return {
            content: [{ type: 'text', text: 'Error: source=assetId requires assetId.' }],
            details: { error: 'missing_asset_id' },
            isError: true,
          };
        }
        if (!manifestProjectId) {
          return {
            content: [{ type: 'text', text: 'Error: No project associated with this session. Cannot resolve assetId.' }],
            details: { error: 'missing_project' },
            isError: true,
          };
        }
        const entry = findProjectImageManifestEntry(manifestProjectId, assetId);
        if (!entry) {
          return {
            content: [{ type: 'text', text: `Error: Asset not found: ${assetId}` }],
            details: { error: 'asset_not_found' },
            isError: true,
          };
        }
        const workspacePath = entry.url;
        const absolutePath = path.join(workspaceDir, workspacePath);
        if (!workspacePath.startsWith('assets/') || !fs.existsSync(absolutePath)) {
          return {
            content: [{ type: 'text', text: `Error: Managed asset file is missing: ${workspacePath}` }],
            details: { error: 'asset_file_missing', path: workspacePath },
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Image already available: ${workspacePath}. Use ${getDemoRelativeAssetPathFromWorkspacePath(workspacePath)} in page files or /api/images/{imageId} for config schema defaults.`,
            },
          ],
          details: {
            assetId: `asset_${entry.id}`,
            url: workspacePath,
            path: workspacePath,
            filename: path.basename(workspacePath),
            relativePathFromPage: getDemoRelativeAssetPathFromWorkspacePath(workspacePath),
            absolutePath,
            size: entry.size,
            format: entry.format,
            source,
            sha256: entry.contentHash?.slice(0, 12) ?? entry.id,
            contentHash: entry.contentHash,
          },
        };
      }

      let filename = args.filename?.trim() || '';
      if (source === 'sessionAsset' && !filename) {
        filename = getFilenameFromUrl(args.url ?? args.data ?? '') ?? '';
      }

      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        logger.warn({ filename }, 'saveImage: invalid filename');
        return {
          content: [{ type: 'text', text: `Error: Invalid filename "${filename}". Use alphanumeric, hyphens, and underscores only.` }],
          details: { error: 'invalid_filename' },
          isError: true,
        };
      }

      const ext = path.extname(filename).slice(1).toLowerCase();
      if (!SUPPORTED_FORMATS.has(ext)) {
        logger.warn({ filename, ext }, 'saveImage: unsupported format');
        return {
          content: [{ type: 'text', text: `Error: Unsupported image format ".${ext}". Supported: ${[...SUPPORTED_FORMATS].join(', ')}` }],
          details: { error: 'invalid_format' },
          isError: true,
        };
      }

      let buffer: Buffer;

      if (source === 'base64') {
        const data = args.data ?? '';
        try {
          buffer = Buffer.from(data, 'base64');
          if (buffer.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: Empty Base64 data' }],
              details: { error: 'invalid_base64' },
              isError: true,
            };
          }
        } catch {
          return {
            content: [{ type: 'text', text: 'Error: Invalid Base64 data' }],
            details: { error: 'invalid_base64' },
            isError: true,
          };
        }
      } else if (source === 'sessionAsset') {
        const sessionAssetUrl = args.url ?? args.data ?? '';
        const resolved = resolveSessionAssetPath(getProjectImageManifestDataDir(), sessionAssetUrl);
        if (!resolved.filePath) {
          return {
            content: [{ type: 'text', text: `Error: ${resolved.error ?? 'Session asset not found'}` }],
            details: { error: 'session_asset_not_found' },
            isError: true,
          };
        }
        buffer = await fs.promises.readFile(resolved.filePath);
      } else if (source === 'url' && args.urls && args.urls.length > 0) {
        const batchResults = await saveImageBatch(
          args.urls.map((item) => ({ url: item.url, filename: item.filename })),
          signal,
          workspaceDir,
          manifestProjectId,
          config.sessionId,
        );

        const successCount = batchResults.filter((r) => r.success).length;
        const failCount = batchResults.filter((r) => !r.success).length;
        const items = batchResults.map((r) => {
          if (r.success) {
            const reused = r.reused ? ' (已存在，复用)' : '';
            return `${r.url} → ${r.workspacePath}${reused}`;
          }
          return `${r.url} → 失败: ${r.error}`;
        });

        let text = `批量下载完成: ${successCount} 成功, ${failCount} 失败\n${items.join('\n')}`;
        if (failCount === 0) {
          text += `\n\n所有图片已保存到全局图床，页面代码和 config.schema.json 中直接使用 /api/images/{imageId} 引用。`;
        }

        return {
          content: [{ type: 'text', text }],
          details: {
            batch: true,
            total: batchResults.length,
            success: successCount,
            failed: failCount,
            results: batchResults.map((r) => ({
              url: r.url,
              success: r.success,
              filename: r.filename,
              workspacePath: r.workspacePath,
              relativePathFromPage: r.relativePathFromPage,
              size: r.size,
              format: r.format,
              sha256: r.sha256,
              error: r.error,
              reused: r.reused,
            })),
          },
        };
      } else {
        const data = args.data ?? '';
        const urlResult = await downloadImageFromUrl(data, signal);
        if (urlResult.error) {
          logger.warn({ url: data, error: urlResult.error }, 'saveImage: URL download failed');
          return {
            content: [{ type: 'text', text: `Error: ${urlResult.error}` }],
            details: { error: urlResult.errorCode || 'download_failed' },
            isError: true,
          };
        }
        buffer = urlResult.buffer!;
      }

      const saveResult = await saveImageBuffer(
        buffer,
        filename,
        source === 'sessionAsset' ? 'session_asset' : source,
        source === 'url' ? args.data : source === 'sessionAsset' ? (args.url ?? args.data) : undefined,
        workspaceDir,
        manifestProjectId,
        config.sessionId,
      );

      if (!saveResult.success) {
        return {
          content: [{ type: 'text', text: `Error: ${saveResult.error}` }],
          details: { error: 'save_failed' },
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Image saved: ${saveResult.url}${saveResult.reused ? ' (已存在，复用)' : ''}. Use ${saveResult.url} in page code (img src) and config.schema.json defaults.`,
          },
        ],
        details: {
          imageId: saveResult.imageId,
          url: saveResult.workspacePath,
          path: saveResult.workspacePath,
          filename: saveResult.storedFilename,
          relativePathFromPage: saveResult.relativePathFromPage,
          size: saveResult.size,
          format: saveResult.format,
          source,
          sha256: saveResult.sha256,
          reused: saveResult.reused,
        },
      };
    },
  };
}
