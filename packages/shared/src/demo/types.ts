import type { ConsoleLogPayload } from "./iframe-types";

export type { IframeOutMessageType, IframeInMessageType, ConsoleLogPayload } from "./iframe-types";

export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

export interface DemoMeta {
  previewSize?: PreviewSize;
  orderable?: string[];
  [key: string]: unknown;
}

export interface DemoSchema extends Record<string, unknown> {
  $demo?: DemoMeta;
  $schema?: string;
  title?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface PreviewPanelProps {
  code?: string;
  sessionId?: string;
  demoId?: string;
  compiledJsUrl?: string;
  cssImports?: string[];
  configData?: Record<string, unknown>;
  sdkFiles?: Record<string, string>;
  onError?: (error: Error) => void;
  previewSize?: PreviewSize;
  fillContainer?: boolean;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
}

export interface ConfigFormProps {
  schema: string;
  onChange: (data: Record<string, unknown>) => void;
  onSchemaChange?: (schema: string) => void;
  initialData?: Record<string, unknown>;
  readonly?: boolean;
  className?: string;
  sessionId?: string;
}

export type PreviewMode = "single" | "canvas";

/** 画布工具模式：hand=拖动工具（仅平移画布），select=选择工具（可移动/缩放页面） */
export type CanvasToolMode = "hand" | "select";

export interface CanvasPageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface CanvasViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasState {
  pages: Record<string, CanvasPageLayout>;
  viewport: CanvasViewportState;
}

export interface CanvasPageData {
  id: string;
  name: string;
  code?: string;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  order: number;
}

export interface AlignmentGuide {
  /** 辅助线类型 */
  type: "vertical" | "horizontal";
  /** 辅助线位置（画布坐标） */
  position: number;
  /** 辅助线范围起点 */
  start: number;
  /** 辅助线范围终点 */
  end: number;
}

export interface AlignmentResult {
  /** 吸附后的布局 */
  layout: CanvasPageLayout;
  /** 是否有吸附发生 */
  snapped: boolean;
  /** 对齐辅助线列表 */
  guides: AlignmentGuide[];
}

export interface DragState {
  pageId: string;
  layout: CanvasPageLayout;
  edge?: ResizeEdge;
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface PreviewCanvasProps {
  editable?: boolean;
  sessionId?: string;
  projectId?: string;
  pages: CanvasPageData[];
  activePageId?: string;
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
  onPageConfigEdit?: (pageId: string) => void;
  onCanvasClick?: () => void;
  className?: string;
  editingPageId?: string;
  screenshotUrls?: Record<string, string>;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  focusPageId?: string;
}

export interface PreviewState {
  mode: PreviewMode;
  activePageId: string;
}


