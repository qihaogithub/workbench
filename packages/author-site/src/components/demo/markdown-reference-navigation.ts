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

  const editor = container.querySelector<HTMLElement>(".ProseMirror")
    ?? container.querySelector<HTMLElement>(".markdown-editor-content");
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
    if (!startNode && renderedStart >= textOffset && renderedStart <= nextOffset) {
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

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  startNode.parentElement?.scrollIntoView({
    block: "center",
    behavior: reducedMotion ? "auto" : "smooth",
  });
  if (editor.isContentEditable) editor.focus({ preventScroll: true });
  return true;
}
