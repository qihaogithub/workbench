const EXTERNAL_IMAGE_PROTOCOL = /^https?:$/;

function isExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      EXTERNAL_IMAGE_PROTOCOL.test(url.protocol) &&
      url.origin !== window.location.origin
    );
  } catch {
    return false;
  }
}

/** Files are intentionally excluded: Milkdown already routes them to onUpload. */
export function getExternalImageUrlFromClipboard(
  clipboardData: Pick<DataTransfer, "getData"> | null,
): string | null {
  const html = clipboardData?.getData("text/html");
  if (!html) return null;

  const document = new DOMParser().parseFromString(html, "text/html");
  const src = document.querySelector("img[src]")?.getAttribute("src")?.trim();
  return src && isExternalHttpUrl(src) ? src : null;
}

const MARKDOWN_IMAGE_RE = /(!\[[^\]]*\]\(\s*)(https?:\/\/[^\s)]+)(\s*[^)]*\))/g;

export interface MarkdownImagePaste {
  markdown: string;
  externalUrls: string[];
}

/** Reads Markdown text from the clipboard and finds every external image reference. */
export function getMarkdownImagePaste(
  clipboardData: Pick<DataTransfer, "getData"> | null,
): MarkdownImagePaste | null {
  const markdown = clipboardData?.getData("text/plain")?.replace(/\r\n/g, "\n");
  if (!markdown?.trim()) return null;

  const externalUrls: string[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const url = match[2];
    if (isExternalHttpUrl(url) && !externalUrls.includes(url)) externalUrls.push(url);
  }
  return externalUrls.length > 0 ? { markdown, externalUrls } : null;
}

/** Replaces all external Markdown image URLs while preserving the original text. */
export function replaceMarkdownImageUrls(
  markdown: string,
  replacements: Map<string, string>,
): string {
  return markdown.replace(MARKDOWN_IMAGE_RE, (_match, prefix, url, suffix) => {
    return `${prefix}${replacements.get(url) ?? url}${suffix}`;
  });
}
