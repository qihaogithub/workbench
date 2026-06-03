import fs from 'fs';
import path from 'path';
import type { ImageReference } from './types';

export function replacePathsInContent(
  content: string,
  urlMap: Map<string, string>,
  sourceFile: string,
): string {
  let result = content;

  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  result = result.replace(imgRegex, (fullMatch, src: string) => {
    if (urlMap.has(src)) {
      return fullMatch.replace(src, urlMap.get(src)!);
    }
    return fullMatch;
  });

  const cssUrlRegex = /url\(["']?([^"')]+)["']?\)/g;
  result = result.replace(cssUrlRegex, (fullMatch, url: string) => {
    if (urlMap.has(url)) {
      return fullMatch.replace(url, urlMap.get(url)!);
    }
    return fullMatch;
  });

  const importRegex = /import\s+(\w+)\s+from\s+["']([^"']+(?:\.png|\.jpe?g|\.gif|\.webp|\.svg))["']/g;
  result = result.replace(importRegex, (fullMatch, varName: string, importPath: string) => {
    if (urlMap.has(importPath)) {
      return fullMatch.replace(importPath, urlMap.get(importPath)!);
    }
    return fullMatch;
  });

  return result;
}

export function copyAndReplacePaths(
  sourceDir: string,
  targetDir: string,
  urlMap: Map<string, string>,
  imageRefs: ImageReference[],
): void {
  fs.mkdirSync(targetDir, { recursive: true });

  const processedFiles = new Set<string>();
  for (const ref of imageRefs) {
    processedFiles.add(path.resolve(ref.sourceFile));
  }

  function copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        const isTextFile = /\.(tsx|jsx|js|ts|css|html)$/i.test(entry.name);
        if (isTextFile && processedFiles.has(path.resolve(srcPath))) {
          const content = fs.readFileSync(srcPath, 'utf-8');
          const replaced = replacePathsInContent(content, urlMap, srcPath);
          fs.writeFileSync(destPath, replaced);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  copyDir(sourceDir, targetDir);
}
