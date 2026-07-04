export interface PrototypePreviewSize {
  width?: string | number;
  height?: string | number;
}

export interface PrototypePreviewDocumentInput {
  html?: string;
  css?: string;
  configData?: Record<string, unknown>;
  previewSize?: PrototypePreviewSize;
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

function getConfigValue(configData: Record<string, unknown>, key: string): string {
  const value = configData[key];
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function applyPrototypeTextBindings(
  html: string,
  configData: Record<string, unknown>,
): string {
  return html.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (_match, key: string) => getConfigValue(configData, key),
  );
}

export function applyPrototypeBindings(
  root: PrototypeBindingRoot,
  configData: Record<string, unknown>,
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
    if (key) element.textContent = getConfigValue(configData, key);
  });
  Array.from(root.querySelectorAll("[data-bind-src]")).forEach((element) => {
    const key = element.getAttribute("data-bind-src");
    if (key) element.setAttribute("src", getConfigValue(configData, key));
  });
  Array.from(root.querySelectorAll("[data-bind-href]")).forEach((element) => {
    const key = element.getAttribute("data-bind-href");
    if (key) element.setAttribute("href", getConfigValue(configData, key));
  });
  Array.from(root.querySelectorAll("[data-bind-style-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-color");
    if (key) element.style.color = getConfigValue(configData, key);
  });
  Array.from(root.querySelectorAll("[data-bind-style-background-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-background-color");
    if (key) element.style.backgroundColor = getConfigValue(configData, key);
  });
  Array.from(root.querySelectorAll("[data-bind-style-border-color]")).forEach((element) => {
    const key = element.getAttribute("data-bind-style-border-color");
    if (key) element.style.borderColor = getConfigValue(configData, key);
  });
}

export function buildPrototypePreviewHtmlFragment({
  html = "",
  css = "",
  configData = {},
  previewSize,
}: PrototypePreviewDocumentInput): string {
  const designWidth = parseSizeValue(previewSize?.width, 375);
  const designHeight = parseSizeValue(previewSize?.height, 812);
  const shouldScaleToPreviewSize = previewSize != null;
  const rootWidth = shouldScaleToPreviewSize ? `${designWidth}px` : "100%";
  const rootHeight = shouldScaleToPreviewSize ? `${designHeight}px` : "100%";
  const rootMinHeight = shouldScaleToPreviewSize ? `${designHeight}px` : "100%";
  const rootOverflow = shouldScaleToPreviewSize ? "hidden" : "visible";
  const safeHtml = applyPrototypeTextBindings(sanitizePrototypeHtml(html), configData);
  const safeCss = shouldScaleToPreviewSize
    ? normalizePrototypeViewportUnits(sanitizePrototypeCss(css), designWidth, designHeight)
    : sanitizePrototypeCss(css);

  return `
    <style>
      :host {
        display: block;
        width: ${rootWidth};
        height: ${rootHeight};
        min-height: ${rootMinHeight};
        overflow: ${rootOverflow};
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
        background: #fff;
      }
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
