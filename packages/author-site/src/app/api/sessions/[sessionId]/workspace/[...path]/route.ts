import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getSessionWorkspacePath, getSessionMeta } from '@/lib/fs-utils';
import { getProjectImages } from '@/lib/project-images';
import { getImage } from '@/lib/image-store';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.svga': 'application/octet-stream',
  '.lottie': 'application/octet-stream',
  '.riv': 'application/octet-stream',
  '.skel': 'application/octet-stream',
  '.skel.bytes': 'application/octet-stream',
  '.bytes': 'application/octet-stream',
  '.atlas': 'application/octet-stream',
  '.atlas.txt': 'text/plain',
  '.txt': 'text/plain',
  '.zip': 'application/octet-stream',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function serveFile(workspacePath: string, fileRelPath: string): NextResponse | null {
  const filePath = path.resolve(workspacePath, fileRelPath);

  if (!filePath.startsWith(path.resolve(workspacePath))) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function resolveFallbackFile(
  workspacePath: string,
  pathSegments: string[],
): string | null {
  const filename = pathSegments[pathSegments.length - 1];

  // 1. 按文件名在 workspace 根目录的常用文件夹中查找
  const rootFallbackDirs = ['images', 'assets'];
  for (const dir of rootFallbackDirs) {
    const found = path.join(dir, filename);
    const fallbackPath = path.resolve(workspacePath, found);
    if (
      fallbackPath.startsWith(path.resolve(workspacePath)) &&
      fs.existsSync(fallbackPath) &&
      !fs.statSync(fallbackPath).isDirectory()
    ) {
      return found;
    }
  }

  // 2. 从请求路径中提取后缀，尝试作为 workspace 相对路径
  //    demos/demo_xxx/images/hero.png → 尝试 demo_xxx/images/hero.png, images/hero.png
  for (let i = 1; i < pathSegments.length; i++) {
    const suffixPath = pathSegments.slice(i).join('/');
    const fallbackPath = path.resolve(workspacePath, suffixPath);
    if (
      fallbackPath.startsWith(path.resolve(workspacePath)) &&
      fs.existsSync(fallbackPath) &&
      !fs.statSync(fallbackPath).isDirectory()
    ) {
      return suffixPath;
    }
  }

  // 3. 如果请求路径以 demos/ 开头，也尝试去掉 demos/ 前缀
  if (pathSegments.length >= 2 && pathSegments[0] === 'demos') {
    const withoutDemos = pathSegments.slice(2).join('/');
    if (withoutDemos) {
      const fallbackPath = path.resolve(workspacePath, withoutDemos);
      if (
        fallbackPath.startsWith(path.resolve(workspacePath)) &&
        fs.existsSync(fallbackPath) &&
        !fs.statSync(fallbackPath).isDirectory()
      ) {
        return withoutDemos;
      }
    }
  }

  return null;
}

function serveFromGlobalImageStore(
  sessionId: string,
  relativePath: string,
): NextResponse | null {
  try {
    const meta = getSessionMeta(sessionId);
    const projectId = meta?.demoId;
    if (!projectId) return null;

    const images = getProjectImages(projectId);
    if (images.length === 0) return null;

    const filename = path.basename(relativePath);

    const matched = images.filter((img) => {
      const imgFilename = img.filename || path.basename(img.url || '');
      return imgFilename === filename || img.url?.includes(filename);
    });

    if (matched.length === 0) return null;

    const best = matched
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    const imageIdMatch = best.url?.match(/\/api\/images\/(img_[a-zA-Z0-9_-]+)/);
    if (!imageIdMatch) return null;

    const result = getImage(imageIdMatch[1]);
    if (!result.buffer || !result.mimeType) return null;

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.sizeBytes),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string; path: string[] } },
) {
  const { sessionId, path: pathSegments } = params;

  if (!sessionId || !pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const workspacePath = getSessionWorkspacePath(sessionId);
  if (!workspacePath) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const relativePath = pathSegments.join('/');

  if (relativePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  // 精确路径查找
  const exactResponse = serveFile(workspacePath, relativePath);
  if (exactResponse) {
    return exactResponse;
  }

  // 回退查找：在多个候选位置搜索文件
  const fallbackPath = resolveFallbackFile(workspacePath, pathSegments);
  if (fallbackPath) {
    return serveFile(workspacePath, fallbackPath)!;
  }

  // 全局图床 fallback：从项目 images.json 查找并服务
  const imageStoreResponse = serveFromGlobalImageStore(sessionId, relativePath);
  if (imageStoreResponse) {
    return imageStoreResponse;
  }

  return NextResponse.json({ error: 'File not found' }, { status: 404 });
}
