interface CompileResult {
  compiledCode: string
  dependencies: string[]
  cssImports: string[]
  moduleHash?: string
  moduleUrl?: string
}

interface CacheEntry {
  result: CompileResult
  timestamp: number
}

const MAX_CACHE_SIZE = 200
const CACHE_TTL = 30 * 60 * 1000

const compileCache = new Map<string, CacheEntry>()

function getCodeFingerprint(code?: string): string {
  if (!code) return "no-code"
  let hash = 0
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) | 0
  }
  return `${code.length}:${hash.toString(36)}`
}

function buildKey(sessionId: string, demoId: string, code?: string): string {
  return `${sessionId}:${demoId}:${getCodeFingerprint(code)}`
}

function buildPagePrefix(sessionId: string, demoId: string): string {
  return `${sessionId}:${demoId}:`
}

export function getCachedCompile(sessionId: string, demoId: string, code?: string): CompileResult | null {
  const key = buildKey(sessionId, demoId, code)
  const cached = compileCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    compileCache.delete(key)
    return null
  }
  return cached.result
}

export function setCachedCompile(sessionId: string, demoId: string, result: CompileResult, code?: string): void {
  const key = buildKey(sessionId, demoId, code)
  const cacheableResult: CompileResult = {
    ...result,
    moduleUrl: undefined,
  }
  if (compileCache.size >= MAX_CACHE_SIZE) {
    const oldest = compileCache.keys().next().value
    if (oldest) compileCache.delete(oldest)
  }
  compileCache.set(key, { result: cacheableResult, timestamp: Date.now() })
}

export function invalidateCompileCache(sessionId: string, demoId?: string): void {
  if (demoId) {
    const prefix = buildPagePrefix(sessionId, demoId)
    for (const key of compileCache.keys()) {
      if (key.startsWith(prefix)) {
        compileCache.delete(key)
      }
    }
  } else {
    for (const key of compileCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        compileCache.delete(key)
      }
    }
  }
}

export function hasCachedCompile(sessionId: string, demoId: string, code?: string): boolean {
  const key = buildKey(sessionId, demoId, code)
  const cached = compileCache.get(key)
  if (!cached) return false
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    compileCache.delete(key)
    return false
  }
  return true
}
