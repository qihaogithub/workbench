import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

/**
 * 将 Markdown 渲染为 HTML。
 * `html: true` 允许内嵌原始 HTML（如 `<video>`），与既有预览行为保持一致。
 */
export function renderMarkdownToHtml(mdText: string): string {
  if (!mdText) return "";
  try {
    return md.render(mdText);
  } catch {
    return mdText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
}

/**
 * 渲染 Markdown 并应用安全清洗器。
 * 未提供清洗器时原样输出渲染结果。
 */
export function renderMarkdownSafe(
  mdText: string,
  sanitizer?: (html: string) => string,
): string {
  const html = renderMarkdownToHtml(mdText || "");
  if (!sanitizer) return html || "<p>（无内容）</p>";
  return sanitizer(html) || "<p>（无内容）</p>";
}