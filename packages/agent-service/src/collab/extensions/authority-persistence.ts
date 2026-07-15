import type { Extension } from "@hocuspocus/server";
import * as Y from "yjs";

import type { CollabConnectionContext } from "./session-auth";
import type { WorkspaceFilePersistence } from "../workspace-file-persistence";
import { logger } from "../../utils/logger";

/**
 * AuthorityPersistenceExtension
 *
 * Replaces the persistence logic that used to live in
 * `CollabRoomManager.getOrCreateRoom` (initial content load) and
 * `CollabRoomManager.flushRoom` (debounced save).
 *
 * - `onLoadDocument`: reads the file from disk and seeds the Yjs text.
 * - `onStoreDocument`: reads the Yjs text and commits it to Authority via
 *   `persistence.commitResource()` (actor: "collab", reason: "collab_autosave").
 *
 * The Yjs room is the single content authority (Yjs-First architecture),
 * so non-collab writes must route through the Yjs doc via
 * `Hocuspocus.openDirectConnection().transact()` instead of bypassing it.
 */
export class AuthorityPersistenceExtension implements Extension {
  priority = 100;

  constructor(private readonly persistence: WorkspaceFilePersistence) {}

  /**
   * Seed the Yjs document with the current file content on first load.
   *
   * Runs once per document lifecycle (when the document is created in
   * memory, not on every connection). If the file does not exist yet
   * (new resource), the Yjs text stays empty until a client writes to it.
   */
  async onLoadDocument(data: {
    document: Y.Doc;
    context: CollabConnectionContext;
  }): Promise<void> {
    const ctx = data.context;
    if (!ctx?.ok) return;

    const text = data.document.getText("content");
    if (text.length > 0) return;

    const state = this.persistence.readResourceState(
      ctx.workspacePath,
      ctx.resourcePath,
      ctx.kind as never,
    );

    if (state.content) {
      text.insert(0, state.content);
    }
  }

  /**
   * Persist the Yjs text content to Authority.
   *
   * Called by Hocuspocus after the configured debounce window. Skips
   * no-op writes (file content unchanged) to avoid unnecessary mutation
   * events. Uses `baseRevision: 0` because the Yjs room is the single
   * authority and the Authority auto-adopts drift (Phase 2).
   */
  async onStoreDocument(data: {
    document: Y.Doc;
    lastContext: CollabConnectionContext | null;
  }): Promise<void> {
    const ctx = data.lastContext;
    if (!ctx?.ok) {
      return;
    }

    const text = data.document.getText("content");
    const roomContent = text.toString();

    const currentState = this.persistence.readResourceState(
      ctx.workspacePath,
      ctx.resourcePath,
      ctx.kind as never,
    );

    // Skip no-op writes — file already matches room content.
    if (currentState.content === roomContent) {
      return;
    }

    try {
      await this.persistence.commitResource({
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        resourcePath: ctx.resourcePath,
        kind: ctx.kind as never,
        content: roomContent,
        baseRevision: 0,
      });
    } catch (error) {
      logger.error(
        {
          error,
          projectId: ctx.projectId,
          workspaceId: ctx.workspaceId,
          resourcePath: ctx.resourcePath,
        },
        "AuthorityPersistenceExtension: onStoreDocument commit failed",
      );
      throw error;
    }
  }
}
