import type { MarkdownReferenceSourceDocument, MarkdownLinkIndexSnapshot, MarkdownLinkRecord, MarkdownReferenceTarget, MarkdownReferenceSource, ResourceDirectorySnapshot } from "./types.js";
import { EntityResolver } from "./entity-resolver.js";
import { ResourceDirectory } from "./resource-directory.js";
import { parseMarkdownReferences, encodeMarkdownReferenceUri, MARKDOWN_REFERENCE_INDEX_VERSION } from "@workbench/shared/markdown-reference";

export interface MarkdownReferenceIndexStore {
  rebuild(input: RebuildMarkdownReferenceIndexInput): MarkdownLinkIndexSnapshot;
  snapshot(scope?: MarkdownReferenceIndexScope): MarkdownLinkIndexSnapshot | null;
  outgoing(source: MarkdownReferenceSource): MarkdownLinkRecord[];
  backlinks(target: MarkdownReferenceTarget, scope?: MarkdownReferenceIndexScope): MarkdownLinkRecord[];
}

export interface MarkdownReferenceIndexScope {
  projectId: string;
  workspaceId: string;
}

export interface RebuildMarkdownReferenceIndexInput {
  directory: ResourceDirectory | ResourceDirectorySnapshot;
  documents: readonly MarkdownReferenceSourceDocument[];
  workspaceId: string;
  projectId?: string;
  authorityMutationId?: string;
  authorityRevision?: number;
  authorityRootHash?: string;
  parserVersion?: string;
  parse?: (markdown: string) => readonly ParsedIndexReference[];
}

export interface ParsedIndexReference { target: MarkdownReferenceTarget; labelSnapshot: string; start: number; end: number; line?: number; column?: number; }

export interface MarkdownUnlinkedMention {
  target: MarkdownReferenceTarget;
  label: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

/** Find bounded, case-insensitive target-name mentions outside code and links. */
export function findUnlinkedMentions(
  markdown: string,
  directory: ResourceDirectory,
  limit = 200,
  excludeTarget?: MarkdownReferenceTarget,
): MarkdownUnlinkedMention[] {
  const parsed = parseMarkdownReferences(markdown);
  const excluded: Array<readonly [number, number]> = [...parsed.references, ...parsed.links, ...parsed.legacyConfigRefs].map((entry) => [entry.start, entry.end] as const);
  // The parser intentionally omits code spans/fences from its public result;
  // mirror those ranges here so names inside code are never suggestions.
  let fence: { marker: string; start: number } | null = null;
  const lines = /.*(?:\n|$)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lines.exec(markdown))) {
    const text = lineMatch[0].replace(/\n$/, "");
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker && !fence) fence = { marker: marker[1][0], start: lineMatch.index };
    else if (marker && fence && marker[1][0] === fence.marker) {
      excluded.push([fence.start, lineMatch.index + lineMatch[0].length]);
      fence = null;
    }
    if (!lineMatch[0]) break;
  }
  if (fence) excluded.push([fence.start, markdown.length]);
  for (const span of markdown.matchAll(/(`+)([\s\S]*?)\1/g)) excluded.push([span.index ?? 0, (span.index ?? 0) + span[0].length]);
  const isExcluded = (start: number, end: number) => {
    if (excluded.some(([left, right]) => start < right && end > left)) return true;
    // Defensive guard for parser/renderer offsets: a mention inside a
    // Markdown link label is never an unlinked mention.
    const open = markdown.lastIndexOf("[", start);
    const close = open >= 0 ? markdown.indexOf("](", open) : -1;
    return open >= 0 && close >= 0 && start >= open && end <= close;
  };
  const entries = directory.values()
    .flatMap((entry) => [entry.label, ...(entry.aliases ?? [])].map((label) => ({ entry, label })))
    .filter(({ label }) => label.trim().length >= 2)
    .sort((a, b) => b.label.length - a.label.length);
  const result: MarkdownUnlinkedMention[] = [];
  const seen = new Set<string>();
  for (const { entry, label } of entries) {
    if (excludeTarget && sameTarget(entry.target, excludeTarget)) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasCjk = /[\u3400-\u9fff]/u.test(label);
    const expression = new RegExp(hasCjk ? escaped : `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    let match: RegExpExecArray | null;
    while ((match = expression.exec(markdown))) {
      const start = match.index;
      const end = start + match[0].length;
      const key = `${entry.target.kind}:${JSON.stringify(entry.target)}:${start}`;
      if (isExcluded(start, end) || seen.has(key)) continue;
      seen.add(key);
      const before = markdown.slice(0, start);
      result.push({ target: entry.target, label: match[0], start, end, line: before.split("\n").length, column: start - (before.lastIndexOf("\n") + 1) + 1 });
      if (result.length >= limit) return result;
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

export class InMemoryMarkdownReferenceIndex implements MarkdownReferenceIndexStore {
  private current: MarkdownLinkIndexSnapshot | null = null;
  rebuild(input: RebuildMarkdownReferenceIndexInput): MarkdownLinkIndexSnapshot {
    const directory = input.directory instanceof ResourceDirectory ? input.directory : new ResourceDirectory(input.directory);
    const projectId = input.projectId ?? input.documents[0]?.source.projectId;
    if (!projectId) throw new Error("MARKDOWN_REFERENCE_PROJECT_REQUIRED");
    const resolver = new EntityResolver(directory, projectId);
    const parse = input.parse ?? parseCanonicalReferences;
    const records = input.documents.flatMap((document) => parse(document.markdown).map((reference) => {
      const resolved = resolver.resolve(reference.target, reference.labelSnapshot);
      const position = positionAt(document.markdown, reference.start);
      return { ...reference, source: document.source, line: reference.line ?? position.line, column: reference.column ?? position.column, contentHash: document.contentHash, targetState: resolved.targetState };
    }));
    this.current = { projectId, workspaceId: input.workspaceId, authorityMutationId: input.authorityMutationId, authorityRevision: input.authorityRevision, authorityRootHash: input.authorityRootHash, generatedAt: Date.now(), parserVersion: input.parserVersion ?? MARKDOWN_REFERENCE_INDEX_VERSION, records };
    return this.current;
  }
  snapshot() { return this.current; }
  outgoing(source: MarkdownReferenceSource) { return (this.current?.records ?? []).filter((record) => sameSource(record.source, source)); }
  backlinks(target: MarkdownReferenceTarget) { return (this.current?.records ?? []).filter((record) => sameTarget(record.target, target)); }
}

function sameSource(a: MarkdownReferenceSource, b: MarkdownReferenceSource): boolean {
  if (a.kind !== b.kind || a.projectId !== b.projectId || a.workspaceId !== b.workspaceId) return false;
  switch (a.kind) {
    case "knowledge-document": return b.kind === a.kind && a.docId === b.docId;
    case "page-requirements":
    case "page-convention": return b.kind === a.kind && a.pageId === b.pageId;
    case "workspace-memory":
    case "project-convention": return b.kind === a.kind;
    case "design-spec-entry": return b.kind === a.kind && a.specId === b.specId && a.entryId === b.entryId;
    case "config-note": return b.kind === a.kind && a.scope === b.scope && a.pageId === b.pageId && a.fieldKey === b.fieldKey;
    case "richtext-field": return b.kind === a.kind && a.scope === b.scope && a.pageId === b.pageId && a.fieldKey === b.fieldKey && a.jsonPointer === b.jsonPointer;
    case "canvas-local-document": return b.kind === a.kind && a.nodeId === b.nodeId;
  }
}
function sameTarget(a: MarkdownReferenceTarget, b: MarkdownReferenceTarget): boolean {
  return encodeMarkdownReferenceUri(a) === encodeMarkdownReferenceUri(b);
}
function positionAt(markdown: string, offset: number) { const before = markdown.slice(0, offset); const line = before.split("\n").length; return { line, column: offset - (before.lastIndexOf("\n") + 1) + 1 }; }
function parseCanonicalReferences(markdown: string): ParsedIndexReference[] {
  return parseMarkdownReferences(markdown).references;
}
