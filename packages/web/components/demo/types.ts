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
  code: string;
  configData: Record<string, unknown>;
  sdkFiles?: Record<string, string>;
  onError?: (error: Error) => void;
  className?: string;
  previewSize?: PreviewSize;
}

export interface ConfigFormProps {
  schema: string;
  onChange: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
  readonly?: boolean;
  className?: string;
}
