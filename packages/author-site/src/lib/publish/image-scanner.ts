import fs from 'fs';
import path from 'path';
import type { ImageReference } from './types';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

const API_IMAGE_PREFIX = '/api/images/';
const SESSION_ASSET_RE = /^\/api\/sessions\/([^/]+)\/assets\/([^/?#]+)(?:[?#].*)?$/;

function stripUrlSuffix(p: string): string {
  return p.split(/[?#]/, 1)[0] ?? p;
}

function isLocalPath(p: string): boolean {
  if (/^(https?:|data:|\/\/)/i.test(p)) return false;
  if (/placehold\.co|placeholder\.com/i.test(p)) return false;
  if (p.startsWith(API_IMAGE_PREFIX)) return false;
  return IMAGE_EXTENSIONS.test(stripUrlSuffix(p));
}

function isExternalImageUrl(p: string): boolean {
  if (!/^https?:\/\//i.test(p)) return false;
  if (/placehold\.co|placeholder\.com/i.test(p)) return false;
  return true;
}

function isApiImagePath(p: string): boolean {
  return p.startsWith(API_IMAGE_PREFIX) && IMAGE_EXTENSIONS.test(stripUrlSuffix(p));
}

function isSessionAssetPath(p: string): boolean {
  return SESSION_ASSET_RE.test(p) && IMAGE_EXTENSIONS.test(stripUrlSuffix(p));
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
  return path.resolve(sourceDir, stripUrlSuffix(relativePath));
}

function resolveApiImagePath(apiPath: string): string {
  const filename = stripUrlSuffix(apiPath).slice(API_IMAGE_PREFIX.length);
  return path.join(getDataDir(), 'images', filename);
}

function resolveSessionAssetPath(apiPath: string): string {
  const match = apiPath.match(SESSION_ASSET_RE);
  if (!match) return apiPath;
  const [, sessionId, filename] = match;
  const sessionsDir = path.join(getDataDir(), 'sessions');
  const candidates: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === sessionId) {
        candidates.push(path.join(fullPath, 'assets', 'images', filename));
      } else {
        walk(fullPath);
      }
    }
  }

  walk(sessionsDir);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0] ?? apiPath;
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
  } else if (isSessionAssetPath(imgPath)) {
    references.push({
      originalPath: imgPath,
      absolutePath: resolveSessionAssetPath(imgPath),
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

  const quotedImagePathRegex = /["']((?:\/api\/sessions\/[^"']+\/assets\/|\/api\/images\/|(?:\.{1,2}\/|\/)?[^"']*\/)?[^"']+\.(?:png|jpe?g|gif|webp|svg)(?:[?#][^"']*)?)["']/gi;
  while ((match = quotedImagePathRegex.exec(content)) !== null) {
    addReference(references, match[1], sourceFile, 'img-src');
  }

  return dedupeReferences(references);
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function collectConfigValueKeys(workspacePath: string): Set<string> {
  const valuesPath = path.join(workspacePath, 'project.config.values.json');
  if (!fs.existsSync(valuesPath)) return new Set();
  const values = parseJsonObject(fs.readFileSync(valuesPath, 'utf-8'));
  return new Set(Object.keys(values ?? {}));
}

function removeOverriddenProjectSchemaDefaults(
  schemaContent: string,
  overriddenKeys: Set<string>,
): string {
  if (overriddenKeys.size === 0) return schemaContent;
  const schema = parseJsonObject(schemaContent);
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return schemaContent;
  }

  let changed = false;
  const nextProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      overriddenKeys.has(key) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'default')
    ) {
      const { default: _default, ...rest } = value as Record<string, unknown>;
      nextProperties[key] = rest;
      changed = true;
    } else {
      nextProperties[key] = value;
    }
  }

  if (!changed) return schemaContent;
  return JSON.stringify({
    ...schema,
    properties: nextProperties,
  });
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

  const overriddenProjectConfigKeys = collectConfigValueKeys(workspacePath);
  const workspaceFiles = [
    'index.tsx',
    'config.schema.json',
    'project.config.schema.json',
    'project.config.values.json',
  ];
  for (const file of workspaceFiles) {
    const filePath = path.join(workspacePath, file);
    if (fs.existsSync(filePath)) {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const content = file === 'project.config.schema.json'
        ? removeOverriddenProjectSchemaDefaults(rawContent, overriddenProjectConfigKeys)
        : rawContent;
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

export { extractImageReferences, isLocalPath, isApiImagePath, isSessionAssetPath };
export { isExternalImageUrl };
