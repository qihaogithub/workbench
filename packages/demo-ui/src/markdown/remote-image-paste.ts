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

/**
 * Returns the first external image copied as HTML from the clipboard.
 * Files are intentionally excluded: Milkdown already routes them to onUpload.
 */
export function getExternalImageUrlFromClipboard(
  clipboardData: Pick<DataTransfer, "getData"> | null,
): string | null {
  const html = clipboardData?.getData("text/html");
  if (!html) return null;

  const document = new DOMParser().parseFromString(html, "text/html");
  const src = document.querySelector("img[src]")?.getAttribute("src")?.trim();
  return src && isExternalHttpUrl(src) ? src : null;
}
