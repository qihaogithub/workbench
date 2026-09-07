import {
  autoUpdate,
  computePosition,
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
  minimumSize?: { width: number; height: number };
}

export interface SafeOverlayPosition {
  placement: DocumentOverlayPlacement | "docked";
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
  /** Scrollable menus may shrink; toolbars retain their natural dimensions. */
  minimumSize?: { width: number; height: number };
  /** Selection tools may cover neighbouring content and dock as a last resort. */
  selectionToolbar?: boolean;
}

export function chooseSelectionToolbarPosition(
  input: SafeOverlayPositionInput,
): SafeOverlayPosition | null {
  const { boundary, floating, reference, obstacles = [], gap = 8 } = input;
  const top = Math.max(
    boundary.top,
    ...obstacles
      .filter((rect) => intersects(boundary, rect))
      .map((rect) => rect.bottom),
  );
  const usable = { ...boundary, top, height: boundary.bottom - top };
  if (
    floating.width > usable.width - gap * 2 ||
    floating.height > usable.height - gap * 2
  )
    return null;
  const adjacent = chooseSafeOverlayPosition({
    ...input,
    boundary: usable,
    obstacles: [],
    placements: ["top-start", "bottom-start"],
  });
  if (adjacent) return adjacent;
  // A viewport-spanning selection leaves no adjacent slot. Keep its controls
  // reachable in a labelled dock instead of silently dropping the toolbar.
  const left = clamp(
    reference.left,
    usable.left + gap,
    usable.right - floating.width - gap,
  );
  const dockTop = usable.top + gap;
  return {
    placement: "docked",
    left,
    top: dockTop,
    rect: {
      left,
      top: dockTop,
      right: left + floating.width,
      bottom: dockTop + floating.height,
      ...floating,
    },
  };
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

export function getDocumentOverlayBoundary(
  editor: DocumentRect,
  clipped: { x: number; y: number; width: number; height: number },
  flowing: boolean,
): DocumentRect {
  const left = Math.max(editor.left, clipped.x);
  const right = Math.min(editor.right, clipped.x + clipped.width);
  const top = flowing ? clipped.y : Math.max(editor.top, clipped.y);
  const bottom = flowing
    ? clipped.y + clipped.height
    : Math.min(editor.bottom, clipped.y + clipped.height);
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
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
  minimumSize,
}: SafeOverlayPositionInput): SafeOverlayPosition | null {
  const normalizedReference = normalizeRect(reference);
  const normalizedBoundary = normalizeRect(boundary);
  const protectedRects = [normalizedReference, ...obstacles.map(normalizeRect)];

  for (const placement of placements) {
    const availableWidth =
      placement === "right-start"
        ? boundary.right - reference.right - gap * 2
        : placement === "left-start"
          ? reference.left - boundary.left - gap * 2
          : boundary.width - gap * 2;
    const availableHeight =
      placement === "bottom-start"
        ? boundary.bottom - reference.bottom - gap * 2
        : placement === "top-start"
          ? reference.top - boundary.top - gap * 2
          : boundary.height - gap * 2;
    const width = minimumSize
      ? Math.min(floating.width, availableWidth)
      : floating.width;
    const height = minimumSize
      ? Math.min(floating.height, availableHeight)
      : floating.height;
    if (
      minimumSize &&
      (width < minimumSize.width || height < minimumSize.height)
    )
      continue;
    const rect = makeCandidateRect(
      normalizedReference,
      width,
      height,
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

    // Repositioning an active selection control must not make it inert:
    // visibility:hidden would blur its focused select/More button mid-click.
    if (!options.selectionToolbar || options.floating.dataset.safe !== "true") {
      options.floating.dataset.safe = "false";
      options.floating.setAttribute("aria-hidden", "true");
    }

    const flowing = boundary.getAttribute("data-scrollable") === "false";
    let scrollport: Element | null = null;
    if (flowing) {
      // Fixed overlays escape decorative overflow-hidden cards. Their actual
      // vertical boundary is the host scrollport, not those content wrappers.
      for (
        let parent = boundary.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const overflow =
          parent.ownerDocument.defaultView?.getComputedStyle(parent).overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          scrollport = parent;
          break;
        }
      }
    }

    try {
      const measurement = await computePosition(reference, options.floating, {
        strategy: "fixed",
        middleware: [
          {
            name: "documentBoundary",
            async fn({ platform, strategy }) {
              return {
                data: await platform.getClippingRect({
                  element:
                    scrollport ?? options.contextElement ?? options.floating,
                  boundary: scrollport ? [scrollport] : "clippingAncestors",
                  rootBoundary: "viewport",
                  strategy,
                }),
              };
            },
          },
        ],
      });
      const clipped = measurement.middlewareData.documentBoundary as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      if (destroyed || currentRevision !== revision) return;

      const rootRect = normalizeRect(options.root.getBoundingClientRect());
      const bounds = boundary.getBoundingClientRect();
      // A flowing editor's height is its content height, not a viewport.
      // Keep its horizontal scope but use the enclosing scrollport vertically.
      const boundaryRect = getDocumentOverlayBoundary(bounds, clipped, flowing);
      if (!intersects(boundaryRect, normalizeRect(referenceRect))) {
        setHidden(options.floating);
        return;
      }
      // Measure the preferred size, not the previous placement's constrained
      // size. The final constraints are applied synchronously before paint.
      options.floating.style.removeProperty("--document-overlay-max-width");
      options.floating.style.removeProperty("--document-overlay-max-height");
      if (options.selectionToolbar) {
        const compact = String(boundaryRect.width < 360);
        const more = options.floating.querySelector("details");
        if (
          more &&
          (options.floating.dataset.compact !== compact || compact === "false")
        ) {
          more.open = compact === "false";
        }
        options.floating.dataset.compact = compact;
        options.floating.style.setProperty(
          "--document-overlay-max-width",
          `${Math.max(0, boundaryRect.width - gap * 2)}px`,
        );
      }
      const floatingRect = options.floating.getBoundingClientRect();
      const floatingWidth = floatingRect.width || options.floating.offsetWidth;
      const floatingHeight =
        floatingRect.height || options.floating.offsetHeight;
      const safePosition = (
        options.selectionToolbar
          ? chooseSelectionToolbarPosition
          : chooseSafeOverlayPosition
      )({
        reference: normalizeRect(referenceRect),
        floating: { width: floatingWidth, height: floatingHeight },
        boundary: boundaryRect,
        obstacles: options.getObstacles?.() ?? [],
        placements: options.placements,
        gap,
        minimumSize: options.minimumSize,
      });

      if (!safePosition) {
        setHidden(options.floating);
        return;
      }

      if (options.minimumSize) {
        options.floating.style.setProperty(
          "--document-overlay-max-width",
          `${safePosition.rect.width}px`,
        );
      }
      if (options.minimumSize) {
        options.floating.style.setProperty(
          "--document-overlay-max-height",
          `${safePosition.rect.height}px`,
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
