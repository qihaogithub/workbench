"use client";

import MarkdownIt from "markdown-it";

/**
 * 配置项备注的 Markdown 安全渲染工具。
 * 备注内容以 Markdown 字符串存储于属性级 `$demo.note`，
 * 展示态统一经 markdown-it 渲染后再用扩展白名单清洗，见 sanitizeNoteHtml。
 */

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "hr",
  "label",
  "input",
  "div",
  "span",
  // 媒体标签：图片 / 视频 / 音频 / 附件卡片
  "img",
  "video",
  "audio",
  "source",
  "figure",
  "figcaption",
];

const ALLOWED_ATTR = [
  "class",
  "href",
  "target",
  "rel",
  "type",
  "checked",
  "disabled",
  "data-type",
  "data-checked",
  // 媒体属性
  "src",
  "alt",
  "controls",
  "width",
  "height",
  "poster",
  "autoplay",
  "muted",
  "loop",
  "playsinline",
  "preload",
];

/** 仅允许同源受控路径（/api/、/data/ 等），禁止协议相对 // 与外部绝对地址。 */
function isSafeMediaSrc(src: string, allowExternalMedia = false): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (allowExternalMedia && /^https:\/\//i.test(trimmed)) return true;
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed === "/") return false;
  return true;
}

export function sanitizeNoteHtml(
  html: string,
  { allowExternalMedia = false }: { allowExternalMedia?: boolean } = {},
): string {
  if (typeof window === "undefined") return html;
  const DOMPurify = require("dompurify");
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  template.content
    .querySelectorAll<HTMLImageElement | HTMLMediaElement | HTMLSourceElement>(
      "img, video, audio, source",
    )
    .forEach((node) => {
      const src = node.getAttribute("src");
      if (!src || !isSafeMediaSrc(src, allowExternalMedia)) {
        node.removeAttribute("src");
      }
    });
  return template.innerHTML;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 将 Markdown 备注渲染为已清洗的安全 HTML（图片/视频/附件内联显示） */
export function renderNoteMarkdown(markdown: string): string {
  if (!markdown) return "";
  let html: string;
  try {
    html = md.render(markdown);
  } catch {
    html = escapeHtml(markdown).replace(/\n/g, "<br>");
  }
  return sanitizeNoteHtml(html);
}

const REQUIREMENT_REF_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * 将页面配置要求 Markdown 渲染为已清洗的安全 HTML。
 * 行内软引用 `@[名称](key)` 会被渲染为 chip（`span.pr-ref`，携带 `data-ref-key`），
 * 供前端通过事件委托绑定点击跳转到对应配置项。
 */
export function renderPageRequirementsMarkdown(
  markdown: string,
  options?: { allowExternalMedia?: boolean },
): string {
  if (!markdown) return "";
  const withChips = markdown.replace(
    REQUIREMENT_REF_REGEX,
    (_match, name: string, key: string) =>
      `<span class="pr-ref" data-ref-key="${escapeHtml(key)}">${escapeHtml(name)}</span>`,
  );
  let html: string;
  try {
    html = md.render(withChips);
  } catch {
    html = escapeHtml(markdown).replace(/\n/g, "<br>");
  }
  return sanitizeNoteHtml(html, options);
}

/** 从 Markdown 备注中提取纯文本，用于空值判断与摘要截断 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
