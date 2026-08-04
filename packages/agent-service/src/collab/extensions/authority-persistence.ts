import type { Extension } from "@hocuspocus/server";
import * as Y from "yjs";

import type { CollabConnectionContext } from "./session-auth";
import type { CollabDocumentName } from "../document-name";
import type { WorkspaceFilePersistence } from "../workspace-file-persistence";
import type { CollabStateStore } from "../collab-state-store";
import { logger } from "../../utils/logger";

/**
 * AuthorityPersistenceExtension
 *
 * Replaces the persistence logic that used to live in
 * `CollabRoomManager.getOrCreateRoom` (initial content load) and
 * `CollabRoomManager.flushRoom` (debounced save).
 *
 * - `onLoadDocument`: restores persisted Yjs state (collab-state) to preserve
 *   CRDT item identity across room recreation. Falls back to seeding from disk
 *   text when no persisted state exists (first run / legacy data).
 * - `onStoreDocument`: reads the Yjs text and commits it to Authority via
 *   `persistence.commitResource()` (actor: "collab", reason: "collab_autosave"),
 *   then persists the Yjs state so the room can safely recreate on next start.
 *
 * The Yjs room is the single content authority (Yjs-First architecture),
 * so non-collab writes must route through the Yjs doc via
 * `Hocuspocus.openDirectConnection().transact()` instead of bypassing it.
 */
export class AuthorityPersistenceExtension implements Extension {
  priority = 100;

  constructor(
    private readonly persistence: WorkspaceFilePersistence,
    private readonly stateStore?: CollabStateStore,
  ) {}

  /**
   * Restore persisted Yjs state, or seed from disk text on first run.
   *
   * Preserving Yjs item identities across room recreation prevents the
   * classic Yjs replication bug where two independent insertions of the
   * same text get concatenated on reconnect (2/3/4/8 copies).
   */
  async onLoadDocument(data: {
    document: Y.Doc;
    context: CollabConnectionContext;
  }): Promise<void> {
    const ctx = data.context;
    if (!ctx?.ok) return;

    const text = data.document.getText("content");
    if (text.length > 0) return;

    const descriptor: CollabDocumentName = {
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      resourcePath: ctx.resourcePath,
      kind: ctx.kind as never,
    };

    const savedState =
      this.stateStore?.load(ctx.workspaceId, descriptor) ?? null;

    if (savedState) {
      try {
        Y.applyUpdate(data.document, savedState);

        const state = this.persistence.readResourceState(
          ctx.workspacePath,
          ctx.resourcePath,
          ctx.kind as never,
        );

        if (state.content && text.toString() !== state.content) {
          logger.warn(
            {
              workspaceId: ctx.workspaceId,
              resourcePath: ctx.resourcePath,
            },
            "onLoadDocument: restored Yjs state diverged from disk, resetting to disk",
          );
          text.delete(0, text.length);
          text.insert(0, state.content);
          this.stateStore?.save(
            ctx.workspaceId,
            descriptor,
            Y.encodeStateAsUpdate(data.document),
          );
        }
        return;
      } catch (error) {
        logger.error(
          { error, workspaceId: ctx.workspaceId, resourcePath: ctx.resourcePath },
          "onLoadDocument: failed to restore Yjs state, falling back to disk seed",
        );
        this.stateStore?.deleteWorkspace(ctx.workspaceId);
      }
    }

    const state = this.persistence.readResourceState(
      ctx.workspacePath,
      ctx.resourcePath,
      ctx.kind as never,
    );

    if (state.content) {
      text.insert(0, state.content);
      this.stateStore?.save(
        ctx.workspaceId,
        descriptor,
        Y.encodeStateAsUpdate(data.document),
      );
    }
  }

  /**
   * Persist the Yjs text content to Authority and save Yjs state.
   *
   * Called by Hocuspocus after the configured debounce window. Skips
   * no-op writes (file content unchanged) to avoid unnecessary mutation
   * events. Uses `baseRevision: 0` because the Yjs room is the single
   * authority and the Authority auto-adopts drift.
   */
  async onStoreDocument(data: {
    document: Y.Doc;
    lastContext: CollabConnectionContext | null;
  }): Promise<void> {
    const ctx = data.lastContext;
    if (!ctx?.ok) return;

    const text = data.document.getText("content");
    let roomContent = text.toString();

    const deduped = deduplicateContent(roomContent);
    if (deduped !== null) {
      logger.warn(
        {
          resourcePath: ctx.resourcePath,
          beforeLen: roomContent.length,
          afterLen: deduped.length,
        },
        "onStoreDocument: detected duplicated room content, trimming",
      );
      roomContent = deduped;
      text.delete(0, text.length);
      text.insert(0, deduped);
    }

    const currentState = this.persistence.readResourceState(
      ctx.workspacePath,
      ctx.resourcePath,
      ctx.kind as never,
    );

    if (currentState.content === roomContent) {
      if (this.stateStore) {
        this.persistState(data.document, ctx);
      }
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

      if (this.stateStore) {
        this.persistState(data.document, ctx);
      }
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

  private persistState(
    document: Y.Doc,
    ctx: CollabConnectionContext,
  ): void {
    try {
      this.stateStore!.save(
        ctx.workspaceId,
        {
          projectId: ctx.projectId,
          workspaceId: ctx.workspaceId,
          resourcePath: ctx.resourcePath,
          kind: ctx.kind as never,
        },
        Y.encodeStateAsUpdate(document),
      );
    } catch (error) {
      logger.error(
        { error, workspaceId: ctx.workspaceId, resourcePath: ctx.resourcePath },
        "AuthorityPersistenceExtension: failed to persist Yjs state",
      );
    }
  }
}

/**
 * 检测并消除自拼接重复内容。
 *
 * 支持三种检测方式：
 * 1. 字符级 N 份重复：内容 = unit.repeat(N)，通过寻找最小重复周期收敛
 * 2. 行级重复：兼容副本之间额外出现一行分隔的历史内容
 * 3. JSON 对象级重复：两个相同的 JSON 对象拼接（{...}{...}）
 *
 * 返回去重后的单份内容，或 null 表示未检测到重复。
 */
export function deduplicateContent(content: string): string | null {
  if (!content) return null;

  // 方法 0: 寻找最小字符串周期（覆盖 N 份重复，含 3/5/6/7 等非幂次）
  // 从大 N 到小 N，确保收敛到最小 unit
  for (let n = 8; n >= 2; n--) {
    if (content.length % n !== 0) continue;
    const unitLen = content.length / n;
    const unit = content.slice(0, unitLen);
    let allMatch = true;
    for (let i = 1; i < n; i++) {
      if (content.slice(i * unitLen, (i + 1) * unitLen) !== unit) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return unit;
  }

  // 方法 1: 直接按原始字符串切半（兼容旧逻辑）
  let exactDeduped = content;
  let exactDuplicateFound = false;
  while (exactDeduped.length % 2 === 0) {
    const half = exactDeduped.length / 2;
    if (exactDeduped.slice(0, half) !== exactDeduped.slice(half)) break;
    exactDeduped = exactDeduped.slice(0, half);
    exactDuplicateFound = true;
  }
  if (exactDuplicateFound) return exactDeduped;

  // 方法 2: 行级重复检测（兼容副本之间存在额外分隔行）
  const lines = content.split("\n");
  if (lines.length >= 4) {
    const half = Math.floor(lines.length / 2);
    if (lines.length % 2 === 0) {
      let allMatch = true;
      for (let i = 0; i < half; i++) {
        if (lines[i] !== lines[half + i]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return lines.slice(0, half).join("\n");
    }
    if (lines.length % 2 === 1 && half >= 2) {
      let allMatch = true;
      for (let i = 0; i < half; i++) {
        if (lines[i] !== lines[half + 1 + i]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return lines.slice(0, half).join("\n");
    }
  }

  // 方法 3: JSON 对象级重复检测
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let firstEnd = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        firstEnd = i + 1;
        break;
      }
    }
  }
  if (firstEnd === -1) return null;
  const firstObj = content.slice(start, firstEnd);
  const remaining = content.slice(firstEnd).trim();
  if (!remaining || !remaining.startsWith("{")) return null;
  try {
    const first = JSON.parse(firstObj);
    const second = JSON.parse(remaining);
    if (JSON.stringify(first) === JSON.stringify(second)) {
      return firstObj;
    }
  } catch {
    // 解析失败，不是 JSON 重复
  }
  return null;
}
