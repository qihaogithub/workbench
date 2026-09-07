import {
  autoUpdate,
  computePosition,
  flip,
  shift,
  size,
  type Middleware,
  type VirtualElement,
} from "@floating-ui/dom";

export type DocumentOverlayPlacement =
  | "bottom-start"
  | "top-start"
  | "right-start"
  | "left-start";

export interface DocumentRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface SafeOverlayPositionInput {
  reference: DocumentRect;
  floating: Pick<DocumentRect, "width" | "height">;
  boundary: DocumentRect;
  obstacles?: DocumentRect[];
  placements: DocumentOverlayPlacement[];
  gap?: number;
}

export interface SafeOverlayPosition {
  placement: DocumentOverlayPlacement;
  left: number;
  top: number;
  rect: DocumentRect;
}

export interface DocumentOverlayPositionerOptions {
  root: HTMLElement;
  boundary?: Element;
  floating: HTMLElement;
  getReferenceRect: () => DOMRect | DocumentRect | null;
  getObstacles?: () => Array<DOMRect | DocumentRect>;
  placements: DocumentOverlayPlacement[];
  gap?: number;
  contextElement?: Element;
}

export interface DocumentOverlayPositionerController {
  refresh: () => Promise<void>;
  hide: () => void;
  destroy: () => void;
}

function normalizeRect(rect: DOMRect | DocumentRect): DocumentRect {
  const width = rect.width ?? rect.right - rect.left;
  const height = rect.height ?? rect.bottom - rect.top;
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width,
    height,
  };
}

function intersects(first: DocumentRect, second: DocumentRect): boolean {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

function contains(boundary: DocumentRect, rect: DocumentRect): boolean {
  return (
    rect.left >= boundary.left &&
    rect.right <= boundary.right &&
    rect.top >= boundary.top &&
    rect.bottom <= boundary.bottom
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function makeCandidateRect(
  reference: DocumentRect,
  width: number,
  height: number,
  placement: DocumentOverlayPlacement,
  gap: number,
  boundary: DocumentRect,
): DocumentRect | null {
  const minLeft = boundary.left + gap;
  const maxLeft = boundary.right - width - gap;
  const minTop = boundary.top + gap;
  const maxTop = boundary.bottom - height - gap;

  if (maxLeft < minLeft || maxTop < minTop) return null;

  let left: number;
  let top: number;
  if (placement === "bottom-start") {
    left = clamp(reference.left, minLeft, maxLeft);
    top = reference.bottom + gap;
  } else if (placement === "top-start") {
    left = clamp(reference.left, minLeft, maxLeft);
    top = reference.top - height - gap;
  } else if (placement === "right-start") {
    left = reference.right + gap;
    top = clamp(reference.top, minTop, maxTop);
  } else {
    left = reference.left - width - gap;
    top = clamp(reference.top, minTop, maxTop);
  }

  return {
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
  };
}

/**
 * Selects the first placement that fits the editor viewport without touching
 * the reference or an explicitly protected rectangle. Cross-axis clamping is
 * allowed; main-axis shifting is intentionally not, because doing so could
 * move a menu back on top of the text that opened it.
 */
export function chooseSafeOverlayPosition({
  reference,
  floating,
  boundary,
  obstacles = [],
  placements,
  gap = 8,
}: SafeOverlayPositionInput): SafeOverlayPosition | null {
  const normalizedReference = normalizeRect(reference);
  const normalizedBoundary = normalizeRect(boundary);
  const protectedRects = [
    normalizedReference,
    ...obstacles.map(normalizeRect),
  ];

  for (const placement of placements) {
    const rect = makeCandidateRect(
      normalizedReference,
      floating.width,
      floating.height,
      placement,
      gap,
      normalizedBoundary,
    );
    if (!rect || !contains(normalizedBoundary, rect)) continue;
    if (protectedRects.some((obstacle) => intersects(rect, obstacle))) continue;

    return {
      placement,
      left: rect.left,
      top: rect.top,
      rect,
    };
  }

  return null;
}

function setHidden(floating: HTMLElement) {
  floating.dataset.safe = "false";
  floating.dataset.placement = "hidden";
  floating.setAttribute("aria-hidden", "true");
}

/**
 * A small, editor-scoped Floating UI controller. Floating UI still owns
 * resize/scroll observation and available-size measurement, while the pure
 * policy above decides whether a candidate is allowed to cover text.
 */
export function mountDocumentOverlayPositioner(
  options: DocumentOverlayPositionerOptions,
): DocumentOverlayPositionerController {
  let destroyed = false;
  let revision = 0;
  let cleanupAutoUpdate: (() => void) | null = null;
  const gap = options.gap ?? 8;
  const boundary = options.boundary ?? options.root;

  const reference: VirtualElement = {
    contextElement: options.contextElement,
    getBoundingClientRect: () => {
      const rect = options.getReferenceRect();
      if (!rect) return new DOMRect(0, 0, 0, 0);
      const normalized = normalizeRect(rect);
      return new DOMRect(
        normalized.left,
        normalized.top,
        normalized.width,
        normalized.height,
      );
    },
  };

  const refresh = async () => {
    const currentRevision = ++revision;
    if (destroyed) return;

    const referenceRect = options.getReferenceRect();
    if (!referenceRect) {
      setHidden(options.floating);
      return;
    }

    options.floating.dataset.safe = "false";
    options.floating.setAttribute("aria-hidden", "true");

    let availableWidth = Number.POSITIVE_INFINITY;
    let availableHeight = Number.POSITIVE_INFINITY;
    const sizingMiddleware: Middleware = size({
      boundary,
      padding: gap,
      apply({ availableWidth: nextWidth, availableHeight: nextHeight }) {
        availableWidth = nextWidth;
        availableHeight = nextHeight;
      },
    });

    try {
      await computePosition(reference, options.floating, {
        strategy: "absolute",
        placement: options.placements[0] ?? "bottom-start",
        middleware: [
          flip({
            boundary,
            padding: gap,
            fallbackPlacements: options.placements.slice(1),
          }),
          shift({ boundary, padding: gap }),
          sizingMiddleware,
        ],
      });
      if (destroyed || currentRevision !== revision) return;

      const rootRect = normalizeRect(options.root.getBoundingClientRect());
      const boundaryRect = normalizeRect(boundary.getBoundingClientRect());
      const floatingRect = options.floating.getBoundingClientRect();
      const floatingWidth = floatingRect.width || options.floating.offsetWidth;
      const floatingHeight =
        floatingRect.height || options.floating.offsetHeight;
      const safePosition = chooseSafeOverlayPosition({
        reference: normalizeRect(referenceRect),
        floating: { width: floatingWidth, height: floatingHeight },
        boundary: boundaryRect,
        obstacles: options.getObstacles?.() ?? [],
        placements: options.placements,
        gap,
      });

      if (!safePosition) {
        setHidden(options.floating);
        return;
      }

      if (Number.isFinite(availableWidth)) {
        options.floating.style.setProperty(
          "--document-overlay-max-width",
          `${Math.max(0, availableWidth)}px`,
        );
      }
      if (Number.isFinite(availableHeight)) {
        options.floating.style.setProperty(
          "--document-overlay-max-height",
          `${Math.max(0, availableHeight)}px`,
        );
      }
      options.floating.style.left = `${safePosition.left - rootRect.left}px`;
      options.floating.style.top = `${safePosition.top - rootRect.top}px`;
      options.floating.dataset.placement = safePosition.placement;
      options.floating.dataset.safe = "true";
      options.floating.setAttribute("aria-hidden", "false");
    } catch {
      if (!destroyed && currentRevision === revision)
        setHidden(options.floating);
    }
  };

  const hide = () => {
    revision += 1;
    setHidden(options.floating);
  };

  cleanupAutoUpdate = autoUpdate(reference, options.floating, () => {
    void refresh();
  });
  void refresh();

  return {
    refresh,
    hide,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      revision += 1;
      cleanupAutoUpdate?.();
      cleanupAutoUpdate = null;
      setHidden(options.floating);
    },
  };
}
