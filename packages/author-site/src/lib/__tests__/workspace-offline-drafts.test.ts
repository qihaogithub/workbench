import {
  createOfflineDraftStore,
  reconcileDraft,
  OFFLINE_DRAFT_STATUS_MESSAGE,
  OFFLINE_DRAFT_CONFLICT_MESSAGE,
  type OfflineDraft,
} from "../workspace-offline-drafts";

/** 构造测试用离线草稿 */
function makeDraft(overrides: Partial<OfflineDraft> = {}): OfflineDraft {
  return {
    workspaceId: overrides.workspaceId ?? "ws-1",
    projectId: overrides.projectId ?? "proj-1",
    path: overrides.path ?? "src/index.ts",
    content: overrides.content ?? "console.log('hello')",
    baseRevision: overrides.baseRevision ?? 5,
    baseHash: overrides.baseHash ?? "hash-abc",
    savedAt: overrides.savedAt ?? Date.now(),
  };
}

/*
 * jsdom 不支持 IndexedDB，需要完整 mock。
 * 实现一个内存级别的简化 IDB mock，足以覆盖 workspace-offline-drafts 的逻辑。
 */

type StoreData = Map<string, OfflineDraft>;

// 全局共享的内存存储
const globalStoreData: StoreData = new Map();

interface MockCursor {
  key: string;
  value: OfflineDraft;
  continue: () => void;
  delete: () => void;
}

interface MockRequest {
  result: unknown;
  error: DOMException | null;
  onsuccess: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
}

function createMockRequest(): MockRequest {
  return { result: null, error: null, onsuccess: null, onerror: null };
}

function fireSuccess(req: MockRequest): void {
  queueMicrotask(() => {
    req.onsuccess?.(new Event("success"));
  });
}

function createMockObjectStore(data: StoreData) {
  return {
    put(value: OfflineDraft, key: string): MockRequest {
      data.set(key, { ...value });
      const req = createMockRequest();
      fireSuccess(req);
      return req;
    },
    delete(key: string): MockRequest {
      data.delete(key);
      const req = createMockRequest();
      fireSuccess(req);
      return req;
    },
    openCursor(): MockRequest {
      const keys = Array.from(data.keys()).sort();
      let index = 0;
      const req = createMockRequest();

      function emit(): void {
        queueMicrotask(() => {
          if (index >= keys.length) {
            req.result = null;
            req.onsuccess?.(new Event("success"));
            return;
          }
          const key = keys[index];
          const cursor: MockCursor = {
            key,
            value: { ...data.get(key)! },
            continue: () => {
              index++;
              emit();
            },
            delete: () => {
              data.delete(key);
            },
          };
          req.result = cursor;
          req.onsuccess?.(new Event("success"));
        });
      }

      // 延迟一帧开始遍历，让调用者有时间设置 onsuccess
      queueMicrotask(() => emit());
      return req;
    },
  };
}

function createMockTransaction(data: StoreData) {
  const store = createMockObjectStore(data);
  const tx = {
    objectStore: (_name: string) => store,
    oncomplete: null as ((ev: Event) => unknown) | null,
    onerror: null as ((ev: Event) => unknown) | null,
    error: null as DOMException | null,
  };

  // 使用 setTimeout 而非 queueMicrotask 来触发 oncomplete，
  // 确保在所有微任务（包括 await 后的代码）执行完毕后才触发。
  // 这模拟了真实 IDB 的行为：tx.oncomplete 在所有 request 完成后异步触发。
  setTimeout(() => {
    tx.oncomplete?.(new Event("complete"));
  }, 0);

  return tx;
}

function createMockDatabase(data: StoreData) {
  const storeNames = new Set<string>(["workspace-offline-drafts"]);
  return {
    objectStoreNames: {
      contains: (name: string) => storeNames.has(name),
      length: storeNames.size,
      item: (index: number) => Array.from(storeNames)[index] ?? null,
      [Symbol.iterator]: function* () {
        yield* storeNames;
      },
    } as unknown as DOMStringList,
    createObjectStore: (name: string) => {
      storeNames.add(name);
      return {};
    },
    transaction: (_storeName: string, _mode: string) =>
      createMockTransaction(data),
  };
}

beforeAll(() => {
  const mockIndexedDB = {
    open: (_name: string, _version: number) => {
      const req = createMockRequest();
      queueMicrotask(() => {
        req.result = createMockDatabase(globalStoreData);
        // 触发 onupgradeneeded（如果有）
        const openReq = req as unknown as {
          onupgradeneeded?: ((ev: Event) => unknown) | null;
        };
        openReq.onupgradeneeded?.(new Event("upgradeneeded"));
        req.onsuccess?.(new Event("success"));
      });
      return req;
    },
  };

  Object.defineProperty(globalThis, "indexedDB", {
    value: mockIndexedDB,
    writable: true,
    configurable: true,
  });
});

describe("WorkspaceOfflineDrafts", () => {
  let store: ReturnType<typeof createOfflineDraftStore>;

  beforeEach(() => {
    globalStoreData.clear();
    store = createOfflineDraftStore();
  });

  describe("saveDraft", () => {
    it("应将草稿保存到 IndexedDB", async () => {
      const draft = makeDraft();
      await store.saveDraft(draft);
      const drafts = await store.getDrafts("ws-1");
      expect(drafts).toHaveLength(1);
      expect(drafts[0].path).toBe("src/index.ts");
      expect(drafts[0].content).toBe("console.log('hello')");
    });

    it("同一路径多次保存应覆盖旧草稿", async () => {
      const draft1 = makeDraft({ content: "v1" });
      const draft2 = makeDraft({ content: "v2" });
      await store.saveDraft(draft1);
      await store.saveDraft(draft2);
      const drafts = await store.getDrafts("ws-1");
      expect(drafts).toHaveLength(1);
      expect(drafts[0].content).toBe("v2");
    });

    it("不同路径的草稿应独立保存", async () => {
      await store.saveDraft(makeDraft({ path: "a.ts", content: "a" }));
      await store.saveDraft(makeDraft({ path: "b.ts", content: "b" }));
      const drafts = await store.getDrafts("ws-1");
      expect(drafts).toHaveLength(2);
    });
  });

  describe("getDrafts", () => {
    it("应仅返回指定 workspace 的草稿", async () => {
      await store.saveDraft(makeDraft({ workspaceId: "ws-1", path: "a.ts" }));
      await store.saveDraft(makeDraft({ workspaceId: "ws-2", path: "b.ts" }));
      const drafts1 = await store.getDrafts("ws-1");
      const drafts2 = await store.getDrafts("ws-2");
      expect(drafts1).toHaveLength(1);
      expect(drafts2).toHaveLength(1);
      expect(drafts1[0].path).toBe("a.ts");
      expect(drafts2[0].path).toBe("b.ts");
    });

    it("无草稿时应返回空数组", async () => {
      const drafts = await store.getDrafts("ws-empty");
      expect(drafts).toHaveLength(0);
    });
  });

  describe("removeDraft", () => {
    it("应移除指定路径的草稿", async () => {
      await store.saveDraft(makeDraft({ path: "a.ts" }));
      await store.saveDraft(makeDraft({ path: "b.ts" }));
      await store.removeDraft("ws-1", "a.ts");
      const drafts = await store.getDrafts("ws-1");
      expect(drafts).toHaveLength(1);
      expect(drafts[0].path).toBe("b.ts");
    });

    it("移除不存在的草稿不应抛错", async () => {
      await expect(
        store.removeDraft("ws-1", "nonexistent.ts"),
      ).resolves.toBeUndefined();
    });
  });

  describe("removeAllDrafts", () => {
    it("应移除指定 workspace 的所有草稿", async () => {
      await store.saveDraft(makeDraft({ path: "a.ts" }));
      await store.saveDraft(makeDraft({ path: "b.ts" }));
      await store.saveDraft(
        makeDraft({ workspaceId: "ws-other", path: "c.ts" }),
      );
      await store.removeAllDrafts("ws-1");
      const drafts1 = await store.getDrafts("ws-1");
      const drafts2 = await store.getDrafts("ws-other");
      expect(drafts1).toHaveLength(0);
      expect(drafts2).toHaveLength(1);
    });
  });

  describe("hasDrafts", () => {
    it("有草稿时应返回 true", async () => {
      await store.saveDraft(makeDraft());
      await expect(store.hasDrafts("ws-1")).resolves.toBe(true);
    });

    it("无草稿时应返回 false", async () => {
      await expect(store.hasDrafts("ws-1")).resolves.toBe(false);
    });
  });

  describe("reconcileDraft", () => {
    it("hash 匹配时应返回 match 状态", () => {
      const draft = makeDraft({ baseHash: "hash-123" });
      const result = reconcileDraft(draft, "hash-123");
      expect(result.status).toBe("match");
      if (result.status === "match") {
        expect(result.draft).toBe(draft);
      }
    });

    it("hash 不匹配时应返回 conflict 状态", () => {
      const draft = makeDraft({ baseHash: "hash-123" });
      const result = reconcileDraft(draft, "hash-456");
      expect(result.status).toBe("conflict");
      if (result.status === "conflict") {
        expect(result.draft).toBe(draft);
        expect(result.serverHash).toBe("hash-456");
      }
    });
  });

  describe("常量", () => {
    it("离线状态消息应正确", () => {
      expect(OFFLINE_DRAFT_STATUS_MESSAGE).toBe("离线，修改尚未保存到服务器");
    });

    it("冲突消息应正确", () => {
      expect(OFFLINE_DRAFT_CONFLICT_MESSAGE).toBe("离线草稿与服务端版本冲突");
    });
  });
});
