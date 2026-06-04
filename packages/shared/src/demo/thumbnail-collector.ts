import type { ThumbnailLayoutEvidence, RawElementSnapshot } from "./thumbnail-types";

function getCleanText(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value || (el as HTMLInputElement).placeholder || "";
  }
  if (el instanceof HTMLSelectElement) {
    return el.value || "";
  }
  return el.textContent?.replace(/\s+/g, " ").trim() || "";
}

function isUsefulRawElement(el: RawElementSnapshot): boolean {
  const { rect, style, text, attrs } = el;

  if (rect.width <= 0 || rect.height <= 0) return false;
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;

  const area = rect.width * rect.height;
  if (area < 24 * 24) return false;

  const hasText = Boolean(text?.trim());
  const hasImage = !!(attrs.src) || style.backgroundImage !== "none";
  const hasBackground = !!(
    style.backgroundColor &&
    style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    style.backgroundColor !== "transparent"
  );
  const hasShadow = !!(style.boxShadow && style.boxShadow !== "none");
  const hasBorder = !!(style.border && style.border !== "0px none rgb(0, 0, 0)");

  return hasText || hasImage || hasBackground || hasShadow || hasBorder;
}

export function collectThumbnailLayoutScript(): string {
  return `
(function() {
  function getCleanText(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return el.value || el.placeholder || '';
    }
    return (el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function isUsefulRawElement(el) {
    if (el.rect.width <= 0 || el.rect.height <= 0) return false;
    if (el.style.display === 'none') return false;
    if (el.style.visibility === 'hidden') return false;
    if (Number(el.style.opacity) === 0) return false;
    var area = el.rect.width * el.rect.height;
    if (area < 24 * 24) return false;
    var hasText = !!(el.text && el.text.trim());
    var hasImage = !!el.attrs.src || el.style.backgroundImage !== 'none';
    var bg = el.style.backgroundColor;
    var hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    var hasShadow = el.style.boxShadow && el.style.boxShadow !== 'none';
    var hasBorder = el.style.border && el.style.border !== '0px none rgb(0, 0, 0)';
    return hasText || hasImage || hasBackground || hasShadow || hasBorder;
  }

  function collectThumbnailLayout() {
    var viewport = { width: window.innerWidth, height: window.innerHeight };
    var elements = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el);
      var snapshot = {
        tag: el.tagName.toLowerCase(),
        text: getCleanText(el),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          border: style.border,
          position: style.position,
          zIndex: style.zIndex,
          backgroundImage: style.backgroundImage
        },
        attrs: {
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          src: el instanceof HTMLImageElement ? (el.currentSrc || el.src) : undefined,
          className: el instanceof HTMLElement ? (el.className ? el.className.toString() : undefined) : undefined
        }
      };
      if (isUsefulRawElement(snapshot)) {
        elements.push(snapshot);
      }
    }
    return { viewport: viewport, elements: elements };
  }

  try {
    var result = collectThumbnailLayout();
    window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_RESULT', payload: result }, '*');
  } catch (err) {
    window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_ERROR', error: err.message }, '*');
  }
})();
`;
}

export { getCleanText, isUsefulRawElement };
