export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

export function extractPreviewSize(schemaStr: string): PreviewSize | undefined {
  try {
    const schema = JSON.parse(schemaStr);
    if (schema.$demo?.previewSize) {
      return schema.$demo.previewSize;
    }
  } catch {}
  return undefined;
}
