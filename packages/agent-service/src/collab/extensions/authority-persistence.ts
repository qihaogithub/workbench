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
    const textLenBefore = text.length;
    if (textLenBefore > 0) return;

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
    let roomContent = text.toString();

    // Defense-in-depth: 如果 Yjs room 内容已经是自拼接重复，截断为前半段。
    // 这不应在正常流程中发生，但作为最后防线避免重复内容落盘。
    if (isContentDuplicated(roomContent)) {
      const lines = roomContent.split("\n");
      const half = lines.length / 2;
      const deduped = lines.slice(0, half).join("\n");
      logger.warn(
        `onStoreDocument: detected duplicated room content, ` +
          `resource=${ctx.resourcePath}, ` +
          `beforeLines=${lines.length}, afterLines=${half}, ` +
          `trimming to first half`,
      );
      roomContent = deduped;
      // 同步修正 Yjs room 内容，避免下次 onStoreDocument 再次检测到重复
      text.delete(0, text.length);
      text.insert(0, deduped);
    }

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

/**
 * Detect whether content is an exact self-concatenation (duplicated).
 * Checks if the second half of the line array equals the first half.
 */
function isContentDuplicated(content: string): boolean {
  if (!content) return false;
  const lines = content.split("\n");
  if (lines.length < 2 || lines.length % 2 !== 0) return false;
  const half = lines.length / 2;
  for (let i = 0; i < half; i++) {
    if (lines[i] !== lines[half + i]) return false;
  }
  return true;
}
