/**
 * Workspace Offline Drafts (WMA-269)
 *
 * 离线草稿持久化层，使用 IndexedDB 存储用户在 Authority 不可达时的编辑内容。
 *
 * 设计原则：
 * - 离线时绝不直接调用文件 API，仅缓存到 IndexedDB
 * - 离线草稿只报告 "离线，修改尚未保存到服务器"，不报告 "已自动保存"
 * - 重连时通过 baseHash 与服务端当前 hash 对比决定提交或进入冲突
 */

const DB_NAME = "workbench-offline-drafts";
const DB_VERSION = 1;
const STORE_NAME = "workspace-offline-drafts";

/**
 * 离线草稿数据结构
 */
export interface OfflineDraft {
  workspaceId: string;
  projectId: string;
  path: string;
  content: string;
  baseRevision: number;
  baseHash: string;
  savedAt: number;
}

/**
 * 重连时草稿与服务端对比的结果
 */
export type ReconcileOutcome =
  | { status: "match"; draft: OfflineDraft }
  | { status: "conflict"; draft: OfflineDraft; serverHash: string };

/**
 * IndexedDB 离线草稿存储接口
 */
export interface OfflineDraftStore {
  saveDraft(draft: OfflineDraft): Promise<void>;
  getDrafts(workspaceId: string): Promise<OfflineDraft[]>;
  removeDraft(workspaceId: string, path: string): Promise<void>;
  removeAllDrafts(workspaceId: string): Promise<void>;
  hasDrafts(workspaceId: string): Promise<boolean>;
}

/** 生成 IndexedDB key: `${workspaceId}:${path}` */
function makeKey(workspaceId: string, path: string): string {
  return `${workspaceId}:${path}`;
}

/** 检查某个 key 是否属于指定 workspaceId */
function belongsToWorkspace(key: string, workspaceId: string): boolean {
  return key.startsWith(`${workspaceId}:`);
}

/**
 * 打开（或升级）IndexedDB 数据库。
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB 打开失败"));
    };
  });
}

/**
 * 在指定 objectStore 上执行单个写操作。
 */
function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 操作失败"));
  });
}

/**
 * 创建一个 OfflineDraftStore 实例。
 *
 * 每次操作都会打开/复用 IndexedDB 连接，保证在 SSR 环境中安全降级。
 */
export function createOfflineDraftStore(): OfflineDraftStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDB();
    }
    return dbPromise;
  }

  async function saveDraft(draft: OfflineDraft): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const key = makeKey(draft.workspaceId, draft.path);
    await runRequest(store.put(draft, key));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 写入失败"));
    });
  }

  async function getDrafts(workspaceId: string): Promise<OfflineDraft[]> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const drafts: OfflineDraft[] = [];

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const key = cursor.key as string;
          if (belongsToWorkspace(key, workspaceId)) {
            drafts.push(cursor.value as OfflineDraft);
          }
          cursor.continue();
        } else {
          resolve(drafts);
        }
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败"));
    });
  }

  async function removeDraft(workspaceId: string, path: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const key = makeKey(workspaceId, path);
    await runRequest(store.delete(key));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 删除失败"));
    });
  }

  async function removeAllDrafts(workspaceId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const key = cursor.key as string;
          if (belongsToWorkspace(key, workspaceId)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 批量删除失败"));
    });
  }

  async function hasDrafts(workspaceId: string): Promise<boolean> {
    const drafts = await getDrafts(workspaceId);
    return drafts.length > 0;
  }

  return {
    saveDraft,
    getDrafts,
    removeDraft,
    removeAllDrafts,
    hasDrafts,
  };
}

/**
 * 对比本地草稿与服务端当前 hash，判断是提交还是冲突。
 *
 * @param draft 本地离线草稿
 * @param serverHash 服务端对应 path 的当前 hash
 */
export function reconcileDraft(
  draft: OfflineDraft,
  serverHash: string,
): ReconcileOutcome {
  if (draft.baseHash === serverHash) {
    return { status: "match", draft };
  }
  return { status: "conflict", draft, serverHash };
}

/**
 * 离线草稿状态消息（固定文案，确保一致性）。
 * 离线时绝不报告 "已自动保存"。
 */
export const OFFLINE_DRAFT_STATUS_MESSAGE = "离线，修改尚未保存到服务器";

/**
 * 冲突提示消息。
 */
export const OFFLINE_DRAFT_CONFLICT_MESSAGE = "离线草稿与服务端版本冲突";
