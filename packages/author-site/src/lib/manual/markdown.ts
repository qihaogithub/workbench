import MarkdownIt from "markdown-it";

export interface ManualHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

function createMarkdown() {
  return new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
  });
}

function slugifyHeading(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function isSafeHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) {
    return true;
  }

  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isSafeImageSource(source: string): boolean {
  return source.startsWith("/manual/") && !source.includes("\\");
}

export function renderManualMarkdown(source: string): {
  html: string;
  headings: ManualHeading[];
} {
  const markdown = createMarkdown();
  const headings: ManualHeading[] = [];
  const headingCounts = new Map<string, number>();
  const originalHeadingOpen = markdown.renderer.rules.heading_open;
  const originalLinkOpen = markdown.renderer.rules.link_open;
  const originalImage = markdown.renderer.rules.image;

  markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const level = Number(token.tag.slice(1));
    const text = tokens[index + 1]?.content?.trim() || "section";
    const baseId = slugifyHeading(text);
    const count = headingCounts.get(baseId) ?? 0;
    headingCounts.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    if (level === 2 || level === 3) {
      headings.push({ id, level, text });
    }
    token.attrSet("id", id);
    return originalHeadingOpen
      ? originalHeadingOpen(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet("href") || "";
    if (!isSafeHref(href)) {
      token.attrSet("href", "/manual");
      token.attrSet("data-invalid-link", "true");
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noreferrer noopener");
    }
    return originalLinkOpen
      ? originalLinkOpen(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const source = token.attrGet("src") || "";
    if (!isSafeImageSource(source)) {
      return `<span class="manual-image-placeholder">${markdown.utils.escapeHtml(token.content || "图片")}</span>`;
    }
    const alt = markdown.utils.escapeHtml(token.content || "");
    const title = token.attrGet("title");
    const titleAttribute = title
      ? ` title="${markdown.utils.escapeHtml(title)}"`
      : "";
    return `<img src="${markdown.utils.escapeHtml(source)}" alt="${alt}" loading="lazy"${titleAttribute}>`;
  };

  const html = markdown.render(source);
  markdown.renderer.rules.heading_open = originalHeadingOpen;
  markdown.renderer.rules.link_open = originalLinkOpen;
  markdown.renderer.rules.image = originalImage;
  return { html, headings };
}
