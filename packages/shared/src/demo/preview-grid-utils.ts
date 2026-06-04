"use client";

import { useState, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PreviewSize } from "./types";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

const DEFAULT_ASPECT_RATIO = 375 / 812;

export function getEffectivePreviewSize(size?: PreviewSize): PreviewSize {
  return size ?? DEFAULT_PREVIEW_SIZE;
}

export function parseSizeValue(value: string | number | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/, ""));
    return isNaN(num) ? null : num;
  }
  return null;
}

export function getAspectRatioValue(size?: PreviewSize): number {
  const w =
    typeof size?.width === "number"
      ? size.width
      : typeof size?.width === "string"
        ? parseFloat(size.width)
        : 375;
  const h =
    typeof size?.height === "number"
      ? size.height
      : typeof size?.height === "string"
        ? parseFloat(size.height)
        : 812;
  return isNaN(w) || isNaN(h) || h === 0 ? DEFAULT_ASPECT_RATIO : w / h;
}

export function getBaseRowHeight(columns: number): number {
  const map: Record<number, number> = { 2: 500, 3: 380, 4: 300 };
  return map[columns] ?? 380;
}

export function useVisiblePages(
  containerRef: RefObject<HTMLElement | null>,
  pageIds: string[],
  bufferCount: number = 1,
): Set<string> {
  const [visiblePages, setVisiblePages] = useState<Set<string>>(new Set());
  const pageIdsRef = useRef(pageIds);
  pageIdsRef.current = pageIds;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageId = entry.target.getAttribute("data-page-id");
            if (!pageId) continue;
            const idx = pageIdsRef.current.indexOf(pageId);
            if (idx === -1) continue;

            if (entry.isIntersecting) {
              next.add(pageId);
              for (
                let i = Math.max(0, idx - bufferCount);
                i <= Math.min(pageIdsRef.current.length - 1, idx + bufferCount);
                i++
              ) {
                next.add(pageIdsRef.current[i]);
              }
            } else {
              next.delete(pageId);
            }
          }
          return next;
        });
      },
      { root: container, rootMargin: "100% 0px" },
    );

    const observeCards = () => {
      const cards = container.querySelectorAll("[data-page-id]");
      cards.forEach((card) => observer.observe(card));
    };

    observeCards();

    const mo = new MutationObserver(() => {
      observer.disconnect();
      observeCards();
    });
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mo.disconnect();
    };
  }, [containerRef, bufferCount]);

  return visiblePages;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

function resolveRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split('/').filter(p => p !== '');
  const relativeParts = relativePath.split('/');

  for (const part of relativeParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

export interface ResolveImageUrlsOptions {
  sessionId?: string;
  demoId?: string;
}

export function resolveImageUrls(
  data: Record<string, unknown>,
  options?: ResolveImageUrlsOptions,
): Record<string, unknown> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!origin) return data;

  const { sessionId, demoId } = options || {};
  const basePath = demoId ? `demos/${demoId}/` : '';

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      // 已有的绝对 API 路径：补全 origin
      if (value.startsWith("/api/sessions/")) {
        return origin + value;
      }
      // 相对路径图片：改写为 API 绝对路径
      if (sessionId && basePath && /^\.\.?\/[^'")\s]*$/.test(value) && IMAGE_EXT_RE.test(value)) {
        const resolved = resolveRelativePath(value, basePath);
        return `${origin}/api/sessions/${sessionId}/workspace/${resolved}`;
      }
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = walk(v);
      }
      return result;
    }
    return value;
  }

  return walk(data) as Record<string, unknown>;
}

export const FLASH_ANIMATION_CSS = `
  @keyframes grid-card-flash {
    0%, 100% { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0); }
    50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6); }
  }
  .animate-grid-card-flash {
    animation: grid-card-flash 0.4s ease-in-out 2;
  }
`;
