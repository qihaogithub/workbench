import { createHash } from "crypto";
import { config } from "../config";
import type { CompileResult } from "./compile-client";

interface CacheEntry {
  result: CompileResult;
  codeHash: string;
}

class CompileCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries: number = config.compileCacheMaxEntries) {
    this.maxEntries = maxEntries;
  }

  private hash(code: string, cacheScope = "default"): string {
    return createHash("sha256")
      .update(cacheScope)
      .update(":")
      .update(code)
      .digest("hex")
      .slice(0, 16);
  }

  get(code: string, cacheScope?: string): CompileResult | null {
    const key = this.hash(code, cacheScope);
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (LRU)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.result;
    }
    return null;
  }

  set(code: string, result: CompileResult, cacheScope?: string): void {
    const key = this.hash(code, cacheScope);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { result, codeHash: key });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

let cacheInstance: CompileCache | null = null;

export function getCompileCache(): CompileCache {
  if (!cacheInstance) {
    cacheInstance = new CompileCache();
  }
  return cacheInstance;
}
