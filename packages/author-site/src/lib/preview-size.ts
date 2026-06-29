import {
  getPreviewSize,
  type PreviewSize,
} from "@opencode-workbench/demo-ui";

export type { PreviewSize };

export function extractPreviewSize(schemaStr: string): PreviewSize | undefined {
  return getPreviewSize(schemaStr);
}
