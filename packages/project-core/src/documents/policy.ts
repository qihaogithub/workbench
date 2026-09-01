import type { ProjectAdminActor } from "../types.js";
import type { DocumentPolicyPort, DocumentRecord } from "./types.js";

export class DocumentPolicy implements DocumentPolicyPort {
  canRead(actor: ProjectAdminActor, projectId: string): boolean {
    return !actor.allowedProjectIds || actor.allowedProjectIds.includes(projectId);
  }

  canWrite(actor: ProjectAdminActor, projectId: string): boolean {
    return actor.role !== "readonly" && this.canRead(actor, projectId);
  }

  canMutateDocument(actor: ProjectAdminActor, record: DocumentRecord): boolean {
    return !record.readonly && record.source !== "system" && actor.role !== "readonly";
  }
}
