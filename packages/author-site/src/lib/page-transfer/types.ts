import type {
  PageTransferMode,
  PageTransferPlacement,
  PageTransferResolution,
} from "@workbench/shared";

export interface PageTransferPrepareInput {
  sourceProjectId: string;
  sourcePageIds: string[];
  mode: PageTransferMode;
  targetFolderId?: string | null;
  placement?: PageTransferPlacement;
  pagePlacements?: Record<string, { x: number; y: number }>;
  idempotencyKey: string;
  sessionId?: string;
}

export interface PageTransferExecuteInput {
  sessionId?: string;
  resolutions?: PageTransferResolution[];
}
