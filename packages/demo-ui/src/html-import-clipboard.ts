/** 判断剪贴板文本是否为可导入的 HTML 页面代码。 */
function looksLikeHtmlImport(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^<!doctype\s+html\b/i.test(trimmed)) return true;
  if (/<html[\s>]/i.test(trimmed)) return true;
  return /<(body|main|section|div|style|svg|img)[\s>]/i.test(trimmed);
}

/** 从系统剪贴板提取 HTML 代码，非 HTML 内容返回 null。 */
export function extractHtmlImportFromClipboard(
  clipboardData: DataTransfer | null,
): string | null {
  if (!clipboardData) return null;
  const plain = clipboardData.getData("text/plain");
  if (plain && looksLikeHtmlImport(plain)) return plain;
  const html = clipboardData.getData("text/html");
  if (html && looksLikeHtmlImport(html)) return html;
  return null;
}
