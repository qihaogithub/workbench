import type { ReactNode } from "react";

import type { IframePreviewFrameProps } from "./IframePreviewFrame";
import type { PrototypePagePreviewProps } from "./PrototypePagePreview";
import type { SketchPagePreviewProps } from "./SketchPagePreview";
import type {
  CanvasInteractionMode,
  CanvasPageData,
  CanvasPageRuntimeType,
  CanvasState,
  PreviewCanvasProps,
  PreviewMode,
  PreviewPanelProps,
  PreviewSize,
} from "./types";

export interface PreviewStagePage extends CanvasPageData {
  runtimeType: CanvasPageRuntimeType;
  schema?: string;
  fallbackPreviewSize?: PreviewSize;
}

export interface SinglePageRendererProps {
  iframe?: Omit<
    IframePreviewFrameProps,
    "src" | "title" | "previewSize" | "configData"
  >;
  prototype?: Omit<
    PrototypePagePreviewProps,
    "html" | "css" | "previewSize" | "configData"
  >;
  sketch?: Omit<
    SketchPagePreviewProps,
    "scene" | "previewSize" | "configData"
  >;
  highFidelity?: Omit<
    PreviewPanelProps,
    "code" | "compiledJsUrl" | "previewSize" | "configData"
  >;
}

export interface SinglePagePreviewProps {
  page?: PreviewStagePage;
  rendererProps?: SinglePageRendererProps;
  emptyState?: ReactNode;
  className?: string;
  onBackgroundClick?: () => void;
}

export interface PreviewStageRenderContext {
  activePage?: PreviewStagePage;
  resolvedPreviewSize?: PreviewSize;
  defaultContent: ReactNode;
}

export interface PreviewStageProps {
  pages: PreviewStagePage[];
  activePageId?: string;
  onActivePageChange: (pageId: string) => void;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
  interactionMode: CanvasInteractionMode;
  singlePageProps?: Omit<SinglePagePreviewProps, "page">;
  canvasProps?: Omit<
    PreviewCanvasProps,
    | "pages"
    | "canvasState"
    | "onCanvasStateChange"
    | "interactionMode"
    | "activePageId"
  >;
  showToolbar?: boolean;
  showDefaultPageSelector?: boolean;
  selectorSlot?: ReactNode;
  toolbarCenter?: ReactNode;
  toolbarTrailing?: ReactNode;
  renderSingleContent?: (
    context: PreviewStageRenderContext,
  ) => ReactNode | undefined;
  className?: string;
}

