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

/** 仅允许同源受控路径（/api/、/data/ 等），禁止协议相对 // 与外部绝对地址 */
function isSafeMediaSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed === "/") return false;
  return true;
}

let srcHookInstalled = false;

function installMediaSrcHook(): void {
  if (typeof window === "undefined" || srcHookInstalled) return;
  const DOMPurify = require("dompurify");
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (tag === "img" || tag === "video" || tag === "audio" || tag === "source") {
      const src = node.getAttribute("src");
      if (!src || !isSafeMediaSrc(src)) {
        node.removeAttribute("src");
      }
    }
  });
  srcHookInstalled = true;
}

export function sanitizeNoteHtml(html: string): string {
  if (typeof window === "undefined") return html;
  installMediaSrcHook();
  const DOMPurify = require("dompurify");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  });
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

/** 从 Markdown 备注中提取纯文本，用于空值判断与摘要截断 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#>*_`~|\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}