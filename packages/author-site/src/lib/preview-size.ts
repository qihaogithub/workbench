import {
  getPreviewSize,
  type PreviewSize,
} from "@workbench/demo-ui";

export type { PreviewSize };

export function extractPreviewSize(schemaStr: string): PreviewSize | undefined {
  return getPreviewSize(schemaStr);
}
