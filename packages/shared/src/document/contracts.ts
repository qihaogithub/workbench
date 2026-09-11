import type { WorkspaceRevision } from "../workspace";

/** Stable identity for a user knowledge document. Physical workspace paths are
 * deliberately not part of this contract. */
export interface DocumentLocator {
  projectId: string;
  documentId: string;
}

export type DocumentSource = "user" | "system";

export interface DocumentSnapshot extends DocumentLocator {
  title: string;
  description: string;
  content: string;
  addedAt?: string;
  updatedAt: string;
  contentHash: string;
  source: DocumentSource;
  readonly?: boolean;
  sizeBytes: number;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
}

/** Lightweight list response; content and its hash are omitted so list calls
 * never need to read every document body. */
export type DocumentListItem = Omit<DocumentSnapshot, "content" | "contentHash"> & {
  sourceState: "active";
};

export interface DocumentListIssue extends DocumentLocator {
  code: "source_missing";
  title: string;
  sourceState: "missing";
  repairable: true;
}

export interface DocumentListResult {
  items: DocumentListItem[];
  issues: DocumentListIssue[];
}

export interface DocumentWriteResult {
  snapshot: DocumentSnapshot;
  authority?: {
    revision: WorkspaceRevision;
    rootHash: string;
  };
  resourceVersionId?: string;
}

export interface DocumentDeleteResult {
  deleted: DocumentListItem | DocumentListIssue;
  authority?: {
    revision: WorkspaceRevision;
    rootHash: string;
  };
  resourceVersionId?: string;
}

export interface DocumentRevisionSummary {
  id: string;
  projectId: string;
  documentId: string;
  contentHash: string;
  createdAt: number;
  createdBy: string;
  source: "user" | "ai" | "import" | "restore" | "publish" | "system";
  note?: string;
}

export interface DocumentRevisionDetail extends DocumentRevisionSummary {
  content: string;
  title?: string;
  description?: string;
  restoredFromVersionId?: string;
}

export type DocumentErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_ALREADY_EXISTS"
  | "DOCUMENT_FORBIDDEN"
  | "DOCUMENT_READONLY"
  | "DOCUMENT_CONFLICT"
  | "DOCUMENT_INVALID"
  | "DOCUMENT_AUTHORITY_NOT_READY"
  | "DOCUMENT_AUTHORITY_BACKUP_MISSING"
  | "DOCUMENT_AUTHORITY_CONFLICT"
  | "DOCUMENT_VERSION_NOT_FOUND"
  | "DOCUMENT_VERSION_SNAPSHOT_MISSING"
  | "DOCUMENT_UNSUPPORTED_OPERATION";

export interface DocumentErrorShape {
  code: DocumentErrorCode;
  message: string;
  details?: unknown;
  recoverable?: boolean;
}

export interface DocumentApiSuccess<T> {
  success: true;
  data: T;
}

export interface DocumentApiFailure {
  success: false;
  error: DocumentErrorShape;
}

export type DocumentApiResponse<T> = DocumentApiSuccess<T> | DocumentApiFailure;
