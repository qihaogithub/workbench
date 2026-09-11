import type {
  DocumentErrorCode,
  DocumentDeleteResult,
  DocumentListItem,
  DocumentListIssue,
  DocumentListResult,
  DocumentLocator,
  DocumentRevisionDetail,
  DocumentRevisionSummary,
  DocumentSnapshot,
  DocumentWriteResult,
} from "@workbench/shared/document";
import type { WorkspaceRevision } from "@workbench/shared";
import type { ProjectAdminActor } from "../types.js";

export type {
  DocumentErrorCode,
  DocumentDeleteResult,
  DocumentListItem,
  DocumentListIssue,
  DocumentListResult,
  DocumentLocator,
  DocumentRevisionDetail,
  DocumentRevisionSummary,
  DocumentSnapshot,
  DocumentWriteResult,
};

export interface DocumentWriteContext {
  /** Resolved server-side workspace context; never accepted from a public DTO. */
  workspacePath?: string;
  workspaceId?: string;
  sessionId?: string;
  baseRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
}

export interface DocumentCreateInput extends DocumentWriteContext {
  projectId: string;
  title: string;
  description?: string;
  content: string;
  actor: ProjectAdminActor;
}

export interface DocumentUpdateInput extends DocumentWriteContext {
  locator: DocumentLocator;
  title?: string;
  description?: string;
  content?: string;
  actor: ProjectAdminActor;
}

export interface DocumentDeleteInput extends DocumentWriteContext {
  locator: DocumentLocator;
  actor: ProjectAdminActor;
}

export interface DocumentRestoreInput extends DocumentWriteContext {
  locator: DocumentLocator;
  revisionId: string;
  actor: ProjectAdminActor;
}

export interface DocumentRecord extends DocumentSnapshot {
  /** Internal materialization key. It must never cross the application API. */
  storageFileName: string;
  storageWorkspacePath: string;
  authorityRevision?: WorkspaceRevision;
  authorityRootHash?: string;
}

export interface DocumentListRecord extends DocumentListItem {
  storageFileName: string;
  storageWorkspacePath: string;
}

export interface DocumentListIssueRecord extends DocumentListIssue {
  storageFileName: string;
  storageWorkspacePath: string;
  source: "user";
  readonly?: boolean;
}

export interface DocumentRepositoryListResult {
  items: DocumentListRecord[];
  issues: DocumentListIssueRecord[];
}

export interface DocumentRepositoryDeleteResult {
  deleted: DocumentListRecord | DocumentListIssueRecord;
  record?: DocumentRecord;
  authorityRevision?: WorkspaceRevision;
  authorityRootHash?: string;
}

export interface DocumentRepositoryPort {
  list(projectId: string, context?: DocumentWriteContext): Promise<DocumentRepositoryListResult> | DocumentRepositoryListResult;
  getMetadata(locator: DocumentLocator, context?: DocumentWriteContext): Promise<DocumentListRecord | DocumentListIssueRecord | null> | DocumentListRecord | DocumentListIssueRecord | null;
  get(locator: DocumentLocator, context?: DocumentWriteContext): Promise<DocumentRecord | null> | DocumentRecord | null;
  create(input: DocumentCreateInput): Promise<DocumentRecord> | DocumentRecord;
  update(input: DocumentUpdateInput): Promise<DocumentRecord> | DocumentRecord;
  remove(input: DocumentDeleteInput): Promise<DocumentRepositoryDeleteResult> | DocumentRepositoryDeleteResult;
  restore(input: DocumentRestoreInput, revision: DocumentRevisionDetail): Promise<DocumentRecord> | DocumentRecord;
}

export interface DocumentAuthorityPort {
  commit(input: {
    projectId: string;
    workspaceId: string;
    sessionId: string;
    baseRevision: WorkspaceRevision;
    reason: string;
    operations: import("@workbench/shared/contracts").WorkspaceMutationOperation[];
  }): Promise<{
    revision: WorkspaceRevision;
    rootHash: string;
  }>;
}

export interface DocumentRevisionPort {
  list(locator: DocumentLocator, actor: ProjectAdminActor): Promise<readonly DocumentRevisionSummary[]> | readonly DocumentRevisionSummary[];
  get(locator: DocumentLocator, revisionId: string, actor: ProjectAdminActor): Promise<DocumentRevisionDetail | null> | DocumentRevisionDetail | null;
  record(input: {
    locator: DocumentLocator;
    record: DocumentRecord;
    actor: ProjectAdminActor;
    source?: "user" | "ai" | "import" | "restore" | "publish" | "system";
    note?: string;
    tombstone?: boolean;
  }): Promise<string | undefined> | string | undefined;
}

export interface DocumentPolicyPort {
  canRead(actor: ProjectAdminActor, projectId: string): boolean;
  canWrite(actor: ProjectAdminActor, projectId: string): boolean;
  canMutateDocument(actor: ProjectAdminActor, record: Pick<DocumentRecord, "projectId" | "source" | "readonly">): boolean;
}
