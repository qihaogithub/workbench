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
    const deduped = deduplicateContent(roomContent);
    if (deduped !== null) {
      logger.warn(
        `onStoreDocument: detected duplicated room content, ` +
          `resource=${ctx.resourcePath}, ` +
          `beforeLen=${roomContent.length}, afterLen=${deduped.length}, ` +
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
 * 检测并消除自拼接重复内容。
 *
 * 支持三种检测方式：
 * 1. 字符级重复：前半段与后半段完全一致，并递归收敛 4、8 等多次重复
 * 2. 行级重复：兼容副本之间额外出现一行分隔的历史内容
 * 3. JSON 对象级重复：两个相同的 JSON 对象拼接（{...}{...}）
 *
 * 返回去重后的内容，或 null 表示未检测到重复。
 */
export function deduplicateContent(content: string): string | null {
  if (!content) return null;

  // 方法 1: 直接按原始字符串切半。源码通常以换行结尾，使用 split("\n")
  // 会多出一个空行并错过最常见的 content + content 形态。
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
    // 偶数行：前半段 == 后半段
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
    // 奇数行：前 half 行 == 后 half 行（跳过中间一行，处理尾部多余换行）
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
  // 场景：两个完整 JSON 对象拼接（{...}{...}），行级检测可能因行数不匹配而漏检
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
