import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
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

const SUPPORTED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

const URL_DOWNLOAD_TIMEOUT = 10_000;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

function getWorkspaceAssetsDir(workingDir: string): string {
  return path.join(path.resolve(workingDir), 'assets', 'images');
}

function getWorkspaceAssetPath(storedFilename: string): string {
  return `assets/images/${storedFilename}`;
}

function getDemoRelativeAssetPath(storedFilename: string): string {
  return `../../assets/images/${storedFilename}`;
}

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

function downloadImageFromUrl(urlString: string): Promise<{
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

  function doDownload(url: string, redirectCount: number): Promise<{
    buffer?: Buffer;
    error?: string;
    errorCode?: string;
  }> {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;

      const req = client.get(
        url,
        { timeout: URL_DOWNLOAD_TIMEOUT },
        (res) => {
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

  return doDownload(urlString, 0);
}

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createSaveImageTool(config: AgentConfig): AgentTool<typeof SaveImageParams> {
  return {
    name: 'saveImage',
    label: 'Save Image',
    description:
      'Save or reuse an image in the current project workspace. Prefer source=assetId or source=sessionAsset when a platform-managed asset already exists; base64 and url are fallbacks. The image is stored locally under assets/images/{hash}-{filename}. Use ../../assets/images/{hash}-{filename} from files inside demos/{pageId}/. Supports png, jpg, jpeg, gif, webp, svg formats. Max 10MB per image.',
    parameters: SaveImageParams,
    execute: async (toolCallId: string, args: SaveImageParams) => {
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
              text: `Image already available locally: ${workspacePath}. From page files use ${getDemoRelativeAssetPathFromWorkspacePath(workspacePath)}`,
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
      } else {
        const data = args.data ?? '';
        const urlResult = await downloadImageFromUrl(data);
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

      if (buffer.length > MAX_FILE_SIZE) {
        const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
        logger.warn({ filename, size: buffer.length }, 'saveImage: file too large');
        return {
          content: [{ type: 'text', text: `Error: Image too large (${sizeMB}MB > 10MB limit)` }],
          details: { error: 'file_too_large' },
          isError: true,
        };
      }

      const sha256 = computeSha256(buffer);
      const hashPrefix = sha256.slice(0, 12);
      const storedFilename = `${hashPrefix}-${filename}`;

      const assetsDir = getWorkspaceAssetsDir(workspaceDir);
      const storedPath = path.join(assetsDir, storedFilename);
      const workspacePath = getWorkspaceAssetPath(storedFilename);
      const relativePathFromPage = getDemoRelativeAssetPath(storedFilename);

      ensureDir(assetsDir);

      try {
        if (fs.existsSync(storedPath)) {
          logger.debug({ storedFilename, sha256: hashPrefix }, 'saveImage: file already exists, reusing');
        } else {
          await fs.promises.writeFile(storedPath, buffer);
          logger.debug({ storedFilename, size: buffer.length, source, sha256: hashPrefix, workingDir: workspaceDir }, 'Image saved to project workspace');
        }

        if (manifestProjectId) {
          const entry: ProjectImageEntry = {
            id: hashPrefix,
            filename: storedFilename,
            url: workspacePath,
            size: buffer.length,
            format: ext,
            createdAt: Date.now(),
            createdBy: 'ai',
            contentHash: sha256,
            mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            originalUrl: source === 'url' ? args.data : source === 'sessionAsset' ? (args.url ?? args.data) : undefined,
            sourceType: source === 'sessionAsset' ? 'session_asset' : source === 'url' ? 'remote_url' : 'upload',
          };
          try {
            addProjectImageManifestEntry(manifestProjectId, entry);
          } catch (manifestError) {
            logger.warn({ projectId: manifestProjectId, error: manifestError }, 'saveImage: failed to update project image manifest');
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Image saved locally: ${workspacePath}. From page files use ${relativePathFromPage}`,
            },
          ],
          details: {
            url: workspacePath,
            path: workspacePath,
            filename: storedFilename,
            relativePathFromPage,
            absolutePath: storedPath,
            size: buffer.length,
            format: ext,
            source,
            sha256: hashPrefix,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ path: storedFilename, error: message }, 'Failed to save image');
        return {
          content: [{ type: 'text', text: `Error saving image: ${message}` }],
          details: { path: storedFilename, error: 'save_failed' },
          isError: true,
        };
      }
    },
  };
}
