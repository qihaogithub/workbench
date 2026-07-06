"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyPrototypeBindings,
  buildPrototypePreviewHtmlFragment,
  sanitizePrototypeCss,
  sanitizePrototypeHtml,
} from "@workbench/shared";
import { cn } from "./utils";
import { computePreviewScale } from "./preview-scale";
import type {
  PreviewSize,
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualPropertyChange,
} from "./types";

export interface PrototypePagePreviewProps {
  html?: string;
  css?: string;
  configData?: Record<string, unknown>;
  sessionId?: string;
  demoId?: string;
  previewSize?: PreviewSize;
  fillContainer?: boolean;
  effectiveHeight?: number;
  className?: string;
  visualEditMode?: boolean;
  visualHoverNodeId?: string | null;
  selectedVisualNodeId?: string | null;
  hiddenVisualNodeIds?: string[];
  visualPropertyChanges?: VisualPropertyChange[];
  onVisualHover?: (node: VisualNodeInfo | null) => void;
  onVisualSelect?: (node: VisualNodeInfo | null) => void;
  onVisualSelectStack?: (nodes: VisualNodeInfo[]) => void;
  visualNodeTreeRequestKey?: number;
  onVisualNodeTreeChange?: (nodes: VisualNodeTreeItem[]) => void;
}

function normalizeMeasuredSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
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
  sessionId,
  demoId,
  previewSize,
  fillContainer = false,
  effectiveHeight,
  className,
  visualEditMode = false,
  visualHoverNodeId,
  selectedVisualNodeId,
  hiddenVisualNodeIds = [],
  visualPropertyChanges = [],
  onVisualHover,
  onVisualSelect,
  onVisualSelectStack,
  visualNodeTreeRequestKey,
  onVisualNodeTreeChange,
}: PrototypePagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const shouldScaleToPreviewSize = previewSize != null;

  const updateContainerSize = useCallback((width: number, height: number) => {
    const nextWidth = normalizeMeasuredSize(width);
    const nextHeight = normalizeMeasuredSize(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
    setContainerHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const measureContainer = useCallback(() => {
    if (!shouldScaleToPreviewSize) return;
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width > 0 && height > 0) {
      updateContainerSize(width, height);
      return;
    }

    const rect = el.getBoundingClientRect();
    updateContainerSize(rect.width, rect.height);
  }, [shouldScaleToPreviewSize, updateContainerSize]);

  useLayoutEffect(() => {
    if (!shouldScaleToPreviewSize) return;
    measureContainer();
  }, [measureContainer, shouldScaleToPreviewSize]);

  useEffect(() => {
    if (!shouldScaleToPreviewSize) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldScaleToPreviewSize, updateContainerSize]);

  const { designWidth, designHeight, wrapperStyle, contentStyle } = computePreviewScale(
    previewSize,
    containerWidth,
    containerHeight,
    fillContainer,
    effectiveHeight,
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = shadowRef.current ?? host.attachShadow({ mode: "open" });
    shadowRef.current = shadow;
    const assetRewrite = sessionId && demoId
      ? {
          sessionId,
          demoId,
          origin: window.location.origin,
        }
      : undefined;
    shadow.innerHTML = buildPrototypePreviewHtmlFragment({
      html,
      css,
      configData,
      assetRewrite,
      previewSize: shouldScaleToPreviewSize
        ? { width: designWidth, height: designHeight }
        : undefined,
    });
    const root = shadow.querySelector(".prototype-root");
    if (root) {
      applyPrototypeBindings(root, configData, assetRewrite);
      applyPropertyChanges(root, visualPropertyChanges);
    }
  }, [
    configData,
    css,
    designHeight,
    designWidth,
    demoId,
    html,
    sessionId,
    shouldScaleToPreviewSize,
    visualPropertyChanges,
  ]);

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
    if (!shadow) return;
    shadow.querySelectorAll("[data-prototype-hidden]").forEach((element) => {
      if (element instanceof HTMLElement) {
        element.style.removeProperty("display");
      }
      element.removeAttribute("data-prototype-hidden");
    });
    const root = shadow.querySelector<HTMLElement>(".prototype-root");
    if (!root) return;
    hiddenVisualNodeIds.forEach((nodeId) => {
      const element =
        getElementByVisualId(root, nodeId) || queryByDomPath(root, nodeId);
      if (!element) return;
      element.setAttribute("data-prototype-hidden", "true");
      element.style.setProperty("display", "none", "important");
    });
  }, [configData, css, hiddenVisualNodeIds, html, visualPropertyChanges]);

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

  const previewHost = (
    <div
      ref={hostRef}
      className={cn(
        "h-full w-full overflow-auto bg-white",
        !shouldScaleToPreviewSize && className,
      )}
      data-prototype-preview
    />
  );

  if (!shouldScaleToPreviewSize) {
    return previewHost;
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full items-center justify-center", className)}
    >
      <div
        style={wrapperStyle}
        className={fillContainer ? "relative" : "relative rounded-lg border border-border bg-white shadow-sm"}
      >
        <div style={contentStyle}>{previewHost}</div>
      </div>
    </div>
  );
}
