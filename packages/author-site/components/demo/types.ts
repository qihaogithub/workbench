export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

// 新增：config.schema.json 中的元数据扩展字段
export interface DemoMeta {
  previewSize?: PreviewSize;
  orderable?: string[];
  [key: string]: unknown;
}

// 新增：JSON Schema 根级别扩展
export interface DemoSchema extends Record<string, unknown> {
  $demo?: DemoMeta;
  $schema?: string;
  title?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface PreviewPanelProps {
  code?: string; // 编译前的原始代码（兼容旧模式）
  sessionId?: string; // 优先：从 session 读取草稿代码
  demoId?: string; // 多页面模式下指定要编译的页面
  configData?: Record<string, unknown>;
  sdkFiles?: Record<string, string>;
  onError?: (error: Error) => void;
  previewSize?: PreviewSize;
  snapshotVersion?: number; // 快照版本号，递增以强制重新编译和配置重建
  /** @deprecated Use snapshotVersion instead */
  compileVersion?: number;
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
}
