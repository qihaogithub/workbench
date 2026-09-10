import * as Y from "yjs";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  AuthorityPersistenceExtension,
  deduplicateContent,
} from "../../src/collab/extensions/authority-persistence";

describe("AuthorityPersistenceExtension 重复内容守卫", () => {
  const moduleSource = [
    "interface DemoProps {}",
    "const subjects = [];",
    "export default function PhoneSquare() {",
    "  return null;",
    "}",
    "",
  ].join("\n");

  it("去除两个带尾部换行的完整模块副本", () => {
    expect(deduplicateContent(moduleSource + moduleSource)).toBe(moduleSource);
  });

  it.each([2, 3, 4, 5, 8])("把 %i 次重复收敛为单份模块", (copies) => {
    expect(deduplicateContent(moduleSource.repeat(copies))).toBe(moduleSource);
  });

  it("不处理仅包含相似代码段的正常源码", () => {
    const source = [
      "const first = () => {",
      "  return null;",
      "};",
      "const second = () => {",
      "  return null;",
      "};",
      "",
    ].join("\n");

    expect(deduplicateContent(source)).toBeNull();
  });
});

describe("Phase 2: Yjs 状态持久化恢复后重连不加倍", () => {
  const X = [
    "interface DemoProps {}",
    "const TAG_LABELS = [];",
    "const REGION_MAP = {};",
    "export default function Demo() { return null; }",
    "",
  ].join("\n");

  function syncDiff(from: Y.Doc, to: Y.Doc): number {
    const fromUpdate = Y.encodeStateAsUpdate(from);
    const toSV = Y.encodeStateVector(to);
    const diff = Y.diffUpdate(fromUpdate, toSV);
    if (diff.length > 0) Y.applyUpdate(to, diff);
    return diff.length;
  }

  function buildFirstSyncAndCorrect(syncedText: string): {
    client: Y.Doc;
    savedState: Uint8Array;
  } {
    // room seed (onLoadDocument): independent insert
    const room = new Y.Doc();
    room.getText("content").insert(0, syncedText);

    // client independent insert
    const client = new Y.Doc();
    client.getText("content").insert(0, syncedText);

    // first sync: inevitably doubles
    syncDiff(client, room);
    syncDiff(room, client);

    // dedup correction
    const text = room.getText("content");
    const corrected = deduplicateContent(text.toString())!;
    text.delete(0, text.length);
    text.insert(0, corrected);

    // broadcast correction to client
    syncDiff(room, client);

    // persist corrected state (simulates onStoreDocument)
    const savedState = Y.encodeStateAsUpdate(room);
    return { client, savedState };
  }

  it("稳态后房间恢复 Yjs 状态，客户端重连不产生加倍", () => {
    const { client, savedState } = buildFirstSyncAndCorrect(X);

    // server restart: restore room from state
    const room2 = new Y.Doc();
    Y.applyUpdate(room2, savedState);

    // client reconnects
    syncDiff(client, room2);
    syncDiff(room2, client);

    expect(room2.getText("content").toString()).toBe(X);
    expect(room2.getText("content").length).toBe(X.length);
  });

  it("客户端有未落盘编辑，重连后仅增量同步不加倍", () => {
    const { client, savedState } = buildFirstSyncAndCorrect(X);

    // client makes extra edit AFTER the persist
    const X_EDITED = X.replace(/TAG_LABELS = \[\]/g, "TAG_LABELS = [\"new\"]");
    const clientText = client.getText("content");
    clientText.delete(0, clientText.length);
    clientText.insert(0, X_EDITED);

    const room2 = new Y.Doc();
    Y.applyUpdate(room2, savedState);
    syncDiff(client, room2);
    syncDiff(room2, client);

    const final = room2.getText("content").toString();
    expect(final).toContain("TAG_LABELS = [\"new\"]");
    expect(final.length).toBe(X_EDITED.length);
  });

  it("首次 sync 未完成就重启（Yjs 状态不含客户端 items），加倍由 dedup 兜底", () => {
    // room only has server items (first seed, no client items in state)
    const room1 = new Y.Doc();
    room1.getText("content").insert(0, X);
    const savedState = Y.encodeStateAsUpdate(room1);

    const client = new Y.Doc();
    client.getText("content").insert(0, X);

    const room2 = new Y.Doc();
    Y.applyUpdate(room2, savedState);
    syncDiff(client, room2);
    syncDiff(room2, client);

    const doubled = room2.getText("content").toString();
    expect(doubled.length).toBe(2 * X.length);

    const fixed = deduplicateContent(doubled);
    expect(fixed).toBe(X);
  });
});

describe("Authority receipt → 活跃 Yjs 房间投影", () => {
  const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
  const descriptor = {
    projectId: "project-1",
    workspaceId: "workspace-1",
    resourcePath: "demos/home/index.tsx",
    kind: "page-code" as const,
  };

  it("房间仍在 receipt 基线时安全应用 canonical 内容", () => {
    const extension = new AuthorityPersistenceExtension({} as never);
    const document = new Y.Doc();
    document.getText("content").insert(0, "before");

    const result = extension.applyCommittedResource({
      documentName: JSON.stringify(descriptor),
      document,
      descriptor,
      beforeHash: hash("before"),
      afterHash: hash("after"),
      canonicalContent: "after",
    });

    expect(result).toBe("applied");
    expect(document.getText("content").toString()).toBe("after");
  });

  it("房间有未落盘人类编辑时标记冲突而不覆盖本地内容", () => {
    const extension = new AuthorityPersistenceExtension({} as never);
    const document = new Y.Doc();
    document.getText("content").insert(0, "human-edit");

    const result = extension.applyCommittedResource({
      documentName: JSON.stringify(descriptor),
      document,
      descriptor,
      beforeHash: hash("before"),
      afterHash: hash("agent-after"),
      canonicalContent: "agent-after",
    });

    expect(result).toBe("conflicted");
    expect(document.getText("content").toString()).toBe("human-edit");
  });

  it("冲突房间的后续 flush 被拒绝，避免旧 Yjs 内容覆盖 Authority", async () => {
    const extension = new AuthorityPersistenceExtension({} as never);
    const document = new Y.Doc();
    document.getText("content").insert(0, "human-edit");
    extension.applyCommittedResource({
      documentName: JSON.stringify(descriptor),
      document,
      descriptor,
      beforeHash: hash("before"),
      afterHash: hash("agent-after"),
      canonicalContent: "agent-after",
    });

    await expect(extension.onStoreDocument({
      document,
      lastContext: {
        ok: true,
        ...descriptor,
        sessionId: "session-1",
        userId: "user-1",
        username: "User",
        workspacePath: "/tmp/workspace-1",
      },
    })).rejects.toThrow("WORKSPACE_RESOURCE_CONFLICT");
  });
});
