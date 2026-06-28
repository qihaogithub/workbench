import type {
  CanvasFreeNode,
  CanvasLayersState,
  CanvasPageLayout,
  CanvasState,
  CanvasTextNodeSummary,
  CanvasToolMode,
  CanvasViewportState,
} from "./types";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasScreenRect {
  left: number;
  top: number;
}

export type CanvasSelectionTarget =
  | { layer: "page"; id: string }
  | { layer: "annotation"; id: string };

export type CanvasPointerLayer =
  | "kernel"
  | "page-preview"
  | "free-annotation"
  | "overlay";

export function screenPointToCanvasPoint(
  clientX: number,
  clientY: number,
  containerRect: CanvasScreenRect,
  viewport: CanvasViewportState,
): CanvasPoint {
  const zoom = viewport.zoom || 1;
  return {
    x: (clientX - containerRect.left - viewport.x) / zoom,
    y: (clientY - containerRect.top - viewport.y) / zoom,
  };
}

export function canvasPointToScreenPoint(
  point: CanvasPoint,
  viewport: CanvasViewportState,
): CanvasPoint {
  return {
    x: viewport.x + point.x * viewport.zoom,
    y: viewport.y + point.y * viewport.zoom,
  };
}

export function resolveCanvasToolMode(
  mode: CanvasToolMode,
  isEditorMode: boolean,
): CanvasToolMode {
  return isEditorMode ? mode : "hand";
}

export function routeCanvasPointerLayer(options: {
  toolMode: CanvasToolMode;
  isSpacePanning?: boolean;
  isMiddleButton?: boolean;
  isOverlayTarget?: boolean;
  hitPage?: boolean;
  hitAnnotation?: boolean;
}): CanvasPointerLayer {
  if (options.isOverlayTarget) return "overlay";
  if (options.isSpacePanning || options.isMiddleButton || options.toolMode === "hand") {
    return "kernel";
  }
  if (["text", "image"].includes(options.toolMode)) {
    return "free-annotation";
  }
  if (options.hitPage) return "page-preview";
  if (options.hitAnnotation) return "free-annotation";
  return "page-preview";
}

export function getAnnotationsFromCanvasState(
  state: CanvasState,
): Record<string, CanvasFreeNode> {
  return state.layers?.annotations?.nodes ?? state.nodes ?? {};
}

export function withCanvasAnnotationNodes(
  state: CanvasState,
  nodes: Record<string, CanvasFreeNode>,
): CanvasState {
  return {
    ...state,
    nodes,
    layers: {
      ...state.layers,
      annotations: {
        ...state.layers?.annotations,
        nodes,
      },
    },
  };
}

export function normalizeCanvasStateLayers(state: CanvasState): CanvasState {
  const annotationNodes = getAnnotationsFromCanvasState(state);
  const documents = Object.fromEntries(
    Object.entries(annotationNodes).filter(
      (entry): entry is [string, Extract<CanvasFreeNode, { kind: "document" }>] =>
        entry[1].kind === "document",
    ),
  );
  const layers: CanvasLayersState = {
    ...state.layers,
    annotations: {
      ...state.layers?.annotations,
      nodes: annotationNodes,
    },
    documents: {
      ...state.layers?.documents,
      nodes: documents,
    },
  };
  return {
    ...state,
    nodes: annotationNodes,
    layers,
  };
}

function rectsIntersect(a: CanvasPageLayout, b: CanvasPageLayout): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function findRelatedPageIds(
  layout: CanvasPageLayout,
  pages: Record<string, CanvasPageLayout>,
): string[] {
  return Object.entries(pages)
    .filter(([, pageLayout]) => rectsIntersect(layout, pageLayout))
    .map(([pageId]) => pageId);
}

export function summarizeCanvasTextNodes(
  state: CanvasState,
  options: {
    maxNodes?: number;
    maxTextLength?: number;
  } = {},
): CanvasTextNodeSummary[] {
  const maxNodes = options.maxNodes ?? 20;
  const maxTextLength = options.maxTextLength ?? 500;
  return Object.values(getAnnotationsFromCanvasState(state))
    .filter((node) => node.kind === "text")
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .slice(0, maxNodes)
    .map((node) => {
      const truncated = node.text.length > maxTextLength;
      return {
        id: node.id,
        title: node.title,
        text: truncated ? `${node.text.slice(0, maxTextLength)}...` : node.text,
        layout: node.layout,
        relatedPageIds: findRelatedPageIds(node.layout, state.pages),
        updatedAt: node.updatedAt,
        truncated,
      };
    });
}
