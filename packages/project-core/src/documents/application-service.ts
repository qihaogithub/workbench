import type { ProjectAdminActor } from "../types.js";
import { DocumentApplicationError } from "./errors.js";
import { DocumentPolicy } from "./policy.js";
import type {
  DocumentCreateInput,
  DocumentDeleteInput,
  DocumentPolicyPort,
  DocumentRepositoryPort,
  DocumentRestoreInput,
  DocumentRevisionPort,
  DocumentUpdateInput,
  DocumentWriteContext,
} from "./types.js";
import type { DocumentDeleteResult, DocumentListResult, DocumentLocator, DocumentRevisionDetail, DocumentRevisionSummary, DocumentSnapshot, DocumentWriteResult } from "@workbench/shared/document";

function stripStorage(record: import("./types.js").DocumentRecord): DocumentSnapshot {
  const snapshot = { ...record } as DocumentSnapshot & Record<string, unknown>;
  delete snapshot.storageFileName;
  delete snapshot.storageWorkspacePath;
  delete snapshot.authorityRevision;
  delete snapshot.authorityRootHash;
  return snapshot;
}

export class DocumentApplicationService {
  constructor(
    private readonly repository: DocumentRepositoryPort,
    private readonly revisions?: DocumentRevisionPort,
    private readonly policy: DocumentPolicyPort = new DocumentPolicy(),
  ) {}

  async list(projectId: string, actor: ProjectAdminActor, context?: DocumentWriteContext): Promise<DocumentListResult> {
    this.assertRead(actor, projectId);
    const result = await this.repository.list(projectId, context);
    return {
      items: result.items.map(stripListStorage),
      issues: result.issues.map(stripIssueStorage),
    };
  }

  async get(locator: DocumentLocator, actor: ProjectAdminActor, context?: DocumentWriteContext): Promise<DocumentSnapshot> {
    this.assertRead(actor, locator.projectId);
    const record = await this.repository.get(locator, context);
    if (!record) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档不存在" });
    return stripStorage(record);
  }

  async create(input: DocumentCreateInput): Promise<DocumentWriteResult> {
    this.assertWrite(input.actor, input.projectId);
    const record = await this.repository.create(input);
    return this.writeResult(input.actor, { projectId: input.projectId, documentId: record.documentId }, record);
  }

  async update(input: DocumentUpdateInput): Promise<DocumentWriteResult> {
    this.assertWrite(input.actor, input.locator.projectId);
    const current = await this.repository.get(input.locator, input);
    if (!current) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档不存在" });
    if (!this.policy.canMutateDocument(input.actor, current)) throw new DocumentApplicationError({ code: current.readonly || current.source === "system" ? "DOCUMENT_READONLY" : "DOCUMENT_FORBIDDEN", message: "当前操作者不能修改此文档" });
    const record = await this.repository.update(input);
    return this.writeResult(input.actor, input.locator, record);
  }

  async remove(input: DocumentDeleteInput): Promise<DocumentDeleteResult> {
    this.assertWrite(input.actor, input.locator.projectId);
    const current = await this.repository.getMetadata(input.locator, input);
    if (!current) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档不存在" });
    if (!this.policy.canMutateDocument(input.actor, current)) throw new DocumentApplicationError({ code: "DOCUMENT_READONLY", message: "系统只读文档不能删除" });
    const removed = await this.repository.remove(input);
    let resourceVersionId: string | undefined;
    if (removed.record) {
      try {
        resourceVersionId = await this.revisions?.record({ locator: input.locator, record: removed.record, actor: input.actor, note: "delete_document", tombstone: true });
      } catch {
        // The Authority deletion is durable; version materialization remains a
        // derived concern and can be reconciled independently.
      }
    }
    return {
      deleted: "code" in removed.deleted ? stripIssueStorage(removed.deleted) : stripListStorage(removed.deleted),
      ...(removed.authorityRevision === undefined || removed.authorityRootHash === undefined ? {} : { authority: { revision: removed.authorityRevision, rootHash: removed.authorityRootHash } }),
      ...(resourceVersionId ? { resourceVersionId } : {}),
    };
  }

  async listRevisions(locator: DocumentLocator, actor: ProjectAdminActor): Promise<readonly DocumentRevisionSummary[]> {
    this.assertRead(actor, locator.projectId);
    return this.revisions?.list(locator, actor) ?? [];
  }

  async getRevision(locator: DocumentLocator, revisionId: string, actor: ProjectAdminActor): Promise<DocumentRevisionDetail> {
    this.assertRead(actor, locator.projectId);
    const revision = await this.revisions?.get(locator, revisionId, actor);
    if (!revision) throw new DocumentApplicationError({ code: "DOCUMENT_VERSION_NOT_FOUND", message: "文档版本不存在" });
    return revision;
  }

  async restore(input: DocumentRestoreInput): Promise<DocumentWriteResult> {
    this.assertWrite(input.actor, input.locator.projectId);
    const revision = await this.revisions?.get(input.locator, input.revisionId, input.actor);
    if (!revision) throw new DocumentApplicationError({ code: "DOCUMENT_VERSION_NOT_FOUND", message: "文档版本不存在" });
    const record = await this.repository.restore(input, revision);
    return this.writeResult(input.actor, input.locator, record, "restore_document", false, "restore");
  }

  private async writeResult(actor: ProjectAdminActor, locator: DocumentLocator, record: import("./types.js").DocumentRecord, note?: string, tombstone = false, source?: "user" | "ai" | "import" | "restore" | "publish" | "system"): Promise<DocumentWriteResult> {
    let resourceVersionId: string | undefined;
    try {
      resourceVersionId = await this.revisions?.record({ locator, record, actor, note, tombstone, source });
    } catch {
      // The document write is already durable. Version projection is a derived
      // concern and can be repaired by the existing reconcile/materialization
      // flow without turning a successful write into a 500 response.
    }
    return { snapshot: stripStorage(record), ...(record.authorityRevision === undefined || record.authorityRootHash === undefined ? {} : { authority: { revision: record.authorityRevision, rootHash: record.authorityRootHash } }), ...(resourceVersionId ? { resourceVersionId } : {}) };
  }

  private assertRead(actor: ProjectAdminActor, projectId: string): void {
    if (!this.policy.canRead(actor, projectId)) throw new DocumentApplicationError({ code: "DOCUMENT_FORBIDDEN", message: "当前操作者无权访问该项目" });
  }

  private assertWrite(actor: ProjectAdminActor, projectId: string): void {
    if (!this.policy.canWrite(actor, projectId)) throw new DocumentApplicationError({ code: "DOCUMENT_FORBIDDEN", message: "当前操作者没有文档写权限" });
  }
}

function stripListStorage(record: import("./types.js").DocumentListRecord): import("@workbench/shared/document").DocumentListItem {
  const item = { ...record } as import("@workbench/shared/document").DocumentListItem & Record<string, unknown>;
  delete item.storageFileName;
  delete item.storageWorkspacePath;
  return item;
}

function stripIssueStorage(record: import("./types.js").DocumentListIssueRecord): import("@workbench/shared/document").DocumentListIssue {
  const issue = { ...record } as import("@workbench/shared/document").DocumentListIssue & Record<string, unknown>;
  delete issue.storageFileName;
  delete issue.storageWorkspacePath;
  delete issue.source;
  delete issue.readonly;
  return issue;
}
