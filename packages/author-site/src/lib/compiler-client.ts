export interface CompileResult {
  compiledCode: string;
  dependencies: string[];
}

export interface CompileError {
  code: string;
  message: string;
  details?: unknown;
}

const MAX_CACHE_SIZE = 50;
const compileCache = new Map<string, CompileResult>();
const COMPILE_CLIENT_CACHE_VERSION = "2026-06-preview-runtime-v3";

function getCacheKey(code: string): string {
  return `${COMPILE_CLIENT_CACHE_VERSION}_${code.length}_${code.slice(0, 200)}`;
}

export async function compileCode(code: string): Promise<CompileResult> {
  const cacheKey = getCacheKey(code);
  const cached = compileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const result = await response.json();

  if (!result.success) {
    const error: CompileError = result.error;
    throw new Error(error.message || '编译失败');
  }

  const data: CompileResult = result.data;

  // 写入缓存，超过上限时移除最早的条目
  if (compileCache.size >= MAX_CACHE_SIZE) {
    const firstKey = compileCache.keys().next().value;
    if (firstKey !== undefined) {
      compileCache.delete(firstKey);
    }
  }
  compileCache.set(cacheKey, data);

  return data;
}

export function clearCompileCache(): void {
  compileCache.clear();
}
