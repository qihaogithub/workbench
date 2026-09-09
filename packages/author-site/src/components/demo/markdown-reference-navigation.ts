import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  type MarkdownReferenceCandidate,
  type MarkdownReferenceTarget,
} from "@workbench/shared/markdown-reference";
import type { MarkdownReferenceProvider } from "@workbench/demo-ui/DocumentEditor";

export interface MarkdownReferenceMentionLocation {
  label: string;
  start: number;
  end: number;
}

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

/**
 * Finds the corresponding rendered mention in the current editor and brings it
 * into view. The API returns false when the editor is not mounted or the
 * rendered content no longer matches the indexed source.
 */
export function navigateToMarkdownMention(
  container: HTMLElement | null,
  content: string,
  mention: MarkdownReferenceMentionLocation,
): boolean {
  if (!container || !mention.label) return false;
  if (content.slice(mention.start, mention.end) !== mention.label) return false;

  const editor =
    container.querySelector<HTMLElement>(".ProseMirror") ??
    container.querySelector<HTMLElement>(".markdown-editor-content");
  if (!editor) return false;

  const sourcePrefix = content.slice(0, Math.max(0, mention.start));
  const occurrence = countOccurrences(sourcePrefix, mention.label);
  const renderedText = editor.textContent ?? "";
  let renderedStart = -1;
  let searchOffset = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    renderedStart = renderedText.indexOf(mention.label, searchOffset);
    if (renderedStart < 0) return false;
    searchOffset = renderedStart + mention.label.length;
  }

  const renderedEnd = renderedStart + mention.label.length;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let textOffset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (node) {
    const textNode = node as Text;
    const nextOffset = textOffset + textNode.data.length;
    if (
      !startNode &&
      renderedStart >= textOffset &&
      renderedStart <= nextOffset
    ) {
      startNode = textNode;
      startOffset = renderedStart - textOffset;
    }
    if (startNode && renderedEnd >= textOffset && renderedEnd <= nextOffset) {
      endNode = textNode;
      endOffset = renderedEnd - textOffset;
      break;
    }
    textOffset = nextOffset;
    node = walker.nextNode();
  }

  if (!startNode || !endNode) return false;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  startNode.parentElement?.scrollIntoView({
    block: "center",
    behavior: reducedMotion ? "auto" : "smooth",
  });
  if (editor.isContentEditable) editor.focus({ preventScroll: true });
  return true;
}
export type AuthorDocumentReference = Extract<
  MarkdownReferenceTarget,
  { kind: "document" }
>;

/** Only the canonical reference crosses tabs; session/workspace ownership is resolved by bootstrap. */
export function buildAuthorReferenceUrl(
  _sourceProjectId: string,
  target: MarkdownReferenceTarget,
): string {
  const reference = encodeMarkdownReferenceUri(target);
  if (!decodeMarkdownReferenceUri(reference)) throw new Error("无效的项目引用");
  return `/demo/${encodeURIComponent(target.projectId)}/edit?${new URLSearchParams({ reference })}`;
}

export function openAuthorReference(
  projectId: string,
  target: MarkdownReferenceTarget,
): void {
  window.open(
    buildAuthorReferenceUrl(projectId, target),
    "_blank",
    "noopener,noreferrer",
  );
}

export function resolveAuthorReference(
  projectId: string,
  uri: string,
  candidates: readonly MarkdownReferenceCandidate[],
): MarkdownReferenceTarget {
  const target = decodeMarkdownReferenceUri(uri);
  if (!target || target.projectId !== projectId) {
    throw new Error("无效或跨项目的引用");
  }
  const canonical = encodeMarkdownReferenceUri(target);
  if (
    !candidates.some(
      (candidate) => encodeMarkdownReferenceUri(candidate.target) === canonical,
    )
  ) {
    throw new Error("引用目标不存在或无权访问");
  }
  return target;
}

export async function fetchAuthorReferenceCandidates(
  projectId: string,
  sessionId: string | undefined,
  query: string,
  signal?: AbortSignal,
): Promise<MarkdownReferenceCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    kind: "project,page,config,document",
  });
  if (sessionId) params.set("sessionId", sessionId);
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/markdown-references/candidates?${params}`,
    { signal },
  );
  if (!response.ok) {
    const error = new Error("引用目录加载失败，请重试") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  const candidates = payload?.data?.candidates ?? payload?.data;
  if (payload?.success === false || !Array.isArray(candidates))
    throw new Error("引用目录加载失败，请重试");
  return candidates;
}

export function createAuthorReferenceProvider(
  sourceProjectId: string,
  sessionId?: string,
): MarkdownReferenceProvider {
  const provider: MarkdownReferenceProvider = async ({ query, signal, projectId }) => {
    const targetProjectId = projectId ?? sourceProjectId;
    return fetchAuthorReferenceCandidates(
      targetProjectId,
      targetProjectId === sourceProjectId ? sessionId : undefined,
      query,
      signal,
    );
  };
  provider.listProjects = async (signal?: AbortSignal) => {
    const response = await fetch("/api/demos", { signal });
    if (!response.ok) throw new Error("项目列表加载失败，请重试");
    const payload = await response.json();
    const projects = payload?.data;
    if (payload?.success === false || !Array.isArray(projects)) throw new Error("项目列表加载失败，请重试");
    return projects
      .filter((project): project is { id: string; name: string } => Boolean(project && typeof project.id === "string" && typeof project.name === "string"))
      .map(({ id, name }) => ({ id, name }));
  };
  return provider;
}
