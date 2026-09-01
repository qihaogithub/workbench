export { DocumentApplicationService } from "./application-service.js";
export { DocumentApplicationError, isDocumentApplicationError } from "./errors.js";
export { DocumentPolicy } from "./policy.js";
export { ResourceVersionDocumentAdapter } from "./resource-version-adapter.js";
export { WorkspaceDocumentRepository } from "./workspace-document-repository.js";
export type * from "./types.js";

import { ProjectAdminService } from "../service.js";
import { DocumentApplicationService } from "./application-service.js";
import { ResourceVersionDocumentAdapter } from "./resource-version-adapter.js";
import { WorkspaceDocumentRepository } from "./workspace-document-repository.js";
import type { DocumentAuthorityPort, DocumentRevisionPort } from "./types.js";

/** Build the default logical document boundary for a project-core consumer. */
export function createDocumentApplicationService(options: {
  dataDir: string;
  authority?: DocumentAuthorityPort;
  revisions?: DocumentRevisionPort;
}): DocumentApplicationService {
  const projectService = new ProjectAdminService({ dataDir: options.dataDir });
  return new DocumentApplicationService(
    new WorkspaceDocumentRepository({ dataDir: options.dataDir, authority: options.authority }),
    options.revisions ?? new ResourceVersionDocumentAdapter(projectService),
  );
}
