interface CompileResult {
  compiledCode: string
  dependencies: string[]
  cssImports: string[]
}

interface CacheEntry {
  result: CompileResult
  timestamp: number
}

const MAX_CACHE_SIZE = 20
const CACHE_TTL = 5 * 60 * 1000

const compileCache = new Map<string, CacheEntry>()

function buildKey(sessionId: string, demoId: string): string {
  return `${sessionId}:${demoId}`
}

export function getCachedCompile(sessionId: string, demoId: string): CompileResult | null {
  const key = buildKey(sessionId, demoId)
  const cached = compileCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    compileCache.delete(key)
    return null
  }
  return cached.result
}

export function setCachedCompile(sessionId: string, demoId: string, result: CompileResult): void {
  const key = buildKey(sessionId, demoId)
  if (compileCache.size >= MAX_CACHE_SIZE) {
    const oldest = compileCache.keys().next().value
    if (oldest) compileCache.delete(oldest)
  }
  compileCache.set(key, { result, timestamp: Date.now() })
}

export function invalidateCompileCache(sessionId: string, demoId?: string): void {
  if (demoId) {
    compileCache.delete(buildKey(sessionId, demoId))
  } else {
    for (const key of compileCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        compileCache.delete(key)
      }
    }
  }
}
