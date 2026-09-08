import { decodeMarkdownReferenceUri } from "./uri";
import type {
  MarkdownReferenceDiagnostic,
  MarkdownReferenceParseResult,
  ParsedLegacyConfigReference,
} from "./types";

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

function diagnostic(text: string, code: MarkdownReferenceDiagnostic["code"], message: string, start: number, end: number): MarkdownReferenceDiagnostic {
  return { code, message, start, end, ...position(text, start) };
}

function escaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function matching(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

function insideHtmlTag(text: string, offset: number): boolean {
  const open = text.lastIndexOf("<", offset);
  const close = text.lastIndexOf(">", offset);
  return open > close;
}

function isFence(line: string): boolean {
  return /^ {0,3}(`{3,}|~{3,})/.test(line);
}

function wbDiagnostic(text: string, destination: string, start: number, end: number): MarkdownReferenceDiagnostic {
  const raw = destination.slice(5);
  const kind = raw.split(/[/?#]/)[0];
  if (!["project", "page", "document", "config"].includes(kind)) {
    return diagnostic(text, "unknown-target-kind", `Unknown wb target kind: ${kind || "(missing)"}`, start, end);
  }
  const segments = raw.split("/").slice(1);
  if (segments.some((segment) => !segment) || !(kind === "project" ? [1] : kind === "config" ? [3] : kind === "document" ? [2, 3] : [2]).includes(segments.length)) {
    return diagnostic(text, "missing-target-id", "Workbench reference has a missing or invalid target ID", start, end);
  }
  return diagnostic(text, "malformed-wb-uri", "Malformed Workbench reference URI", start, end);
}

/** Parse user-visible wb:// links without interpreting permissions or entity existence. */
export function parseMarkdownReferences(markdown: string): MarkdownReferenceParseResult {
  const result: MarkdownReferenceParseResult = { references: [], legacyConfigRefs: [], links: [], diagnostics: [] };
  let inFence = false;
  let inlineTicks = 0;
  let i = 0;
  while (i < markdown.length) {
    if (i === 0 || markdown[i - 1] === "\n") {
      const lineEnd = markdown.indexOf("\n", i);
      const line = markdown.slice(i, lineEnd < 0 ? markdown.length : lineEnd);
      if (isFence(line)) { inFence = !inFence; i = lineEnd < 0 ? markdown.length : lineEnd + 1; continue; }
    }
    if (inFence) { i++; continue; }
    if (markdown[i] === "`") {
      let run = 1;
      while (markdown[i + run] === "`") run++;
      if (!inlineTicks) inlineTicks = run;
      else if (inlineTicks === run) inlineTicks = 0;
      i += run; continue;
    }
    if (inlineTicks || markdown[i] !== "[" || escaped(markdown, i) || insideHtmlTag(markdown, i)) { i++; continue; }
    const closeLabel = matching(markdown, i, "[", "]");
    if (closeLabel < 0 || markdown[closeLabel + 1] !== "(") { i++; continue; }
    const closeDestination = matching(markdown, closeLabel + 1, "(", ")");
    if (closeDestination < 0) {
      const destination = markdown.slice(closeLabel + 2).trim();
      if (destination.startsWith("wb://")) result.diagnostics.push(diagnostic(markdown, "unterminated-link", "Unterminated Markdown link", i, markdown.length));
      i = closeLabel + 1; continue;
    }
    const label = markdown.slice(i + 1, closeLabel).replace(/\\([\[\]\\])/g, "$1");
    const destination = markdown.slice(closeLabel + 2, closeDestination).trim();
    const end = closeDestination + 1;
    if (destination.startsWith("wb://")) {
      const target = decodeMarkdownReferenceUri(destination);
      if (target) {
        result.references.push({ target, labelSnapshot: label, syntaxVersion: 1, start: i, end, ...position(markdown, i) });
      } else {
        result.diagnostics.push(wbDiagnostic(markdown, destination, i, end));
      }
    } else if (markdown[i - 1] === "@" && !escaped(markdown, i - 1)) {
      const legacy: ParsedLegacyConfigReference = { name: label.trim(), key: destination, start: i - 1, end, ...position(markdown, i - 1) };
      result.legacyConfigRefs.push(legacy);
    } else {
      result.links.push({ label, destination, start: i, end, ...position(markdown, i) });
    }
    i = end;
  }
  return result;
}

export const parseMarkdownReferenceLinks = parseMarkdownReferences;
