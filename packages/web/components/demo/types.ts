export interface PreviewPanelProps {
  code: string;
  configData: Record<string, unknown>;
  sdkFiles?: Record<string, string>;
  onError?: (error: Error) => void;
  className?: string;
}

export interface ConfigFormProps {
  schema: string;
  onChange: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
  readonly?: boolean;
  className?: string;
}
