import * as path from "path";

import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import type { UploadImageResult } from "./global-image-store";
import {
  addProjectImageManifestEntry,
  resolveProjectImageManifestProjectId,
  type ProjectImageEntry,
} from "./project-image-manifest";

/**
 * 将上传到全局图床的图片注册到项目图片清单（images.json）。
 * 只要能从 config 解析出 projectId 就登记，便于主 Agent 用 listImages 复查。
 */
export function registerGlobalImageToProject(
  config: AgentConfig,
  result: UploadImageResult,
  filename: string,
  extra: {
    createdBy?: "user" | "ai" | "figma" | "system";
    sourceType?: ProjectImageEntry["sourceType"];
    originalUrl?: string;
    alt?: string;
  } = {},
): void {
  const projectId = resolveProjectImageManifestProjectId(config);
  if (!projectId) return;

  const ext = path.extname(filename).slice(1).toLowerCase();
  const entry: ProjectImageEntry = {
    id: result.sha256.slice(0, 12),
    filename: result.filename,
    url: result.url,
    size: result.sizeBytes,
    format: ext,
    createdAt: Date.now(),
    createdBy: extra.createdBy ?? "ai",
    width: result.width,
    height: result.height,
    contentHash: result.sha256,
    mimeType: result.mimeType,
    originalUrl: extra.originalUrl,
    sourceType: extra.sourceType ?? "ai_generated",
    alt: extra.alt,
  };

  try {
    addProjectImageManifestEntry(projectId, entry);
  } catch (manifestError) {
    logger.warn(
      { projectId, error: manifestError, imageId: result.imageId },
      "image-store-register: failed to update project image manifest",
    );
  }
}