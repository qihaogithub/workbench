"use client";

import MarkdownIt from "markdown-it";
import "./markdown/project-reference-presentation.css";
import {
  decodeMarkdownReferenceUri,
  parseMarkdownReferences,
} from "@workbench/shared/markdown-reference";

/**
 * 配置项与历史备注共用的 Markdown 安全渲染工具。
 * 新配置项批注存储在 comments.json 的评论线程中；属性级 `$demo.note`
 * 仅作为历史兼容数据读取。展示态统一经 markdown-it 渲染后再用扩展白名单清洗。
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
  "data-reference-uri",
  "data-reference-kind",
  "aria-label",
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

/**
 * SSR 没有 DOMPurify 的浏览器窗口，仍需先做一层保守清洗，避免把评论
 * 中的 data/blob/javascript 图片或原始脚本直接放进首屏 HTML。客户端挂载
 * 后会再次使用 DOMPurify 做完整白名单清洗。
 */
function sanitizeServerHtml(
  html: string,
  { allowExternalMedia = false, mediaBaseUrl }: { allowExternalMedia?: boolean; mediaBaseUrl?: string },
): string {
  const mediaPrefix = mediaBaseUrl ? `${mediaBaseUrl.replace(/\/$/, "")}/api/images/` : undefined;
  let normalized = mediaBaseUrl
    ? html.replace(
        /(\bsrc\s*=\s*["'])\/api\/images\//gi,
        `$1${mediaPrefix}`,
      )
    : html;

  // Raw HTML is accepted by markdown-it for legacy notes; discard executable or
  // embedding elements before handing the string to dangerouslySetInnerHTML.
  normalized = normalized.replace(
    /<\s*(script|style|iframe|object|embed|form|base|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  normalized = normalized.replace(
    /<\s*(script|style|iframe|object|embed|form|base|meta|link)\b[^>]*\/\s*>/gi,
    "",
  );
  normalized = normalized.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  normalized = normalized.replace(
    /<(img|video|audio|source)\b([^>]*)>/gi,
    (_tag, element: string, attrs: string) => {
      const nextAttrs = attrs.replace(
        /\s+src\s*=\s*(["'])(.*?)\1/gi,
        (full: string, quote: string, src: string) => {
          const trusted = Boolean(mediaPrefix && src.startsWith(mediaPrefix));
          return trusted || isSafeMediaSrc(src, allowExternalMedia) ? ` src=${quote}${src}${quote}` : "";
        },
      );
      return `<${element}${nextAttrs}>`;
    },
  );
  return normalized;
}

export function sanitizeNoteHtml(
  html: string,
  {
    allowExternalMedia = false,
    mediaBaseUrl,
  }: { allowExternalMedia?: boolean; mediaBaseUrl?: string } = {},
): string {
  if (typeof window === "undefined") {
    return sanitizeServerHtml(html, { allowExternalMedia, mediaBaseUrl });
  }
  const DOMPurify = require("dompurify");
  const normalizedHtml = mediaBaseUrl
    ? html.replace(
        /(\bsrc\s*=\s*["'])\/api\/images\//gi,
        `$1${mediaBaseUrl.replace(/\/$/, "")}/api/images/`,
      )
    : html;
  const sanitized = DOMPurify.sanitize(normalizedHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  template.content
    .querySelectorAll<
      HTMLImageElement | HTMLMediaElement | HTMLSourceElement
    >("img, video, audio, source")
    .forEach((node) => {
      const resolvedSrc = node.getAttribute("src");
      const trustedMediaSrc = mediaBaseUrl
        ? `${mediaBaseUrl.replace(/\/$/, "")}/api/images/`
        : undefined;
      const isTrustedMediaSrc = Boolean(
        trustedMediaSrc && resolvedSrc?.startsWith(trustedMediaSrc),
      );
      if (
        !resolvedSrc ||
        (!isTrustedMediaSrc && !isSafeMediaSrc(resolvedSrc, allowExternalMedia))
      ) {
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
export function renderNoteMarkdown(
  markdown: string,
  options: { allowExternalMedia?: boolean; mediaBaseUrl?: string } = {},
): string {
  if (!markdown) return "";
  const withReferences = replaceCanonicalReferenceMarkup(markdown);
  let html: string;
  try {
    html = md.render(withReferences);
  } catch {
    html = escapeHtml(markdown).replace(/\n/g, "<br>");
  }
  return sanitizeNoteHtml(html, options);
}

/** Replace only parser-approved wb:// links (never code or HTML attributes)
 * with inert inline references before Markdown-it renders the rest of the document.
 * Read-only output uses the stored snapshot; no live directory is consulted. */
function replaceCanonicalReferenceMarkup(markdown: string): string {
  const references = parseMarkdownReferences(markdown).references;
  let result = markdown;
  for (const reference of [...references].sort((a, b) => b.start - a.start)) {
    const raw = markdown.slice(reference.start, reference.end);
    const uriStart = raw.indexOf("(wb://");
    const uriEnd = raw.lastIndexOf(")");
    if (uriStart < 0 || uriEnd <= uriStart) continue;
    const uri = raw.slice(uriStart + 1, uriEnd);
    const target = decodeMarkdownReferenceUri(uri);
    if (!target) continue;
    const label = escapeHtml(reference.labelSnapshot);
    result = `${result.slice(0, reference.start)}<span class="pr-reference wb-reference" data-reference-uri="${escapeHtml(uri)}" data-reference-kind="${target.kind}" aria-label="${label}">${label}</span>${result.slice(reference.end)}`;
  }
  return result;
}

const REQUIREMENT_REF_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_WIDTH_MARKER = "width:";
const DEFAULT_READONLY_IMAGE_WIDTH = "default";

/**
 * Crepe 将图片显示宽度保存在 image alt 的内部元数据中。只读 Markdown
 * 渲染不会创建 Crepe 图片块，需在安全清洗后把该元数据转为受限的展示属性。
 */
function applyReadonlyImageSizing(html: string): string {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  // Query actual images: an aria-label may safely contain literal "<img ...>".
  // Matching serialized HTML with a regex would corrupt that attribute.
  template.content.querySelectorAll("img").forEach((image) => {
    const alt = image.getAttribute("alt") ?? "";
    const width = alt.startsWith(IMAGE_WIDTH_MARKER)
      ? Number(alt.slice(IMAGE_WIDTH_MARKER.length))
      : 0;
    if (!Number.isFinite(width) || width <= 0) {
      image.setAttribute("data-image-width", DEFAULT_READONLY_IMAGE_WIDTH);
      return;
    }

    const targetWidth = Math.round(width);
    image.setAttribute("data-image-width", String(targetWidth));
    image.style.width = `min(${targetWidth}px, 100%)`;
  });
  return template.innerHTML;
}

/**
 * 将页面配置要求 Markdown 渲染为已清洗的安全 HTML。
 * 行内软引用 `@[名称](key)` 会被渲染为 chip（`span.pr-ref`，携带 `data-ref-key`），
 * 供前端通过事件委托绑定点击跳转到对应配置项。
 */
export function renderPageRequirementsMarkdown(
  markdown: string,
  options?: { allowExternalMedia?: boolean; mediaBaseUrl?: string },
): string {
  if (!markdown) return "";
  const withReferences = replaceCanonicalReferenceMarkup(markdown);
  const withChips = withReferences.replace(
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
  return applyReadonlyImageSizing(sanitizeNoteHtml(html, options));
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
