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

export type PreviewMode = "single" | "grid" | "canvas";

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
  gridColumns: 2 | 3 | 4;
}

export interface GridPageItem {
  id: string;
  name: string;
  order: number;
  previewSize?: PreviewSize;
  code?: string;
}

export interface GridIframeProps {
  sessionId?: string;
  page: GridPageItem;
  visible: boolean;
  hasChanges: boolean;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
}

export interface PreviewGridProps {
  sessionId?: string;
  demoPages: GridPageItem[];
  activePageId: string;
  gridColumns: 2 | 3 | 4;
  gridScale?: number;
  onGridScaleChange?: (scale: number) => void;
  onGridColumnsChange: (columns: 2 | 3 | 4) => void;
  onCardClick: (pageId: string) => void;
  changedPageIds?: Set<string>;
  configDataMap?: Record<string, Record<string, unknown>>;
  previewSize?: PreviewSize;
  flashCardId?: string;
  showToolbar?: boolean;
  showModeToggle?: boolean;
  onPreviewModeChange?: (mode: PreviewMode) => void;
  className?: string;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
}
