import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CollabStateStore } from "../../src/collab/collab-state-store";

let tempDir: string;
let store: CollabStateStore;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-state-"));
  store = new CollabStateStore(tempDir);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CollabStateStore", () => {
  const descriptor = {
    projectId: "proj-1",
    workspaceId: "ws-1",
    resourcePath: "demos/page-1/index.tsx",
    kind: "page-code" as const,
  };

  it("保存并读取 Yjs 状态", () => {
    const update = new Uint8Array([1, 2, 3]);
    store.save("ws-1", descriptor, update);
    const loaded = store.load("ws-1", descriptor);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(update);
  });

  it("不存在状态文件时返回 null", () => {
    expect(store.load("ws-1", descriptor)).toBeNull();
  });

  it("覆盖保存", () => {
    store.save("ws-1", descriptor, new Uint8Array([1, 2, 3]));
    store.save("ws-1", descriptor, new Uint8Array([4, 5, 6]));
    const loaded = store.load("ws-1", descriptor);
    expect(loaded).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("不同资源的 state 隔离", () => {
    const desc2 = {
      projectId: "proj-1",
      workspaceId: "ws-1",
      resourcePath: "demos/page-1/config.schema.json",
      kind: "page-schema" as const,
    };

    store.save("ws-1", descriptor, new Uint8Array([1]));
    store.save("ws-1", desc2, new Uint8Array([2]));

    expect(store.load("ws-1", descriptor)).toEqual(new Uint8Array([1]));
    expect(store.load("ws-1", desc2)).toEqual(new Uint8Array([2]));
  });

  it("不同工作区的 state 隔离", () => {
    store.save("ws-1", descriptor, new Uint8Array([1]));
    const desc2 = {
      projectId: "proj-2",
      workspaceId: "ws-2",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code" as const,
    };
    store.save("ws-2", desc2, new Uint8Array([2]));

    expect(store.load("ws-1", descriptor)).toEqual(new Uint8Array([1]));
    expect(store.load("ws-2", desc2)).toEqual(new Uint8Array([2]));
  });

  it("删除工作区 state", () => {
    store.save("ws-1", descriptor, new Uint8Array([1]));
    store.deleteWorkspace("ws-1");
    expect(store.load("ws-1", descriptor)).toBeNull();
  });

  it("删除不存在的工作区不抛错", () => {
    expect(() => store.deleteWorkspace("nonexistent")).not.toThrow();
  });
});
