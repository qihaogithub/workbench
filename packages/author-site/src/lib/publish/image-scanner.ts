import fs from 'fs';
import path from 'path';
import type { ImageReference } from './types';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

function isLocalPath(p: string): boolean {
  if (/^(https?:|data:|\/\/)/i.test(p)) return false;
  if (/placehold\.co|placeholder\.com/i.test(p)) return false;
  return IMAGE_EXTENSIONS.test(p);
}

function resolvePath(relativePath: string, sourceFile: string): string {
  const sourceDir = path.dirname(sourceFile);
  return path.resolve(sourceDir, relativePath);
}

function extractImageReferences(
  content: string,
  sourceFile: string,
): ImageReference[] {
  const references: ImageReference[] = [];

  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(content)) !== null) {
    const src = match[1];
    if (isLocalPath(src)) {
      references.push({
        originalPath: src,
        absolutePath: resolvePath(src, sourceFile),
        sourceFile,
        type: 'img-src',
      });
    }
  }

  const cssUrlRegex = /url\(["']?([^"')]+)["']?\)/g;
  while ((match = cssUrlRegex.exec(content)) !== null) {
    const url = match[1];
    if (isLocalPath(url)) {
      references.push({
        originalPath: url,
        absolutePath: resolvePath(url, sourceFile),
        sourceFile,
        type: 'css-url',
      });
    }
  }

  const importRegex = /import\s+\w+\s+from\s+["']([^"']+(?:\.png|\.jpe?g|\.gif|\.webp|\.svg))["']/g;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (isLocalPath(importPath)) {
      references.push({
        originalPath: importPath,
        absolutePath: resolvePath(importPath, sourceFile),
        sourceFile,
        type: 'import',
      });
    }
  }

  return references;
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
      } else if (/\.(tsx|jsx|css)$/i.test(entry.name)) {
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

export { extractImageReferences, isLocalPath };
