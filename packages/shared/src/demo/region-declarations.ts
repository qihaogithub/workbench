const REGION_ID_PATTERN = "[A-Za-z0-9_-]{1,100}";

const REGION_DECLARATION_PATTERNS = [
  new RegExp(`data-region-id\\s*=\\s*["'](${REGION_ID_PATTERN})["']`, "g"),
  new RegExp(`regionId\\s*[:=]\\s*["'](${REGION_ID_PATTERN})["']`, "g"),
  new RegExp(`data-region-id\\s*=\\s*\\{\\s*["'](${REGION_ID_PATTERN})["']\\s*\\}`, "g"),
  new RegExp(`regionId\\s*=\\s*\\{\\s*["'](${REGION_ID_PATTERN})["']\\s*\\}`, "g"),
] as const;

/**
 * Extracts statically declared region ids from supported page source files.
 *
 * Region ids are protocol declarations, not inferred DOM selectors. Keeping
 * this scanner shared prevents author preview, publish, Viewer and Agent
 * validation from accepting different source spellings.
 */
export function extractDeclaredRegionIds(contents: Iterable<string | undefined>): string[] {
  const ids = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    for (const pattern of REGION_DECLARATION_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        if (match[1]) ids.add(match[1]);
      }
    }
  }
  return [...ids].sort();
}
