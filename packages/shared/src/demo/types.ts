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
  snapshotVersion?: number;
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

export type PreviewMode = "single" | "grid";

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
  snapshotVersion?: number;
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
  snapshotVersion?: number;
  flashCardId?: string;
}
