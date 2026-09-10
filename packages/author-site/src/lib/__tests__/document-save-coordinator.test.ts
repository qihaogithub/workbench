import {
  DocumentSaveCoordinator,
  DocumentSaveError,
  getDocumentSaveStatusLabel,
  isDocumentSaveAttentionStatus,
  toDocumentSaveError,
} from "../document-save-coordinator";
import {
  contentFingerprint,
  type OfflineDraft,
  type OfflineDraftStore,
} from "../workspace-offline-drafts";

function createDraftStore(): OfflineDraftStore & { records: Map<string, OfflineDraft> } {
  const records = new Map<string, OfflineDraft>();
  const key = (workspaceId: string, path: string) => `${workspaceId}:${path}`;
  return {
    records,
    async saveDraft(draft) {
      records.set(key(draft.workspaceId, draft.path), { ...draft });
    },
    async getDrafts(workspaceId) {
      return [...records.values()].filter((draft) => draft.workspaceId === workspaceId);
    },
    async removeDraft(workspaceId, path) {
      records.delete(key(workspaceId, path));
    },
    async removeAllDrafts(workspaceId) {
      for (const [recordKey, draft] of records) {
        if (draft.workspaceId === workspaceId) records.delete(recordKey);
      }
    },
    async hasDrafts(workspaceId) {
      return [...records.values()].some((draft) => draft.workspaceId === workspaceId);
    },
  };
}

function createCoordinator(
  save: (value: string) => Promise<{ revision: number }>,
  overrides: Partial<{
    debounceMs: number;
    maxWaitMs: number;
    onStateChange: (snapshot: ReturnType<DocumentSaveCoordinator<string>["getSnapshot"]>) => void;
  }> = {},
) {
  const store = createDraftStore();
  const states: string[] = [];
  const coordinator = new DocumentSaveCoordinator<string>({
    save,
    debounceMs: 800,
    maxWaitMs: 3000,
    draft: {
      store,
      workspaceId: "ws-1",
      projectId: "project-1",
      path: "document:doc-1",
      baseHash: "base",
      serialize: (value) => value,
      deserialize: (value) => value,
    },
    onStateChange: (snapshot) => states.push(snapshot.status),
    ...overrides,
  });
  return { coordinator, store, states };
}

describe("DocumentSaveCoordinator", () => {
  it("只把异常保存状态标记为需要用户关注", () => {
    expect(isDocumentSaveAttentionStatus("clean")).toBe(false);
    expect(isDocumentSaveAttentionStatus("dirty")).toBe(false);
    expect(isDocumentSaveAttentionStatus("saving")).toBe(false);
    expect(isDocumentSaveAttentionStatus("saved")).toBe(false);
    expect(isDocumentSaveAttentionStatus("offline")).toBe(true);
    expect(isDocumentSaveAttentionStatus("authority-degraded")).toBe(true);
    expect(isDocumentSaveAttentionStatus("conflict")).toBe(true);
    expect(isDocumentSaveAttentionStatus("permission-denied")).toBe(true);
    expect(isDocumentSaveAttentionStatus("validation-failed")).toBe(true);
  });

  it("只在保存拿到成功回执后清理本地草稿", async () => {
    const save = jest.fn(async () => ({ revision: 7 }));
    const { coordinator, store, states } = createCoordinator(save);

    coordinator.markDirty("正文");
    await Promise.resolve();
    expect(store.records.size).toBe(1);
    expect(coordinator.getSnapshot().status).toBe("dirty");

    await expect(coordinator.flush()).resolves.toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith("正文");
    expect(store.records.size).toBe(0);
    expect(coordinator.getSnapshot().status).toBe("saved");
    expect(states).toContain("saving");
  });

  it("Authority 备份故障会暂停自动保存，并保留待提交内容直到显式重试", async () => {
    let shouldFail = true;
    const save = jest.fn(async () => {
      if (shouldFail) {
        throw {
          error: {
            code: "WORKSPACE_AUTHORITY_BACKUP_MISSING",
            message: "Committed backup is missing",
          },
        };
      }
      return { revision: 8 };
    });
    const { coordinator, store } = createCoordinator(save);

    coordinator.markDirty("未保存正文");
    await expect(coordinator.flush()).resolves.toBe(false);
    expect(coordinator.getSnapshot().status).toBe("authority-degraded");
    expect(coordinator.getSnapshot().hasLocalDraft).toBe(true);
    expect(store.records.size).toBe(1);

    coordinator.markDirty("更新后的未保存正文");
    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(1);

    shouldFail = false;
    await expect(coordinator.retry()).resolves.toBe(true);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.records.size).toBe(0);
    expect(coordinator.getSnapshot().status).toBe("saved");
  });

  it("提交期间产生的新草稿使用成功提交后的服务端基线", async () => {
    let resolveSave!: (receipt: { revision: number }) => void;
    const save = jest.fn(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { coordinator, store } = createCoordinator(save);
    coordinator.setBase("服务端原文", 1);

    coordinator.markDirty("已提交正文");
    const inFlight = coordinator.flush();
    coordinator.markDirty("提交期间的新草稿");
    resolveSave({ revision: 7 });

    await expect(inFlight).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...store.records.values()]).toEqual([
      expect.objectContaining({
        content: "提交期间的新草稿",
        baseRevision: 7,
        baseHash: contentFingerprint("已提交正文"),
      }),
    ]);

    const next = new DocumentSaveCoordinator<string>({
      save: async () => ({ revision: 8 }),
      draft: {
        store,
        workspaceId: "ws-1",
        projectId: "project-1",
        path: "document:doc-1",
        serialize: (value) => value,
        deserialize: (value) => value,
      },
    });
    await expect(next.readDraft("已提交正文")).resolves.toMatchObject({
      status: "match",
      value: "提交期间的新草稿",
    });

    await coordinator.discardDraft();
  });

  it("同一基线的本地草稿可以恢复，基线变化时进入冲突状态", async () => {
    const store = createDraftStore();
    await store.saveDraft({
      workspaceId: "ws-1",
      projectId: "project-1",
      path: "document:doc-1",
      content: "本地草稿",
      baseRevision: 1,
      baseHash: contentFingerprint("服务端原文"),
      savedAt: Date.now(),
    });

    const next = new DocumentSaveCoordinator<string>({
      save: async () => ({ revision: 2 }),
      draft: {
        store,
        workspaceId: "ws-1",
        projectId: "project-1",
        path: "document:doc-1",
        serialize: (value) => value,
        deserialize: (value) => value,
      },
      onStateChange: jest.fn(),
    });
    next.setBase("服务端原文");
    await expect(next.readDraft("服务端原文")).resolves.toMatchObject({
      status: "match",
      value: "本地草稿",
    });
    await expect(next.readDraft("服务端新原文")).resolves.toMatchObject({
      status: "conflict",
    });
    expect(next.getSnapshot().hasLocalDraft).toBe(true);

    await expect(next.restoreDraft()).resolves.toBe("本地草稿");
    expect(next.getSnapshot().status).toBe("dirty");
    await next.discardDraft();
    expect(next.getSnapshot()).toMatchObject({
      status: "clean",
      hasLocalDraft: false,
    });
  });

  it("错误分类不把 Authority 故障降级成普通网络错误", () => {
    const error = toDocumentSaveError({
      error: {
        code: "DOCUMENT_AUTHORITY_BACKUP_MISSING",
        message: "raw internal message",
      },
    });
    expect(error).toBeInstanceOf(DocumentSaveError);
    expect(error.code).toBe("AUTHORITY_BACKUP_MISSING");
    expect(error.retryable).toBe(false);
    expect(getDocumentSaveStatusLabel("authority-degraded")).toContain("工作区");
  });
});
