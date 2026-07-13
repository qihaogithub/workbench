import type {
  DemoPageMeta,
} from "@workbench/shared/contracts";
import type {
  SketchPatchVersionSummary,
  AssetCreatedBy,
  AssetSourceType,
} from "./types.js";

export interface ResourceBlobMap {
  code?: string;
  schema?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: string;
  sketchScene?: string;
  sketchMeta?: string;
  markdown?: string;
}

export interface ProjectImageManifestEntry {
  id: string;
  filename: string;
  url: string;
  size: number;
  format: string;
  createdAt: number;
  createdBy: AssetCreatedBy;
  contentHash?: string;
  mimeType?: string;
  originalUrl?: string;
  sourceType?: AssetSourceType;
}

export interface ProjectImageManifest {
  images: ProjectImageManifestEntry[];
}

export interface PageResourceMetadata extends Record<string, unknown> {
  page: DemoPageMeta;
  files: ResourceBlobMap;
  sketchPatchSummary?: SketchPatchVersionSummary;
}

export interface KnowledgeItemMeta {
  id: string;
  title: string;
  source: "system" | "user";
  description: string;
  fileName: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
  category?: string;
  tags?: string[];
  aiSummary?: string;
  aiKeywords?: string[];
  summaryStatus?: "ready" | "stale" | "failed";
  readonly?: boolean;
}

export interface KnowledgeManifest {
  version: number;
  items: KnowledgeItemMeta[];
}

export interface KnowledgeResourceMetadata extends Record<string, unknown> {
  item: KnowledgeItemMeta;
  files: ResourceBlobMap;
}
