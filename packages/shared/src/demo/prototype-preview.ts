export interface PrototypePreviewSize {
  width?: string | number;
  height?: string | number;
}

export interface PrototypePreviewDocumentInput {
  html?: string;
  css?: string;
  configData?: Record<string, unknown>;
  previewSize?: PrototypePreviewSize;
  assetRewrite?: PrototypeAssetRewriteContext;
  /**
   * 单页预览等场景允许设计画板内部纵向滚动，查看超出设计高度的内容。
   * 仅在传入 previewSize（固定设计尺寸）时生效；画布与截图不传，保持裁剪到设计高度。
   */
  allowScroll?: boolean;
}

export interface PrototypeAssetRewriteContext {
  sessionId?: string;
  demoId?: string;
  origin?: string;
}

type PrototypeBindingElement = {
  textContent: string | null;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  style: {
    color: string;
    backgroundColor: string;
    borderColor: string;
  };
};

type PrototypeBindingRoot = {
  querySelectorAll: (selector: string) => Iterable<PrototypeBindingElement>;
};

type PrototypeTextNode = {
  nodeValue: string | null;
};

const SCRIPT_TAG_RE = /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi;
const INLINE_EVENT_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL_RE = /javascript\s*:/gi;
const DANGEROUS_CSS_RE = /@import\b|expression\s*\(|behavior\s*:/gi;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|svga)(\?[^'")\s]*)?$/i;
const HTML_ASSET_ATTR_RE = /\b(src|href|poster)=("|')([^"']+)(\2)/gi;
const CSS_URL_RE = /url\((["']?)([^"'`)]+)(\1)\)/gi;

export function sanitizePrototypeHtml(html: string): string {
  return html
    .replace(SCRIPT_TAG_RE, "")
    .replace(INLINE_EVENT_RE, "")
    .replace(JAVASCRIPT_URL_RE, "");
}

export function sanitizePrototypeCss(css: string): string {
  return css
    .replace(SCRIPT_TAG_RE, "")
    .replace(JAVASCRIPT_URL_RE, "")
    .replace(DANGEROUS_CSS_RE, "");
}

export function normalizePrototypeViewportUnits(
  css: string,
  designWidth: number,
  designHeight: number,
): string {
  return css.replace(
    /(-?\d*\.?\d+)(vmin|vmax|vw|vh)\b/gi,
    (match, value: string, unit: string) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return match;
      const normalizedUnit = unit.toLowerCase();
      const basis =
        normalizedUnit === "vw"
          ? designWidth
          : normalizedUnit === "vh"
            ? designHeight
            : normalizedUnit === "vmin"
              ? Math.min(designWidth, designHeight)
              : Math.max(designWidth, designHeight);
      return `${(numeric / 100) * basis}px`;
    },
  );
}

function resolvePrototypeRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split("/").filter((part) => part !== "");
  const relativeParts = relativePath.split("/");

  for (const part of relativeParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

function shouldRewritePrototypeAssetUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^\.\.?\/[^'")\s]*$/u.test(trimmed)) return false;
  return IMAGE_EXT_RE.test(trimmed);
}

function rewritePrototypeAssetUrl(
  value: string,
  context?: PrototypeAssetRewriteContext,
): string {
  if (
    !context?.sessionId ||
    !context.demoId ||
    !shouldRewritePrototypeAssetUrl(value)
  ) {
    return value;
  }
  const resolved = resolvePrototypeRelativePath(value, `demos/${context.demoId}/`);
  const encodedPath = resolved
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const apiPath = `/api/sessions/${encodeURIComponent(context.sessionId)}/workspace/${encodedPath}`;
  return context.origin ? `${context.origin}${apiPath}` : apiPath;
}

export function rewritePrototypeAssetUrls(
  content: string,
  context?: PrototypeAssetRewriteContext,
): string {
  if (!context?.sessionId || !context.demoId) return content;
  return content
    .replace(
      HTML_ASSET_ATTR_RE,
      (
        match,
        attr: string,
        quote: string,
        value: string,
        endQuote: string,
      ) => {
        const rewritten = rewritePrototypeAssetUrl(value, context);
        return rewritten === value
          ? match
          : `${attr}=${quote}${rewritten}${endQuote}`;
      },
    )
    .replace(
      CSS_URL_RE,
      (match, quote: string, value: string, endQuote: string) => {
        const rewritten = rewritePrototypeAssetUrl(value, context);
        return rewritten === value
          ? match
          : `url(${quote}${rewritten}${endQuote})`;
      },
    );
}

function parseSizeValue(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px$/, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
  return fallback;
}

function getConfigValue(
  configData: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(configData, key)) return undefined;
  const value = configData[key];
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function applyPrototypeTextBindings(
  html: string,
  configData: Record<string, unknown>,
): string {
  return html.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key: string) => getConfigValue(configData, key) ?? match,
  );
}

export function applyPrototypeBindings(
  root: PrototypeBindingRoot,
  configData: Record<string, unknown>,
  assetRewrite?: PrototypeAssetRewriteContext,
): void {
  const browserGlobal = globalThis as unknown as {
    document?: {
      createTreeWalker: (
        root: unknown,
        whatToShow: number,
      ) => {
        currentNode: unknown;
        nextNode: () => boolean;
      };
    };
    NodeFilter?: { SHOW_TEXT: number };
  };
  const documentRef = browserGlobal.document;
  const textFilter = browserGlobal.NodeFilter;
  if (!documentRef || !textFilter) return;

  const walker = documentRef.createTreeWalker(
    root,
    textFilter.SHOW_TEXT,
  );
  const textNodes: PrototypeTextNode[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as PrototypeTextNode);
  }
  for (const node of textNodes) {
    node.nodeValue = applyPrototypeTextBindings(node.nodeValue ?? "", configData);
  }

  Array.from(root.querySelectorAll("[data-bind-text]")).forEach((element) => {
    const key = element.getAttribute("data-bind-text");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value !== undefined) element.textContent = value;
  });
  Array.from(root.querySelectorAll("[data-bind-src]")).forEach((element) => {
    const key = element.getAttribute("data-bind-src");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value === undefined) return;
    element.setAttribute(
      "src",
      rewritePrototypeAssetUrl(value, assetRewrite),
    );
  });
  Array.from(root.querySelectorAll("[data-bind-href]")).forEach((element) => {
    const key = element.getAttribute("data-bind-href");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value === undefined) return;
    element.setAttribute(
      "href",
      rewritePrototypeAssetUrl(value, assetRewrite),
    );
  });
  Array.from(root.querySelectorAll("[data-bind-style-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-color");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value !== undefined) element.style.color = value;
  });
  Array.from(root.querySelectorAll("[data-bind-style-background-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-background-color");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value !== undefined) element.style.backgroundColor = value;
  });
  Array.from(root.querySelectorAll("[data-bind-style-border-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-border-color");
    if (!key) return;
    const value = getConfigValue(configData, key);
    if (value !== undefined) element.style.borderColor = value;
  });
}

export function buildPrototypePreviewHtmlFragment({
  html = "",
  css = "",
  configData = {},
  previewSize,
  assetRewrite,
  allowScroll = false,
}: PrototypePreviewDocumentInput): string {
  const designWidth = parseSizeValue(previewSize?.width, 375);
  const designHeight = parseSizeValue(previewSize?.height, 812);
  const shouldScaleToPreviewSize = previewSize != null;
  // 固定设计尺寸下，.prototype-root 的 height + overflow 决定超高内容是被裁剪还是可滚动。
  // allowScroll 时改为 auto，让设计画板内部纵向滚动，与 React 高保真页 iframe 内滚动一致。
  const allowRootScroll = shouldScaleToPreviewSize && allowScroll;
  const rootWidth = shouldScaleToPreviewSize ? `${designWidth}px` : "100%";
  const rootHeight = shouldScaleToPreviewSize ? `${designHeight}px` : "100%";
  const rootMinHeight = shouldScaleToPreviewSize ? `${designHeight}px` : "100%";
  const rootOverflow = shouldScaleToPreviewSize
    ? allowRootScroll
      ? "auto"
      : "hidden"
    : "visible";
  // 滚动时隐藏滚动条，与预览容器、React 页保持一致的无滚动条观感。
  const rootScrollbarStyle = allowRootScroll
    ? "scrollbar-width: none; -ms-overflow-style: none;"
    : "";
  const rootScrollbarWebkitCss = allowRootScroll
    ? ":host::-webkit-scrollbar, .prototype-root::-webkit-scrollbar { display: none; }"
    : "";
  const safeHtml = applyPrototypeTextBindings(
    rewritePrototypeAssetUrls(sanitizePrototypeHtml(html), assetRewrite),
    configData,
  );
  const rewrittenCss = rewritePrototypeAssetUrls(
    sanitizePrototypeCss(css),
    assetRewrite,
  );
  const safeCss = shouldScaleToPreviewSize
    ? normalizePrototypeViewportUnits(rewrittenCss, designWidth, designHeight)
    : rewrittenCss;

  return `
    <style>
      :host {
        display: block;
        width: ${rootWidth};
        height: ${rootHeight};
        min-height: ${rootMinHeight};
        overflow: ${rootOverflow};
        ${rootScrollbarStyle}
        background: #fff;
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .prototype-root {
        position: relative;
        width: ${rootWidth};
        height: ${rootHeight};
        min-height: ${rootMinHeight};
        overflow: ${rootOverflow};
        ${rootScrollbarStyle}
        transform: translateZ(0);
        background: #fff;
      }
      ${rootScrollbarWebkitCss}
      *, *::before, *::after {
        box-sizing: border-box;
      }
      img, svg, video, canvas {
        max-width: 100%;
      }
      a {
        color: inherit;
      }
      [data-prototype-selected] {
        outline: 2px solid #2563eb !important;
        outline-offset: 2px !important;
      }
      [data-prototype-hovered] {
        outline: 1px solid #38bdf8 !important;
        outline-offset: 2px !important;
      }
      ${safeCss}
    </style>
    <div class="prototype-root">${safeHtml}</div>
  `;
}

export function buildPrototypePreviewDocumentHtml(
  input: PrototypePreviewDocumentInput,
): string {
  const fragment = buildPrototypePreviewHtmlFragment(input);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body, #root {
        margin: 0;
        width: 100%;
        min-height: 100%;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div id="root">${fragment}</div>
  </body>
</html>`;
}
