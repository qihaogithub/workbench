"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "./utils";
import type {
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualPropertyChange,
} from "./types";

const SCRIPT_TAG_RE = /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi;
const INLINE_EVENT_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL_RE = /javascript\s*:/gi;
const DANGEROUS_CSS_RE = /@import\b|expression\s*\(|behavior\s*:/gi;

export interface PrototypePagePreviewProps {
  html?: string;
  css?: string;
  configData?: Record<string, unknown>;
  className?: string;
  visualEditMode?: boolean;
  visualHoverNodeId?: string | null;
  selectedVisualNodeId?: string | null;
  visualPropertyChanges?: VisualPropertyChange[];
  onVisualHover?: (node: VisualNodeInfo | null) => void;
  onVisualSelect?: (node: VisualNodeInfo | null) => void;
  onVisualSelectStack?: (nodes: VisualNodeInfo[]) => void;
  visualNodeTreeRequestKey?: number;
  onVisualNodeTreeChange?: (nodes: VisualNodeTreeItem[]) => void;
}

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

function getConfigValue(configData: Record<string, unknown>, key: string): string {
  const value = configData[key];
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function applyPrototypeBindings(root: ParentNode, configData: Record<string, unknown>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }
  for (const node of textNodes) {
    node.nodeValue = (node.nodeValue ?? "").replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, key: string) =>
      getConfigValue(configData, key),
    );
  }

  root.querySelectorAll<HTMLElement>("[data-bind-text]").forEach((element) => {
    const key = element.getAttribute("data-bind-text");
    if (key) element.textContent = getConfigValue(configData, key);
  });
  root.querySelectorAll<HTMLElement>("[data-bind-src]").forEach((element) => {
    const key = element.getAttribute("data-bind-src");
    if (key) element.setAttribute("src", getConfigValue(configData, key));
  });
  root.querySelectorAll<HTMLElement>("[data-bind-href]").forEach((element) => {
    const key = element.getAttribute("data-bind-href");
    if (key) element.setAttribute("href", getConfigValue(configData, key));
  });
  root.querySelectorAll<HTMLElement>("[data-bind-style-color]").forEach((element) => {
    const key = element.getAttribute("data-bind-style-color");
    if (key) element.style.color = getConfigValue(configData, key);
  });
  root.querySelectorAll<HTMLElement>("[data-bind-style-background-color]").forEach((element) => {
    const key = element.getAttribute("data-bind-style-background-color");
    if (key) element.style.backgroundColor = getConfigValue(configData, key);
  });
  root.querySelectorAll<HTMLElement>("[data-bind-style-border-color]").forEach((element) => {
    const key = element.getAttribute("data-bind-style-border-color");
    if (key) element.style.borderColor = getConfigValue(configData, key);
  });
}

function getOwnText(element: Element): string {
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
  });
  return text.replace(/\s+/g, " ").trim();
}

function getDomPath(element: Element, root: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTagName = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (child): child is Element => child.tagName === currentTagName,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${Math.max(index, 1)})`);
    current = parent;
  }
  return parts.length ? `prototype-root > ${parts.join(" > ")}` : "prototype-root";
}

function getElementByVisualId(root: ParentNode, id?: string | null): HTMLElement | null {
  if (!id) return null;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  return root.querySelector<HTMLElement>(`[data-ow-id="${escaped}"]`);
}

function queryByDomPath(root: ParentNode, domPath?: string | null): HTMLElement | null {
  if (!domPath) return null;
  const selector = domPath.replace(/^prototype-root\s*>\s*/, "");
  if (!selector || selector === "prototype-root") {
    return root.querySelector<HTMLElement>(".prototype-root");
  }
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function getNodeInfo(element: HTMLElement, root: Element): VisualNodeInfo {
  const rect = element.getBoundingClientRect();
  const ownText = getOwnText(element);
  const aggregateText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  const text = (element.children.length === 0 ? aggregateText : ownText).slice(0, 180);
  const style = window.getComputedStyle(element);
  const domPath = getDomPath(element, root);
  const caps: VisualNodeInfo["editCapabilities"] = ["annotate", "style", "structure"];
  if (text && element.children.length === 0) caps.push("text");
  if (element instanceof HTMLImageElement || element.getAttribute("src")) caps.push("image");
  if (element instanceof HTMLAnchorElement || element.getAttribute("href")) caps.push("link");
  if (element.className) caps.push("className");

  return {
    nodeId: element.getAttribute("data-ow-id") || domPath,
    tagName: element.tagName.toLowerCase(),
    componentName: element.tagName.toLowerCase(),
    className: typeof element.className === "string" ? element.className || undefined : undefined,
    textContent: text || undefined,
    domPath,
    parentPath: element.parentElement ? getDomPath(element.parentElement, root) : undefined,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    attrs: {
      src: element.getAttribute("src") || undefined,
      currentSrc: element instanceof HTMLImageElement ? element.currentSrc || element.src || undefined : undefined,
      alt: element.getAttribute("alt") || undefined,
      href: element.getAttribute("href") || undefined,
      role: element.getAttribute("role") || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
    },
    computedStyle: {
      color: style.color || undefined,
      backgroundColor: style.backgroundColor || undefined,
      backgroundImage: style.backgroundImage || undefined,
      borderColor: style.borderColor || undefined,
      borderWidth: style.borderWidth || undefined,
      borderStyle: style.borderStyle || undefined,
      borderRadius: style.borderRadius || undefined,
      borderTopLeftRadius: style.borderTopLeftRadius || undefined,
      borderTopRightRadius: style.borderTopRightRadius || undefined,
      borderBottomRightRadius: style.borderBottomRightRadius || undefined,
      borderBottomLeftRadius: style.borderBottomLeftRadius || undefined,
      boxShadow: style.boxShadow || undefined,
      boxSizing: style.boxSizing || undefined,
      filter: style.filter || undefined,
      overflow: style.overflow || undefined,
      opacity: style.opacity || undefined,
      fontFamily: style.fontFamily || undefined,
      fontSize: style.fontSize || undefined,
      fontWeight: style.fontWeight || undefined,
      lineHeight: style.lineHeight || undefined,
      letterSpacing: style.letterSpacing || undefined,
      textAlign: style.textAlign || undefined,
      width: style.width || undefined,
      height: style.height || undefined,
      padding: style.padding || undefined,
      paddingTop: style.paddingTop || undefined,
      paddingRight: style.paddingRight || undefined,
      paddingBottom: style.paddingBottom || undefined,
      paddingLeft: style.paddingLeft || undefined,
      margin: style.margin || undefined,
      marginTop: style.marginTop || undefined,
      marginRight: style.marginRight || undefined,
      marginBottom: style.marginBottom || undefined,
      marginLeft: style.marginLeft || undefined,
      display: style.display || undefined,
      flexDirection: style.flexDirection || undefined,
      justifyContent: style.justifyContent || undefined,
      alignItems: style.alignItems || undefined,
      gap: style.gap || undefined,
    },
    editCapabilities: caps,
  };
}

function buildNodeStack(element: HTMLElement, root: Element): VisualNodeInfo[] {
  const stack: VisualNodeInfo[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    stack.unshift(getNodeInfo(current, root));
    current = current.parentElement;
  }
  return stack;
}

function normalizeStyleValue(property: string, value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (
    [
      "fontSize",
      "width",
      "height",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "padding",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "margin",
      "gap",
      "borderWidth",
      "borderRadius",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
      "letterSpacing",
      "lineHeight",
    ].includes(property) &&
    /^\d+(\.\d+)?$/.test(trimmed)
  ) {
    return `${trimmed}px`;
  }
  if (property === "opacity" && /^\d+(\.\d+)?%?$/.test(trimmed)) {
    const numeric = Number(trimmed.replace("%", ""));
    return String(numeric > 1 ? Math.max(0, Math.min(100, numeric)) / 100 : Math.max(0, Math.min(1, numeric)));
  }
  return trimmed;
}

function applyPropertyChanges(root: ParentNode, changes: VisualPropertyChange[]) {
  for (const change of changes) {
    const element =
      getElementByVisualId(root, change.nodeId) ||
      queryByDomPath(root, change.domPath);
    if (!element) continue;
    if (change.kind === "text") {
      element.textContent = change.value || "";
    } else if (change.kind === "attribute") {
      if (change.value) element.setAttribute(change.property, change.value);
      else element.removeAttribute(change.property);
    } else {
      element.style.setProperty(change.property.replace(/[A-Z]/g, (part) => `-${part.toLowerCase()}`), normalizeStyleValue(change.property, change.value));
    }
  }
}

function buildNodeTree(element: HTMLElement, root: Element): VisualNodeTreeItem {
  return {
    ...getNodeInfo(element, root),
    children: Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => buildNodeTree(child, root)),
  };
}

export function PrototypePagePreview({
  html = "",
  css = "",
  configData = {},
  className,
  visualEditMode = false,
  visualHoverNodeId,
  selectedVisualNodeId,
  visualPropertyChanges = [],
  onVisualHover,
  onVisualSelect,
  onVisualSelectStack,
  visualNodeTreeRequestKey,
  onVisualNodeTreeChange,
}: PrototypePagePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = shadowRef.current ?? host.attachShadow({ mode: "open" });
    shadowRef.current = shadow;
    const safeHtml = sanitizePrototypeHtml(html);
    const safeCss = sanitizePrototypeCss(css);
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          min-height: 100%;
          background: #fff;
          color: #111827;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
    const root = shadow.querySelector(".prototype-root");
    if (root) {
      applyPrototypeBindings(root, configData);
      applyPropertyChanges(root, visualPropertyChanges);
    }
  }, [configData, css, html, visualPropertyChanges]);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow || !onVisualNodeTreeChange || visualNodeTreeRequestKey == null) return;
    const root = shadow.querySelector<HTMLElement>(".prototype-root");
    if (!root) return;
    onVisualNodeTreeChange(Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => buildNodeTree(child, root)));
  }, [onVisualNodeTreeChange, visualNodeTreeRequestKey]);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;
    shadow.querySelectorAll("[data-prototype-selected], [data-prototype-hovered]").forEach((element) => {
      element.removeAttribute("data-prototype-selected");
      element.removeAttribute("data-prototype-hovered");
    });
    const root = shadow.querySelector<HTMLElement>(".prototype-root");
    if (!root) return;
    const selected = getElementByVisualId(root, selectedVisualNodeId) || queryByDomPath(root, selectedVisualNodeId);
    selected?.setAttribute("data-prototype-selected", "true");
    const hovered = getElementByVisualId(root, visualHoverNodeId) || queryByDomPath(root, visualHoverNodeId);
    hovered?.setAttribute("data-prototype-hovered", "true");
  }, [selectedVisualNodeId, visualHoverNodeId]);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow || !visualEditMode) return;
    const root = shadow.querySelector<HTMLElement>(".prototype-root");
    if (!root) return;

    const handlePointerMove = (event: Event) => {
      const target = event.composedPath()[0];
      if (!(target instanceof HTMLElement) || !root.contains(target)) {
        onVisualHover?.(null);
        return;
      }
      onVisualHover?.(getNodeInfo(target, root));
    };
    const handleClick = (event: Event) => {
      const target = event.composedPath()[0];
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const node = getNodeInfo(target, root);
      onVisualSelect?.(node);
      onVisualSelectStack?.(buildNodeStack(target, root));
    };
    const handlePointerLeave = () => onVisualHover?.(null);

    shadow.addEventListener("pointermove", handlePointerMove);
    shadow.addEventListener("click", handleClick, true);
    shadow.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      shadow.removeEventListener("pointermove", handlePointerMove);
      shadow.removeEventListener("click", handleClick, true);
      shadow.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [onVisualHover, onVisualSelect, onVisualSelectStack, visualEditMode]);

  return (
    <div
      ref={hostRef}
      className={cn("h-full w-full overflow-auto bg-white", className)}
      data-prototype-preview
    />
  );
}
