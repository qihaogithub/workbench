/** The entities that can be addressed by a user-visible Workbench link. */
export type MarkdownReferenceDocumentKind = "knowledge" | "memory" | "project-convention" | "page-convention" | "design-spec";
export type MarkdownReferenceTarget =
  | { kind: "project"; projectId: string }
  | { kind: "page"; projectId: string; pageId: string }
  | { kind: "config"; projectId: string; pageId: string; fieldPath: string }
  | { kind: "document"; projectId: string; docId: string; documentKind?: MarkdownReferenceDocumentKind };

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

export interface ReferencePolicy {
  allowedTargetKinds: MarkdownReferenceTarget["kind"][];
  sameProjectOnly: boolean;
  publishedOnly?: boolean;
  allowUnresolved?: boolean;
  allowCreate?: boolean;
}

export interface MarkdownReferenceCandidate {
  label?: string;
  hierarchy?: Array<{ id: string; label: string; kind: "folder" | "page" | "config" | "group" }>;
  documentGroup?: string;
  target: MarkdownReferenceTarget;
  displayPath: string;
  aliases?: string[];
  score?: number;
}

export interface ParsedMarkdownReference {
  target: MarkdownReferenceTarget;
  labelSnapshot: string;
  syntaxVersion: 1;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface ParsedLegacyConfigReference {
  key: string;
  name: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface ParsedMarkdownLink {
  label: string;
  destination: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export type MarkdownReferenceDiagnosticCode =
  | "malformed-wb-uri"
  | "unknown-target-kind"
  | "missing-target-id"
  | "unterminated-link";

export interface MarkdownReferenceDiagnostic {
  code: MarkdownReferenceDiagnosticCode;
  message: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface MarkdownReferenceParseResult {
  references: ParsedMarkdownReference[];
  legacyConfigRefs: ParsedLegacyConfigReference[];
  links: ParsedMarkdownLink[];
  diagnostics: MarkdownReferenceDiagnostic[];
}
