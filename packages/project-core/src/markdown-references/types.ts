import type { DemoPageMeta } from "@workbench/shared/contracts";
import type { KnowledgeItemMeta } from "../internal-types.js";

import type { MarkdownReferenceTarget, MarkdownReferenceCandidate as SharedCandidate } from "@workbench/shared/markdown-reference";
export type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";

export type MarkdownReferenceSource =
  | { kind: "knowledge-document"; projectId: string; workspaceId: string; docId: string }
  | { kind: "page-requirements"; projectId: string; workspaceId: string; pageId: string }
  | { kind: "workspace-memory"; projectId: string; workspaceId: string }
  | { kind: "project-convention"; projectId: string; workspaceId: string }
  | { kind: "page-convention"; projectId: string; workspaceId: string; pageId: string }
  | { kind: "design-spec-entry"; projectId: string; workspaceId: string; specId: string; entryId: string }
  | { kind: "config-note"; projectId: string; workspaceId: string; scope: "project" | "page"; pageId?: string; fieldKey: string }
  | { kind: "richtext-field"; projectId: string; workspaceId: string; scope: "project" | "page"; pageId?: string; fieldKey: string; jsonPointer: string }
  | { kind: "canvas-local-document"; projectId: string; workspaceId: string; nodeId: string };

export type ReferenceTargetState = "active" | "missing" | "deleted" | "forbidden";
export type ReferenceClientState = "resolved" | "unavailable";

export interface ResourceDirectoryEntry {
  hierarchy?: SharedCandidate["hierarchy"];
  documentGroup?: string;
  target: MarkdownReferenceTarget;
  label: string;
  displayPath: string;
  materializedPath?: string;
  aliases?: string[];
  state?: ReferenceTargetState;
}

export interface ResourceDirectorySnapshot {
  entries?: readonly ResourceDirectoryEntry[];
  project: { id: string; name: string };
  pages?: readonly DemoPageMeta[];
  documents?: readonly KnowledgeItemMeta[];
}

export interface ReferencePolicy {
  allowedTargetKinds?: readonly MarkdownReferenceTarget["kind"][];
  sameProjectOnly?: boolean;
  allowUnresolved?: boolean;
}

export interface MarkdownReferenceCandidate {
  hierarchy?: SharedCandidate["hierarchy"];
  documentGroup?: string;
  target: MarkdownReferenceTarget;
  label: string;
  displayPath: string;
  aliases: string[];
  score: number;
}

export interface ResolvedMarkdownReference {
  target: MarkdownReferenceTarget;
  labelSnapshot: string;
  currentLabel?: string;
  targetState: ReferenceTargetState;
  clientState: ReferenceClientState;
}

export interface MarkdownLinkRecord {
  source: MarkdownReferenceSource;
  target: MarkdownReferenceTarget;
  labelSnapshot: string;
  start: number;
  end: number;
  line: number;
  column: number;
  contentHash?: string;
  targetState: ReferenceTargetState;
}

export interface MarkdownIndexVersion {
  /** Project scope is explicit so one database can safely hold many graphs. */
  projectId?: string;
  workspaceId: string;
  authorityMutationId?: string;
  authorityRevision?: number;
  authorityRootHash?: string;
  generatedAt: number;
  parserVersion: string;
}

export type MarkdownIndexStatus = "ready" | "stale" | "rebuilding" | "unavailable";

export interface MarkdownLinkIndexSnapshot extends MarkdownIndexVersion {
  records: readonly MarkdownLinkRecord[];
}

export interface MarkdownReferenceSourceDocument {
  source: MarkdownReferenceSource;
  markdown: string;
  contentHash?: string;
}

export interface MarkdownReferenceSourceAdapter {
  readonly kind: MarkdownReferenceSource["kind"];
  list(snapshot: ResourceDirectorySnapshot & { workspaceId: string }): MarkdownReferenceSource[];
  read(source: MarkdownReferenceSource): MarkdownReferenceSourceDocument | null;
}
