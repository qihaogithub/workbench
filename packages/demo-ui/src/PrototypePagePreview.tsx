"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyPrototypeBindings,
  buildPrototypePreviewHtmlFragment,
} from "@workbench/shared";
import { cn } from "./utils";
import { LayerTreeMenu } from "./LayerTreeMenu";
import { computePreviewScale } from "./preview-scale";
import type {
  PreviewSize,
  PreviewContainerSize,
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
  containerSizeOverride?: PreviewContainerSize;
  effectiveHeight?: number;
  /** 单页预览允许设计画板内部纵向滚动查看超高内容；画布/截图保持裁剪 */
  allowScroll?: boolean;
  className?: string;
  onContentHeightChange?: (height: number) => void;
  visualEditMode?: boolean;
  visualHoverNodeId?: string | null;
  selectedVisualNodeId?: string | null;
  hiddenVisualNodeIds?: string[];
  visualLayerTreeNodes?: VisualNodeTreeItem[];
  visualPropertyChanges?: VisualPropertyChange[];
  onVisualSelect?: (node: VisualNodeInfo | null) => void;
  onVisualSelectStack?: (nodes: VisualNodeInfo[]) => void;
  onToggleNodeHidden?: (node: VisualNodeInfo) => void;
  visualNodeTreeRequestKey?: number;
  onVisualNodeTreeChange?: (nodes: VisualNodeTreeItem[]) => void;
}

type VisualElement = HTMLElement | SVGElement;

function isVisualElement(value: unknown): value is VisualElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function resolveVisualEventTarget(target: EventTarget | null, root: Element): VisualElement | null {
  if (!isVisualElement(target) || !root.contains(target)) return null;
  if (target instanceof SVGElement) {
    const svg = target.closest("svg");
    return isVisualElement(svg) ? svg : target;
  }
  return target;
}

function normalizeMeasuredSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

// 画布中展示"完整内容"：可滚动页面（如手机端内容超出设计画板、由作者用固定高度 +
// overflow 裁剪的容器装起来）在画布卡片里应透出全部内容，而不是只在内部滚动一屏。
// 这里自底向上把"纵向裁剪且内容确实溢出"的容器解除裁剪（overflow:visible + height:auto），
// 让 .prototype-root 自然长到完整内容高度，再由 ResizeObserver 上报给画布。
// 平铺正好一屏的固定页（contentHeight == clientHeight）不会被改动，幻灯片等不被误展开。
function expandVerticalClippedElements(root: Element) {
  const elements = Array.from(root.querySelectorAll("*"));
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!(el instanceof HTMLElement)) continue;
    const overflowY = getComputedStyle(el).overflowY;
    const clipsVertical =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden";
    if (!clipsVertical || el.scrollHeight <= el.clientHeight + 1) continue;
    el.style.overflow = "visible";
    el.style.height = "auto";
  }
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

function getElementByVisualId(root: ParentNode, id?: string | null): VisualElement | null {
  if (!id) return null;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  const element = root.querySelector(`[data-ow-id="${escaped}"]`);
  return isVisualElement(element) ? element : null;
}

function queryByDomPath(root: ParentNode, domPath?: string | null): VisualElement | null {
  if (!domPath) return null;
  const selector = domPath.replace(/^prototype-root\s*>\s*/, "");
  if (!selector || selector === "prototype-root") {
    return root.querySelector<HTMLElement>(".prototype-root");
  }
  try {
    const element = root.querySelector(selector);
    return isVisualElement(element) ? element : null;
  } catch {
    return null;
  }
}

function getNodeInfo(element: VisualElement, root: Element): VisualNodeInfo {
  const rect = element.getBoundingClientRect();
  const ownText = getOwnText(element);
  const aggregateText = (
    (element instanceof HTMLElement ? element.innerText : "") ||
    element.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const text = (element.children.length === 0 ? aggregateText : ownText).slice(0, 180);
  const style = window.getComputedStyle(element);
  const domPath = getDomPath(element, root);
  const className = element.getAttribute("class")?.trim() || undefined;
  const caps: VisualNodeInfo["editCapabilities"] = ["annotate", "style", "structure"];
  if (text && element.children.length === 0) caps.push("text");
  if (element instanceof HTMLImageElement || element.getAttribute("src")) caps.push("image");
  if (element instanceof HTMLAnchorElement || element.getAttribute("href")) caps.push("link");
  if (className) caps.push("className");

  return {
    nodeId: element.getAttribute("data-ow-id") || domPath,
    tagName: element.tagName.toLowerCase(),
    componentName: element.tagName.toLowerCase(),
    className,
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

function formatSelectedLabel(element: VisualElement): string {
  const tag = element.tagName.toLowerCase();
  const className = element.getAttribute("class")?.trim().split(/\s+/).slice(0, 2).join(".");
  const text = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
  const parts: string[] = [tag];
  if (className) parts.push(`.${className}`);
  if (text) parts.push(` "${text}"`);
  return parts.join("");
}

function updateSelectedLabel(
  shadow: ShadowRoot,
  host: HTMLElement,
  element: VisualElement | null,
) {
  const label = shadow.querySelector<HTMLElement>("[data-prototype-selected-label]");
  if (!label) return;
  if (!element) {
    label.style.display = "none";
    return;
  }
  const rect = element.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  // 标签位于被 transform: scale() 包裹的 Shadow DOM 中，position:fixed 退化为相对
  // transform 祖先定位。getBoundingClientRect 差值已含缩放，需除回 scale，避免偏移被
  // 二次叠加导致标签偏离元素边界（与高保真 iframe 视觉对齐）。
  const scaledParent = host.parentElement;
  const scale =
    scaledParent && scaledParent.offsetWidth > 0
      ? scaledParent.getBoundingClientRect().width / scaledParent.offsetWidth
      : 1;
  label.style.display = "block";
  label.style.left = `${Math.max(4, (rect.left - hostRect.left) / scale)}px`;
  label.style.top = `${Math.max(4, (rect.top - hostRect.top) / scale - 24)}px`;
  label.textContent = formatSelectedLabel(element);
}

function resolveLabelElement(shadow: ShadowRoot): VisualElement | null {
  const hovered = shadow.querySelector("[data-prototype-hovered]");
  if (hovered && isVisualElement(hovered)) return hovered;
  const selected = shadow.querySelector("[data-prototype-selected]");
  if (selected && isVisualElement(selected)) return selected;
  return null;
}

function collectPointNodeStack(
  shadow: ShadowRoot,
  target: VisualElement,
  root: Element,
  clientX: number,
  clientY: number,
): VisualNodeInfo[] {
  const ancestry: VisualElement[] = [];
  let current: Element | null = target;
  while (current && current !== root) {
    if (isVisualElement(current)) ancestry.unshift(current);
    current = current.parentElement;
  }

  const pointShadow = shadow as ShadowRoot & {
    elementsFromPoint?: (x: number, y: number) => Element[];
  };
  const pointElements = pointShadow.elementsFromPoint?.(clientX, clientY) ?? [];
  const visualHits = pointElements
    .map((element) => resolveVisualEventTarget(element, root))
    .filter((element): element is VisualElement => !!element && element !== root)
    .reverse();

  const ordered: VisualElement[] = [];
  [...ancestry, ...visualHits].forEach((element) => {
    const domPath = getDomPath(element, root);
    const previousIndex = ordered.findIndex(
      (candidate) => getDomPath(candidate, root) === domPath,
    );
    if (previousIndex >= 0) ordered.splice(previousIndex, 1);
    ordered.push(element);
  });

  return ordered.map((element) => getNodeInfo(element, root));
}

function collectAncestorNodeStack(
  element: VisualElement,
  root: Element,
): VisualNodeInfo[] {
  const stack: VisualNodeInfo[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    if (isVisualElement(current)) stack.unshift(getNodeInfo(current, root));
    current = current.parentElement;
  }
  return stack;
}

function moveSelectedNodeToStackEnd(
  stack: VisualNodeInfo[],
  selected: VisualNodeInfo,
): VisualNodeInfo[] {
  return [
    ...stack.filter((node) => node.domPath !== selected.domPath),
    selected,
  ];
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

function buildNodeTree(element: VisualElement, root: Element): VisualNodeTreeItem {
  return {
    ...getNodeInfo(element, root),
    children: Array.from(element.children)
      .filter(isVisualElement)
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
  containerSizeOverride,
  effectiveHeight,
  allowScroll = false,
  className,
  onContentHeightChange,
  visualEditMode = false,
  visualHoverNodeId,
  selectedVisualNodeId,
  hiddenVisualNodeIds = [],
  visualLayerTreeNodes,
  visualPropertyChanges = [],
  onVisualSelect,
  onVisualSelectStack,
  onToggleNodeHidden,
  visualNodeTreeRequestKey,
  onVisualNodeTreeChange,
}: PrototypePagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  // 内容高度回调保持最新引用，避免其身份变化触发下方测量 effect 重建 shadow DOM。
  // 重建会导致可滚动容器裁解除失效、root 瞬时回到一屏高度，进而与上报高度形成正反馈闪烁。
  const onContentHeightChangeRef = useRef(onContentHeightChange);
  onContentHeightChangeRef.current = onContentHeightChange;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tree: VisualNodeTreeItem;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const shouldScaleToPreviewSize = previewSize != null;
  const hasContainerSizeOverride = containerSizeOverride != null;

  const updateContainerSize = useCallback((width: number, height: number) => {
    const nextWidth = normalizeMeasuredSize(width);
    const nextHeight = normalizeMeasuredSize(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
    setContainerHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const measureContainer = useCallback(() => {
    if (!shouldScaleToPreviewSize || hasContainerSizeOverride) return;
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
  }, [hasContainerSizeOverride, shouldScaleToPreviewSize, updateContainerSize]);

  useLayoutEffect(() => {
    if (!shouldScaleToPreviewSize) return;
    measureContainer();
  }, [measureContainer, shouldScaleToPreviewSize]);

  useEffect(() => {
    if (!shouldScaleToPreviewSize || hasContainerSizeOverride) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasContainerSizeOverride, shouldScaleToPreviewSize, updateContainerSize]);

  const effectiveContainerWidth = containerSizeOverride?.width ?? containerWidth;
  const effectiveContainerHeight = containerSizeOverride?.height ?? containerHeight;

  const { designWidth, designHeight, wrapperStyle, contentStyle } = computePreviewScale(
    previewSize,
    effectiveContainerWidth,
    effectiveContainerHeight,
    fillContainer,
    effectiveHeight,
  );

  // 归一化视口单位、以及 .prototype-root 的固定设计画板尺寸，必须使用页面的
  // 真实设计尺寸（previewSize），而不是 computePreviewScale 返回的 designHeight。
  // 在 fillContainer + effectiveHeight 场景下，computePreviewScale 会把 designHeight
  // 抬升为内容高度（max(设计高, effectiveHeight)），若用它作为设计基准，会让
  // 100vh 被归一化成过高的像素值，导致整屏页被画布自身的测量高度反向撑高。
  const fragmentDesignWidth = previewSize?.width;
  const fragmentDesignHeight = previewSize?.height;

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
      allowScroll,
      previewSize: shouldScaleToPreviewSize
        ? { width: fragmentDesignWidth, height: fragmentDesignHeight }
        : undefined,
      constrainHeight: shouldScaleToPreviewSize ? !fillContainer : undefined,
    });
    const root = shadow.querySelector(".prototype-root");
    if (root) {
      applyPrototypeBindings(root, configData, assetRewrite);
      applyPropertyChanges(root, visualPropertyChanges);
    }
    if (!onContentHeightChangeRef.current || !shouldScaleToPreviewSize || !root) return;
    const reportHeight = (height: number) => {
      if (Number.isFinite(height) && height > 0) {
        onContentHeightChangeRef.current?.(height);
      }
    };
    // 先解除可滚动容器的裁剪，让 root 长到完整内容高度，ResizeObserver 才会上报正确高度。
    expandVerticalClippedElements(root);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        console.count("[perf] PrototypePagePreview ResizeObserver fire");
        reportHeight(entry.contentRect.height);
      }
    });
    observer.observe(root);
    // 字体加载可能改变内容高度；加载完成后重测一次，避免卡片停留在字体加载前的高度。
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!root.isConnected) return;
        expandVerticalClippedElements(root);
        reportHeight(root.scrollHeight);
      });
    }
    // 初始上报兜底：ResizeObserver 的首帧回调在部分浏览器/容器缩放场景下可能不触发，
    // 导致稳定高度的页面永远不把真实内容高度上报给画布，卡片停留在历史持久化高度。
    // 这里在渲染后异步上报一次初始内容高度（scrollHeight 为元素自身坐标，不受画布 transform 缩放影响）。
    requestAnimationFrame(function () {
      if (root.isConnected) {
        reportHeight(root.scrollHeight);
      }
    });
    return () => observer.disconnect();
  }, [
    allowScroll,
    configData,
    css,
    demoId,
    fillContainer,
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
    onVisualNodeTreeChange(
      Array.from(root.children)
        .filter(isVisualElement)
        .map((child) => buildNodeTree(child, root)),
    );
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
    const host = hostRef.current;
    if (host) {
      updateSelectedLabel(shadow, host, resolveLabelElement(shadow));
    }
  }, [selectedVisualNodeId, visualHoverNodeId]);

  useEffect(() => {
    const shadow = shadowRef.current;
    const host = hostRef.current;
    if (!shadow || !host) return;
    const update = () => updateSelectedLabel(shadow, host, resolveLabelElement(shadow));
    host.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      host.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

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
    const host = hostRef.current;
    if (!host) return;

    let hoveredElement: VisualElement | null = null;
    let activeSelectedElement =
      getElementByVisualId(root, selectedVisualNodeId) ||
      queryByDomPath(root, selectedVisualNodeId);
    let cycleSignature = "";
    let cycleIndex = -1;

    const setHoveredElement = (element: VisualElement | null) => {
      if (hoveredElement === element) return;
      hoveredElement?.removeAttribute("data-prototype-hovered");
      hoveredElement = element;
      hoveredElement?.setAttribute("data-prototype-hovered", "true");
    };

    const handlePointerOver = (event: Event) => {
      const target = resolveVisualEventTarget(event.composedPath()[0] ?? null, root);
      setHoveredElement(target);
    };
    const handleClick = (event: Event) => {
      setContextMenu(null);
      const mouseEvent = event as MouseEvent;
      const target = resolveVisualEventTarget(event.composedPath()[0] ?? null, root);
      if (!target || target === root) {
        event.preventDefault();
        event.stopPropagation();
        activeSelectedElement = null;
        setHoveredElement(null);
        onVisualSelect?.(null);
        onVisualSelectStack?.([]);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const stack = collectPointNodeStack(
        shadow,
        target,
        root,
        mouseEvent.clientX,
        mouseEvent.clientY,
      );
      if (stack.length === 0) return;

      const nextSignature = stack.map((node) => node.domPath).join("|");
      const shouldCycle = mouseEvent.metaKey || mouseEvent.ctrlKey;
      if (shouldCycle && cycleSignature === nextSignature) {
        cycleIndex = (cycleIndex - 1 + stack.length) % stack.length;
      } else {
        cycleSignature = nextSignature;
        cycleIndex = stack.length - 1;
      }
      if (!shouldCycle) cycleSignature = "";

      const node = stack[cycleIndex] ?? stack[stack.length - 1];
      activeSelectedElement =
        getElementByVisualId(root, node.nodeId) ||
        queryByDomPath(root, node.domPath);
      setHoveredElement(null);
      onVisualSelect?.(node);
      onVisualSelectStack?.(moveSelectedNodeToStackEnd(stack, node));
      host.focus({ preventScroll: true });
    };
    const handlePointerLeave = () => setHoveredElement(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      const eventTarget = event.target;
      if (
        eventTarget instanceof Element &&
        eventTarget.closest("input,textarea,select,[contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
        activeSelectedElement = null;
        onVisualSelect?.(null);
        onVisualSelectStack?.([]);
        return;
      }
      if (!activeSelectedElement) return;

      let next: Element | null = null;
      if (event.key === "Enter") {
        next = event.shiftKey
          ? activeSelectedElement.parentElement
          : activeSelectedElement.firstElementChild;
      } else if (event.key === "Tab") {
        next = event.shiftKey
          ? activeSelectedElement.previousElementSibling
          : activeSelectedElement.nextElementSibling;
      } else {
        return;
      }

      const visualTarget = resolveVisualEventTarget(next, root);
      if (!visualTarget || visualTarget === root) return;
      event.preventDefault();
      activeSelectedElement = visualTarget;
      const node = getNodeInfo(visualTarget, root);
      onVisualSelect?.(node);
      onVisualSelectStack?.(collectAncestorNodeStack(visualTarget, root));
    };
    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const target = resolveVisualEventTarget(event.composedPath()[0] ?? null, root);
      if (target && target !== root) {
        event.preventDefault();
        event.stopPropagation();
        const stack = collectPointNodeStack(
          shadow,
          target,
          root,
          mouseEvent.clientX,
          mouseEvent.clientY,
        );
        const node = stack[stack.length - 1] ?? getNodeInfo(target, root);
        activeSelectedElement =
          getElementByVisualId(root, node.nodeId) ||
          queryByDomPath(root, node.domPath);
        if (node) {
          onVisualSelect?.(node);
          onVisualSelectStack?.(moveSelectedNodeToStackEnd(stack, node));
        }
        const tree = buildNodeTree(target, root);
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const menuWidth = 236;
          const menuHeight = 320;
          const rawX = mouseEvent.clientX - containerRect.left;
          const rawY = mouseEvent.clientY - containerRect.top;
          const maxX = Math.max(8, containerRect.width - menuWidth);
          const maxY = Math.max(8, containerRect.height - menuHeight);
          setContextMenu({
            x: Math.min(Math.max(rawX, 8), maxX),
            y: Math.min(Math.max(rawY, 8), maxY),
            tree,
          });
        }
      } else {
        setContextMenu(null);
      }
    };

    shadow.addEventListener("pointerover", handlePointerOver);
    shadow.addEventListener("click", handleClick, true);
    shadow.addEventListener("pointerleave", handlePointerLeave);
    shadow.addEventListener("contextmenu", handleContextMenu, true);
    host.addEventListener("keydown", handleKeyDown);
    return () => {
      setHoveredElement(null);
      setContextMenu(null);
      shadow.removeEventListener("pointerover", handlePointerOver);
      shadow.removeEventListener("click", handleClick, true);
      shadow.removeEventListener("pointerleave", handlePointerLeave);
      shadow.removeEventListener("contextmenu", handleContextMenu, true);
      host.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    onVisualSelect,
    onVisualSelectStack,
    onToggleNodeHidden,
    selectedVisualNodeId,
    visualEditMode,
  ]);

  const renderContextMenu = () => {
    if (!visualEditMode || !contextMenu) return null;
    return (
      <div
        className="absolute z-30"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <LayerTreeMenu
          title="预览区图层"
          nodes={[contextMenu.tree]}
          scrollClassName="layer-tree-menu-scrollbar max-h-[320px]"
          selectedNodeId={selectedVisualNodeId}
          hiddenNodeIds={hiddenVisualNodeIds}
          onToggleNodeHidden={onToggleNodeHidden}
          onSelectNode={(node, path) => {
            onVisualSelect?.(node);
            onVisualSelectStack?.(path);
            setContextMenu(null);
          }}
        />
      </div>
    );
  };

  const previewHost = (
    <div
      ref={hostRef}
      className={cn(
        "h-full w-full overflow-auto bg-white",
        !shouldScaleToPreviewSize && className,
      )}
      style={shouldScaleToPreviewSize ? { scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties : undefined}
      data-prototype-preview
      tabIndex={visualEditMode ? 0 : undefined}
    />
  );

  if (!shouldScaleToPreviewSize) {
    return (
      <div className="relative h-full w-full">
        {previewHost}
        {renderContextMenu()}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative flex h-full w-full items-center justify-center", className)}
    >
      <style>{`
        [data-prototype-preview]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        style={wrapperStyle}
        className={fillContainer ? "relative" : "relative rounded-lg border border-border bg-white shadow-sm"}
      >
        <div style={contentStyle}>{previewHost}</div>
      </div>
      {renderContextMenu()}
    </div>
  );
}
