import type { Extension, onAuthenticatePayload } from "@hocuspocus/server";

import { decodeDocumentName } from "../document-name";
import type { WorkspaceFilePersistence } from "../workspace-file-persistence";

/**
 * Context attached to each authenticated connection.
 * Carries the validation result so downstream hooks (onLoadDocument,
 * onStoreDocument) don't need to re-run session validation.
 */
export interface CollabConnectionContext {
  ok: true;
  projectId: string;
  workspaceId: string;
  sessionId: string;
  resourcePath: string;
  kind: string;
  userId?: string;
  username?: string;
  workspacePath: string;
}

/**
 * SessionAuthExtension
 *
 * Replaces the `validateSession` call that used to happen inside
 * `CollabRoomManager.handleConnection`. Runs on every new WebSocket
 * connection before the document is loaded.
 *
 * - documentName encodes {projectId, workspaceId, resourcePath, kind}
 * - token carries the sessionId
 *
 * On failure, throws to reject the connection (Hocuspocus closes the
 * socket with code 1008). On success, returns the context object that
 * will be attached to the connection and made available to all later
 * hooks via `data.context`.
 */
export class SessionAuthExtension implements Extension {
  priority = 1000;

  constructor(private readonly persistence: WorkspaceFilePersistence) {}

  async onAuthenticate(
    data: onAuthenticatePayload,
  ): Promise<CollabConnectionContext> {
    const descriptor = decodeDocumentName(data.documentName);
    if (!descriptor) {
      throw new Error("INVALID_DOCUMENT_NAME");
    }

    const sessionId = data.token;
    if (!sessionId) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const validation = this.persistence.validateSession({
      projectId: descriptor.projectId,
      workspaceId: descriptor.workspaceId,
      sessionId,
      resourcePath: descriptor.resourcePath,
      kind: descriptor.kind,
    });

    if (!validation.ok || !validation.workspacePath) {
      throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    }

    return {
      ok: true,
      projectId: descriptor.projectId,
      workspaceId: descriptor.workspaceId,
      sessionId,
      resourcePath: descriptor.resourcePath,
      kind: descriptor.kind,
      userId: validation.userId,
      username: validation.username,
      workspacePath: validation.workspacePath,
    };
  }
}
