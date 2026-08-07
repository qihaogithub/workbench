import { createHash } from 'node:crypto';

function resolveRelativePath(relativePath: string, basePath: string): string {
  const isAbsolute = basePath.startsWith('/');
  const parts = basePath.split('/').filter(p => p !== '');
  const relativeParts = relativePath.split('/');

  for (const part of relativeParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return (isAbsolute ? '/' : '') + parts.join('/');
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|svga|lottie|riv|skel(?:\.bytes)?|atlas(?:\.txt)?)(\?[^'"`\s)]*)?$/i;

function resolveRewriteTarget(
  relativePath: string,
  basePath: string,
  sessionId: string,
  imageManifest: Map<string, string> | undefined,
): string {
  if (imageManifest) {
    const filename = relativePath.split('/').pop() || relativePath;
    const imageUrl = imageManifest.get(filename);
    if (imageUrl) return imageUrl;
  }
  const resolved = resolveRelativePath(relativePath, basePath);
  return `/api/sessions/${sessionId}/workspace/${resolved}`;
}

export function rewriteLocalAssetPaths(
  code: string,
  basePath: string,
  sessionId: string,
  imageManifest?: Map<string, string>,
): string {
  let result = code;

  const stringLiteralRe = /(['"`])(\.\.?\/[^'"`]*)(\1)/g;

  result = result.replace(stringLiteralRe, (match, quote, relativePath, endQuote) => {
    if (!IMAGE_EXT_RE.test(relativePath)) return match;
    const target = resolveRewriteTarget(relativePath, basePath, sessionId, imageManifest);
    return quote + target + endQuote;
  });

  const cssUrlRe = /url\((['"]?)(\.\.?\/[^'"`)]*)(\1)\)/g;

  result = result.replace(cssUrlRe, (match, quote, relativePath, endQuote) => {
    if (!IMAGE_EXT_RE.test(relativePath)) return match;
    const target = resolveRewriteTarget(relativePath, basePath, sessionId, imageManifest);
    return `url(${quote}${target}${endQuote})`;
  });

  return result;
}

export function rewriteCompiledLocalAssetPaths<T extends CompiledAssetResult>(
  result: T,
  demoId: string | undefined,
  sessionId: string | undefined,
  imageManifest?: Map<string, string>,
): T {
  if (!demoId || !sessionId) return result;

  const compiledCode = rewriteLocalAssetPaths(
    result.compiledCode,
    `demos/${demoId}/`,
    sessionId,
    imageManifest,
  );
  if (compiledCode === result.compiledCode) return result;

  return {
    ...result,
    compiledCode,
    moduleHash: createHash('sha256').update(compiledCode).digest('hex'),
  };
}

interface CompiledAssetResult {
  compiledCode: string;
  moduleHash: string;
}
