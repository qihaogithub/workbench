import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { deduplicateContent } from "../../src/collab/extensions/authority-persistence";

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
