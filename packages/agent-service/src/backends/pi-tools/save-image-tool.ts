import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const SUPPORTED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

const URL_DOWNLOAD_TIMEOUT = 10_000;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SaveImageParams = Type.Object({
  source: Type.Union([Type.Literal('base64'), Type.Literal('url')], {
    description: '图片来源：base64 为内联数据，url 为远程图片地址',
  }),
  data: Type.String({
    description:
      '图片数据：source=base64 时为 Base64 编码字符串（不含 data:image/xxx;base64, 前缀）；source=url 时为图片 URL',
  }),
  filename: Type.String({
    description: '保存的文件名，如 product.png',
  }),
  directory: Type.Optional(
    Type.String({
      description: '已废弃：图片统一保存到当前项目工作区 assets/images/ 下，忽略此参数',
    }),
  ),
});

type SaveImageParams = Static<typeof SaveImageParams>;

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

let _dataDir: string | null = null;
let _projectsDir: string | null = null;

function getDataDir(): string {
  if (!_dataDir) {
    _dataDir = path.resolve(
      process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), 'data'),
    );
  }
  return _dataDir;
}

function getProjectsDir(): string {
  if (!_projectsDir) {
    _projectsDir = path.join(getDataDir(), 'projects');
  }
  return _projectsDir;
}

function getWorkspaceAssetsDir(workingDir: string): string {
  return path.join(path.resolve(workingDir), 'assets', 'images');
}

function getWorkspaceAssetPath(storedFilename: string): string {
  return `assets/images/${storedFilename}`;
}

function getDemoRelativeAssetPath(storedFilename: string): string {
  return `../../assets/images/${storedFilename}`;
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

interface ProjectImageEntry {
  id: string;
  filename: string;
  url: string;
  size: number;
  format: string;
  createdAt: number;
  createdBy: 'user' | 'ai' | 'figma';
}

interface ProjectImageManifest {
  images: ProjectImageEntry[];
}

function getProjectManifest(projectId: string): ProjectImageManifest {
  const manifestPath = path.join(getProjectsDir(), projectId, 'images.json');
  if (!fs.existsSync(manifestPath)) {
    return { images: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { images: [] };
  }
}

function addToProjectManifest(projectId: string, entry: ProjectImageEntry): void {
  const manifestPath = path.join(getProjectsDir(), projectId, 'images.json');
  const dir = path.dirname(manifestPath);
  ensureDir(dir);

  const manifest = getProjectManifest(projectId);

  const existingIndex = manifest.images.findIndex((img) => img.id === entry.id);
  if (existingIndex >= 0) {
    manifest.images[existingIndex] = entry;
  } else {
    manifest.images.push(entry);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function createSaveImageTool(config: AgentConfig): AgentTool<typeof SaveImageParams> {
  return {
    name: 'saveImage',
    label: 'Save Image',
    description:
      'Save an image to the current project workspace from Base64 data or a remote URL. The image is stored locally under assets/images/{hash}-{filename}. Use ../../assets/images/{hash}-{filename} from files inside demos/{pageId}/. Supports png, jpg, jpeg, gif, webp, svg formats. Max 10MB per image.',
    parameters: SaveImageParams,
    execute: async (toolCallId: string, args: SaveImageParams) => {
      const { source, data, filename } = args;

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
      } else {
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
      const workspaceDir = config.workingDir ? path.resolve(config.workingDir) : '';

      if (!workspaceDir) {
        return {
          content: [{ type: 'text', text: 'Error: saveImage requires a bound project workspace.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

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

        const manifestProjectId = config.projectId || config.demoId;
        if (manifestProjectId) {
          const entry: ProjectImageEntry = {
            id: hashPrefix,
            filename,
            url: workspacePath,
            size: buffer.length,
            format: ext,
            createdAt: Date.now(),
            createdBy: 'ai',
          };
          try {
            addToProjectManifest(manifestProjectId, entry);
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
