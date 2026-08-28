import type { ReactNode } from "react";

import type { IframePreviewFrameProps } from "./IframePreviewFrame";
import type { PrototypePagePreviewProps } from "./PrototypePagePreview";
import type { SketchPagePreviewProps } from "./SketchPagePreview";
import type { SandboxedHtmlFrameProps } from "./SandboxedHtmlFrame";
import type {
  CanvasNavigationHotspot,
  CanvasNavigationConnection,
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
  /** 交互 HTML 的受控执行入口；不得使用 sandboxHtml 作为 iframe src。 */
  sandboxExecutionUrl?: string;
  sandboxChannelId?: string;
  sandboxHtml?: string;
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
  sandbox?: Omit<
    SandboxedHtmlFrameProps,
    "executionUrl" | "channelId" | "title" | "previewSize"
  >;
}

export interface SinglePagePreviewProps {
  page?: PreviewStagePage;
  rendererProps?: SinglePageRendererProps;
  emptyState?: ReactNode;
  className?: string;
  onBackgroundClick?: () => void;
  navigationPages?: CanvasPageData[];
  navigationHotspots?: CanvasNavigationHotspot[];
  navigationConnections?: CanvasNavigationConnection[];
  navigationEditable?: boolean;
  onCreateNavigation?: (
    pageId: string,
    rect: CanvasNavigationHotspot["rect"],
    targetPageId: string,
    kind: CanvasNavigationHotspot["kind"],
  ) => void;
  onUpdateNavigationHotspot?: (
    hotspotId: string,
    rect: CanvasNavigationHotspot["rect"],
  ) => void;
  onUpdateNavigationTarget?: (hotspotId: string, targetPageId: string) => void;
  onDeleteNavigationHotspot?: (hotspotId: string) => void;
  /** 单页面预览区粘贴 HTML 代码时触发，由宿主复用 HTML 导入链路。 */
  onRequestPasteHtmlContent?: (html: string) => void | Promise<void>;
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
  /** 单页模式按 ← 时调用；未提供时按页面排序切换到上一页。 */
  onSinglePagePrevious?: () => void;
  /** 单页模式按 → 时调用；未提供时按页面排序切换到下一页。 */
  onSinglePageNext?: () => void;
  renderSingleContent?: (
    context: PreviewStageRenderContext,
  ) => ReactNode | undefined;
  className?: string;
}
