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

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'"`\s)]*)?$/i;

export function rewriteLocalAssetPaths(
  code: string,
  basePath: string,
  sessionId: string,
): string {
  let result = code;

  // Replace string literals: './images/xxx.png', "../assets/xxx.jpg"
  const stringLiteralRe = /(['"`])(\.\.?\/[^'"`]*)(\1)/g;

  result = result.replace(stringLiteralRe, (match, quote, relativePath, endQuote) => {
    if (!IMAGE_EXT_RE.test(relativePath)) return match;
    const resolved = resolveRelativePath(relativePath, basePath);
    const apiPath = `/api/sessions/${sessionId}/workspace/${resolved}`;
    return quote + apiPath + endQuote;
  });

  // Replace CSS url() references: url('./images/xxx.png'), url("../assets/xxx.jpg")
  const cssUrlRe = /url\((['"]?)(\.\.?\/[^'"`)]*)(\1)\)/g;

  result = result.replace(cssUrlRe, (match, quote, relativePath, endQuote) => {
    if (!IMAGE_EXT_RE.test(relativePath)) return match;
    const resolved = resolveRelativePath(relativePath, basePath);
    const apiPath = `/api/sessions/${sessionId}/workspace/${resolved}`;
    return `url(${quote}${apiPath}${endQuote})`;
  });

  return result;
}

export function rewriteCompiledLocalAssetPaths<T extends CompiledAssetResult>(
  result: T,
  demoId: string | undefined,
  sessionId: string | undefined,
): T {
  if (!demoId || !sessionId) return result;

  const compiledCode = rewriteLocalAssetPaths(
    result.compiledCode,
    `demos/${demoId}/`,
    sessionId,
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
