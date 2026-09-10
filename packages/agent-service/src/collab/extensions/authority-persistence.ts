import type { Extension } from "@hocuspocus/server";
import * as Y from "yjs";
import crypto from "node:crypto";

import type { CollabConnectionContext } from "./session-auth";
import { decodeDocumentName, type CollabDocumentName } from "../document-name";
import type { WorkspaceFilePersistence } from "../workspace-file-persistence";
import type { CollabStateStore } from "../collab-state-store";
import { logger } from "../../utils/logger";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";

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
 * Human edits remain authoritative inside a Yjs room. Agent/HTTP mutations
 * commit through Workspace Authority and are projected back into an active
 * room only when its content still matches the receipt's before hash. A room
 * with unsaved local edits is marked conflicted and cannot flush stale text
 * over the newer Authority revision; its persisted Yjs snapshot is removed so
 * a reconnect starts from canonical content.
 */
export class AuthorityPersistenceExtension implements Extension {
  priority = 100;
  private readonly lastReceipts = new Map<string, WorkspaceMutationReceipt>();
  private readonly conflictedRooms = new Set<string>();
  private readonly roomBaselines = new Map<string, string>();

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

    // A newly loaded room always re-seeds from persisted canonical content;
    // clear an in-memory conflict marker left by a previous connection.
    this.conflictedRooms.delete(this.roomKey(ctx));

    const text = data.document.getText("content");
    if (text.length > 0) {
      this.roomBaselines.set(this.roomKey(ctx), this.hashContent(text.toString()));
      return;
    }

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

        if (text.toString() !== state.content) {
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
        this.roomBaselines.set(this.roomKey(ctx), this.hashContent(text.toString()));
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
    this.roomBaselines.set(this.roomKey(ctx), this.hashContent(text.toString()));
  }

  /**
   * Persist the Yjs text content to Authority and save Yjs state.
   *
   * Called by Hocuspocus after the configured debounce window. Skips
   * no-op writes (file content unchanged) to avoid unnecessary mutation
   * events. Human Yjs writes use the collab actor and may merge in the room;
   * Agent writes never reach this path without an explicit Authority receipt.
   * The resulting durable receipt is retained for the direct writer; callers
   * must never construct a revision-0/empty-root success receipt themselves.
   */
  async onStoreDocument(data: {
    document: Y.Doc;
    lastContext: CollabConnectionContext | null;
  }): Promise<void> {
    const ctx = data.lastContext;
    if (!ctx?.ok) return;

    const roomKey = this.roomKey(ctx);
    if (this.conflictedRooms.has(roomKey)) {
      throw new Error("WORKSPACE_RESOURCE_CONFLICT");
    }

    this.lastReceipts.delete(`${ctx.workspaceId}:${ctx.resourcePath}`);

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

    const baselineHash = this.roomBaselines.get(roomKey) ?? this.hashContent(currentState.content);
    if (currentState.hash !== baselineHash) {
      this.conflictedRooms.add(roomKey);
      this.roomBaselines.delete(roomKey);
      this.stateStore?.delete(ctx.workspaceId, {
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        resourcePath: ctx.resourcePath,
        kind: ctx.kind as never,
      });
      throw new Error("WORKSPACE_RESOURCE_CONFLICT");
    }

    if (currentState.content === roomContent) {
      if (this.stateStore) {
        this.persistState(data.document, ctx);
      }
      return;
    }

    try {
      this.persistence.assertConfigResourceWriteAllowed({
        workspacePath: ctx.workspacePath,
        resourcePath: ctx.resourcePath,
        kind: ctx.kind as never,
        role: ctx.role,
      });
      const result = await this.persistence.commitResource({
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        resourcePath: ctx.resourcePath,
        kind: ctx.kind as never,
        content: roomContent,
        baseRevision: 0,
        expectedHash: baselineHash,
      });
      this.lastReceipts.set(`${ctx.workspaceId}:${ctx.resourcePath}`, result.receipt);
      this.roomBaselines.set(roomKey, this.hashContent(roomContent));

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

  async afterUnloadDocument(data: { documentName: string }): Promise<void> {
    const descriptor = decodeDocumentName(data.documentName);
    if (!descriptor) return;
    const key = this.roomKey(descriptor);
    this.roomBaselines.delete(key);
    this.conflictedRooms.delete(key);
  }

  /**
   * Apply a committed non-collab mutation to an active room without allowing
   * an unsaved human edit to be overwritten. The caller supplies the room's
   * current Y.Doc and the canonical content read after the Authority commit.
   */
  applyCommittedResource(input: {
    documentName: string;
    document: Y.Doc;
    descriptor: CollabDocumentName;
    beforeHash: string | null;
    afterHash: string | null;
    canonicalContent: string;
  }): "applied" | "conflicted" | "ignored" {
    const currentContent = input.document.getText("content").toString();
    const currentHash = this.hashContent(currentContent);
    const expectedBefore = input.beforeHash ?? this.hashContent("");
    if (currentHash !== expectedBefore) {
      this.conflictedRooms.add(this.roomKey(input.descriptor));
      this.roomBaselines.delete(this.roomKey(input.descriptor));
      this.stateStore?.delete(input.descriptor.workspaceId, input.descriptor);
      logger.warn(
        {
          documentName: input.documentName,
          projectId: input.descriptor.projectId,
          workspaceId: input.descriptor.workspaceId,
          resourcePath: input.descriptor.resourcePath,
          expectedBefore,
          currentHash,
        },
        "Authority commit raced with unsaved Yjs edits; room requires reconnect",
      );
      return "conflicted";
    }

    if (this.hashContent(input.canonicalContent) !== (input.afterHash ?? this.hashContent(""))) {
      logger.error(
        { documentName: input.documentName, resourcePath: input.descriptor.resourcePath },
        "Authority commit content hash did not match receipt",
      );
      return "ignored";
    }

    const text = input.document.getText("content");
    input.document.transact(() => {
      if (text.length > 0) text.delete(0, text.length);
      if (input.canonicalContent) text.insert(0, input.canonicalContent);
    });
    this.conflictedRooms.delete(this.roomKey(input.descriptor));
    this.roomBaselines.set(this.roomKey(input.descriptor), this.hashContent(input.canonicalContent));
    return "applied";
  }

  getLastReceipt(workspaceId: string, resourcePath: string): WorkspaceMutationReceipt | undefined {
    return this.lastReceipts.get(`${workspaceId}:${resourcePath}`);
  }

  private roomKey(input: Pick<CollabConnectionContext, "projectId" | "workspaceId" | "resourcePath">): string {
    return `${input.projectId}:${input.workspaceId}:${input.resourcePath}`;
  }

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
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
