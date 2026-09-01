import type { ProjectAdminActor } from "../types.js";
import { ProjectAdminService } from "../service.js";
import type { DocumentRecord, DocumentRevisionDetail, DocumentRevisionPort, DocumentRevisionSummary } from "./types.js";

export class ResourceVersionDocumentAdapter implements DocumentRevisionPort {
  constructor(private readonly service: ProjectAdminService) {}

  list(locator: { projectId: string; documentId: string }, actor: ProjectAdminActor): readonly DocumentRevisionSummary[] {
    const result = this.service.resourceVersionList({ projectId: locator.projectId, kind: "knowledge_document", resourceId: locator.documentId }, actor);
    if (!result.ok || !result.data) return [];
    return result.data.versions.map((version) => ({ id: version.id, projectId: version.projectId, documentId: version.resourceId, contentHash: version.contentHash, createdAt: version.createdAt, createdBy: version.createdBy, source: version.source, note: version.note }));
  }

  get(locator: { projectId: string; documentId: string }, revisionId: string, actor: ProjectAdminActor): DocumentRevisionDetail | null {
    const result = this.service.resourceVersionGet({ projectId: locator.projectId, kind: "knowledge_document", resourceId: locator.documentId, versionId: revisionId }, actor);
    if (!result.ok || !result.data || typeof result.data.content !== "object" || result.data.content === null) return null;
    const payload = result.data.content as { content?: unknown; item?: { title?: unknown; description?: unknown } };
    if (typeof payload.content !== "string") return null;
    return { id: result.data.version.id, projectId: locator.projectId, documentId: locator.documentId, contentHash: result.data.version.contentHash, createdAt: result.data.version.createdAt, createdBy: result.data.version.createdBy, source: result.data.version.source, note: result.data.version.note, content: payload.content, ...(typeof payload.item?.title === "string" ? { title: payload.item.title } : {}), ...(typeof payload.item?.description === "string" ? { description: payload.item.description } : {}), ...(result.data.version.restoredFromVersionId ? { restoredFromVersionId: result.data.version.restoredFromVersionId } : {}) };
  }

  record(input: { locator: { projectId: string; documentId: string }; record: DocumentRecord; actor: ProjectAdminActor; source?: "user" | "ai" | "import" | "restore" | "publish" | "system"; note?: string; tombstone?: boolean }): string | undefined {
    if (input.tombstone) {
      const result = this.service.resourceVersionCreateKnowledgeTombstone({
        projectId: input.locator.projectId,
        resourceId: input.locator.documentId,
        item: {
          id: input.record.documentId,
          title: input.record.title,
          source: input.record.source,
          description: input.record.description,
          fileName: input.record.storageFileName,
          addedAt: input.record.addedAt ?? input.record.updatedAt,
          updatedAt: input.record.updatedAt,
          sizeBytes: input.record.sizeBytes,
          ...(input.record.readonly ? { readonly: true } : {}),
        },
        content: input.record.content,
        note: input.note,
        source: input.source ?? "user",
      }, input.actor);
      return result.ok ? result.data?.id : undefined;
    }
    const result = this.service.resourceVersionCreate({ projectId: input.locator.projectId, kind: "knowledge_document", resourceId: input.locator.documentId, sourceWorkspacePath: input.record.storageWorkspacePath, source: input.source ?? "user", note: input.note }, input.actor);
    return result.ok ? result.data?.id : undefined;
  }
}
