const PROTOTYPE_TEXT_BINDING_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const PROTOTYPE_ATTRIBUTE_BINDING_RE =
  /\bdata-bind-(?:text|src|href|style-color|style-background-color|style-border-color)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;

export function extractPrototypeConfigBindingKeys(
  html?: string | null,
): string[] {
  if (!html) return [];

  const keys = new Set<string>();
  for (const match of html.matchAll(PROTOTYPE_TEXT_BINDING_RE)) {
    if (match[1]) keys.add(match[1]);
  }
  for (const match of html.matchAll(PROTOTYPE_ATTRIBUTE_BINDING_RE)) {
    const key = match[1] ?? match[2] ?? match[3];
    if (key) keys.add(key);
  }
  return [...keys];
}

const CODE_PROPS_DESTRUCTURE_RE =
  /const\s+\{\s*([\s\S]*?)\s*\}\s*=\s*props(?:\s+as\s+Record\s*<[^>]*>)?\s*;/g;

export function extractCodeConfigBindingKeys(
  code?: string | null,
  candidateKeys: string[] = [],
): string[] {
  if (!code) return [];

  const keys = new Set<string>();
  for (const match of code.matchAll(CODE_PROPS_DESTRUCTURE_RE)) {
    const body = match[1] ?? "";
    for (const item of body.split("\n")) {
      const trimmed = item.trim().replace(/,$/, "");
      if (!trimmed) continue;
      const name = trimmed.split(/[=:]/)[0]?.trim();
      if (name && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        keys.add(name);
      }
    }
  }

  const propsAliases = new Set(["props"]);
  for (const match of code.matchAll(
    /\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*props(?:\s+as\s+[^;]+)?\s*;/g,
  )) {
    if (match[1]) propsAliases.add(match[1]);
  }

  for (const alias of propsAliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of code.matchAll(
      new RegExp(
        `\\b${escapedAlias}\\s*(?:\\.\\s*([A-Za-z_$][A-Za-z0-9_$]*)|\\[\\s*["']([^"']+)["']\\s*\\])`,
        "g",
      ),
    )) {
      const key = match[1] ?? match[2];
      if (key && (candidateKeys.length === 0 || candidateKeys.includes(key))) {
        keys.add(key);
      }
    }

    for (const match of code.matchAll(
      new RegExp(`\\b${escapedAlias}\\s*\\[\\s*\`([^\`]*)\`\\s*\\]`, "g"),
    )) {
      const template = match[1] ?? "";
      const expressionStart = template.indexOf("${");
      if (expressionStart < 0) continue;
      const expressionEnd = template.lastIndexOf("}");
      if (expressionEnd < expressionStart) continue;

      const prefix = template.slice(0, expressionStart);
      const suffix = template.slice(expressionEnd + 1);
      if (!prefix && !suffix) continue;
      for (const candidate of candidateKeys) {
        if (
          candidate.startsWith(prefix) &&
          candidate.endsWith(suffix) &&
          candidate.length >= prefix.length + suffix.length
        ) {
          keys.add(candidate);
        }
      }
    }
  }
  return [...keys];
}
