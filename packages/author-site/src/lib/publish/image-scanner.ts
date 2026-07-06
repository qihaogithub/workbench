import fs from 'fs';
import path from 'path';
import type { ImageReference } from './types';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

const API_IMAGE_PREFIX = '/api/images/';

function isLocalPath(p: string): boolean {
  if (/^(https?:|data:|\/\/)/i.test(p)) return false;
  if (/placehold\.co|placeholder\.com/i.test(p)) return false;
  if (p.startsWith(API_IMAGE_PREFIX)) return false;
  return IMAGE_EXTENSIONS.test(p);
}

function isExternalImageUrl(p: string): boolean {
  if (!/^https?:\/\//i.test(p)) return false;
  if (/placehold\.co|placeholder\.com/i.test(p)) return false;
  return true;
}

function isApiImagePath(p: string): boolean {
  return p.startsWith(API_IMAGE_PREFIX) && IMAGE_EXTENSIONS.test(p);
}

function getDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : (() => {
        let current = path.resolve(process.cwd());
        while (current !== path.dirname(current)) {
          if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
            return path.join(current, 'data');
          }
          current = path.dirname(current);
        }
        return path.join(process.cwd(), 'data');
      })();
}

function resolvePath(relativePath: string, sourceFile: string): string {
  const sourceDir = path.dirname(sourceFile);
  return path.resolve(sourceDir, relativePath);
}

function resolveApiImagePath(apiPath: string): string {
  const filename = apiPath.slice(API_IMAGE_PREFIX.length);
  return path.join(getDataDir(), 'images', filename);
}

function addReference(
  references: ImageReference[],
  imgPath: string,
  sourceFile: string,
  type: ImageReference['type'],
): void {
  if (isExternalImageUrl(imgPath)) {
    references.push({
      originalPath: imgPath,
      absolutePath: imgPath,
      sourceFile,
      type: 'external-url',
    });
  } else if (isApiImagePath(imgPath)) {
    references.push({
      originalPath: imgPath,
      absolutePath: resolveApiImagePath(imgPath),
      sourceFile,
      type,
    });
  } else if (isLocalPath(imgPath)) {
    references.push({
      originalPath: imgPath,
      absolutePath: resolvePath(imgPath, sourceFile),
      sourceFile,
      type,
    });
  }
}

function extractImageReferences(
  content: string,
  sourceFile: string,
): ImageReference[] {
  const references: ImageReference[] = [];

  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(content)) !== null) {
    addReference(references, match[1], sourceFile, 'img-src');
  }

  const cssUrlRegex = /url\(["']?([^"')]+)["']?\)/g;
  while ((match = cssUrlRegex.exec(content)) !== null) {
    addReference(references, match[1], sourceFile, 'css-url');
  }

  const importRegex = /import\s+\w+\s+from\s+["']([^"']+(?:\.png|\.jpe?g|\.gif|\.webp|\.svg))["']/g;
  while ((match = importRegex.exec(content)) !== null) {
    addReference(references, match[1], sourceFile, 'import');
  }

  const quotedExternalUrlRegex = /["'](https?:\/\/[^"']+)["']/g;
  while ((match = quotedExternalUrlRegex.exec(content)) !== null) {
    addReference(references, match[1], sourceFile, 'external-url');
  }

  return dedupeReferences(references);
}

export function scanImageReferences(
  workspacePath: string,
): ImageReference[] {
  const references: ImageReference[] = [];

  const demosDir = path.join(workspacePath, 'demos');
  if (!fs.existsSync(demosDir)) return references;

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (/\.(tsx|jsx|css|html)$/i.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const refs = extractImageReferences(content, fullPath);
        references.push(...refs);
      }
    }
  }

  walkDir(demosDir);

  const workspaceFiles = ['index.tsx', 'config.schema.json'];
  for (const file of workspaceFiles) {
    const filePath = path.join(workspacePath, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const refs = extractImageReferences(content, filePath);
      references.push(...refs);
    }
  }

  return dedupeReferences(references);
}

function dedupeReferences(refs: ImageReference[]): ImageReference[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.originalPath}::${ref.sourceFile}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { extractImageReferences, isLocalPath, isApiImagePath };
export { isExternalImageUrl };
