import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useWorkspaceAuthorityState,
  type UseWorkspaceAuthorityStateOptions,
} from "../hooks/useWorkspaceAuthorityState";

const mockReadState = jest.fn();
const mockReadEvents = jest.fn();
const mockReadAcks = jest.fn();
const mockAckPreview = jest.fn();

jest.mock("@/lib/workspace-authority-browser-client", () => ({
  readWorkspaceAuthorityStateFromBrowser: (...args: unknown[]) =>
    mockReadState(...args),
  readWorkspaceAuthorityEventsFromBrowser: (...args: unknown[]) =>
    mockReadEvents(...args),
  readWorkspaceProjectionAcksFromBrowser: (...args: unknown[]) =>
    mockReadAcks(...args),
  acknowledgeWorkspaceProjectionFromBrowser: (...args: unknown[]) =>
    mockAckPreview(...args),
}));

const BASE_OPTIONS: UseWorkspaceAuthorityStateOptions = {
  projectId: "proj-1",
  workspaceId: "ws-1",
  sessionId: "sess-1",
  pollIntervalMs: 1000,
};

describe("useWorkspaceAuthorityState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockReadState.mockResolvedValue({
      workspaceId: "ws-1",
      projectId: "proj-1",
      revision: 5,
      rootHash: "root-h5",
      resourceHashes: { "src/index.ts": "h1" },
      updatedAt: Date.now(),
    });
    mockReadEvents.mockResolvedValue([]);
    mockReadAcks.mockResolvedValue([]);
    mockAckPreview.mockResolvedValue({ acknowledged: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("初始化时应拉取 Authority 状态", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.committedRevision).toBe(5);
    expect(result.current.committedRootHash).toBe("root-h5");
  });

  it("markDraftChanged 应递增 draftVersion", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    expect(result.current.draftVersion).toBe(0);

    act(() => {
      result.current.markDraftChanged();
    });

    expect(result.current.draftVersion).toBe(1);

    act(() => {
      result.current.markDraftChanged();
    });

    expect(result.current.draftVersion).toBe(2);
  });

  it("轮询事件应更新 committedRevision", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(result.current.committedRevision).toBe(5);
    });

    // 模拟新事件
    mockReadEvents.mockResolvedValueOnce([
      {
        type: "workspace_mutation_committed",
        receipt: {
          committed: true,
          mutationId: "m-1",
          projectId: "proj-1",
          workspaceId: "ws-1",
          baseRevision: 5,
          revision: 6,
          rootHash: "root-h6",
          actor: "author-site",
          resources: [],
          committedAt: Date.now(),
        },
      },
    ]);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.committedRevision).toBe(6);
      expect(result.current.committedRootHash).toBe("root-h6");
    });
  });

  it("轮询事件应检测 revision gap", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(result.current.committedRevision).toBe(5);
    });

    // 模拟 revision 跳跃（5 → 8）
    mockReadEvents.mockResolvedValueOnce([
      {
        type: "workspace_mutation_committed",
        receipt: {
          committed: true,
          mutationId: "m-2",
          projectId: "proj-1",
          workspaceId: "ws-1",
          baseRevision: 7,
          revision: 8,
          rootHash: "root-h8",
          actor: "author-site",
          resources: [],
          committedAt: Date.now(),
        },
      },
    ]);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.hasGap).toBe(true);
      expect(result.current.committedRevision).toBe(8);
    });
  });

  it("拉取失败时应设置 isConnected = false", async () => {
    mockReadState.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });
  });

  it("单次轮询失败不应标记离线，连续两次失败后才标记", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // 第一次轮询失败（瞬时网络抖动），不应标记离线
    mockReadEvents.mockRejectedValueOnce(new Error("transient error"));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // 第二次轮询失败，达到阈值后标记离线
    mockReadEvents.mockRejectedValueOnce(new Error("transient error"));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // 后续轮询成功，应恢复 isConnected
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("ackPreview 应更新 previewAppliedRevision", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    act(() => {
      result.current.ackPreview(5 as never, "applied");
    });

    expect(result.current.previewAppliedRevision).toBe(5);
    expect(result.current.previewStatus).toBe("applied");
    expect(mockAckPreview).toHaveBeenCalledTimes(1);
  });

  it("投影 ack 使用独立 revision 游标并发布给对话摘要回流", async () => {
    const projectionAck = {
      projectId: "proj-1",
      workspaceId: "ws-1",
      revision: 5,
      clientId: "client-1",
      surface: "active-preview" as const,
      status: "applied" as const,
      acknowledgedAt: Date.now(),
    };
    const listener = jest.fn();
    window.addEventListener("workspace-projection-acknowledged", listener);
    mockReadAcks.mockResolvedValueOnce([projectionAck]);

    try {
      const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await waitFor(() => {
        expect(result.current.committedRevision).toBe(5);
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.previewAppliedRevision).toBe(5);
      });
      expect(mockReadAcks).toHaveBeenCalledWith(
        expect.objectContaining({ afterRevision: 0 }),
      );
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            projectId: "proj-1",
            workspaceId: "ws-1",
            sessionId: "sess-1",
            ack: projectionAck,
          }),
        }),
      );
    } finally {
      window.removeEventListener("workspace-projection-acknowledged", listener);
    }
  });

  it("setCanonicalStatus 应更新 canonical 状态", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    act(() => {
      result.current.setCanonicalStatus("lagging", 3);
    });

    expect(result.current.canonicalStatus).toBe("lagging");
    expect(result.current.canonicalSyncedRevision).toBe(3);
  });

  it("setConflict 应设置冲突", async () => {
    const { result } = renderHook(() => useWorkspaceAuthorityState(BASE_OPTIONS));

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    act(() => {
      result.current.setConflict({
        resourcePath: "src/index.ts",
        localHash: "local-h",
        serverHash: "server-h",
      });
    });

    expect(result.current.conflict).toEqual({
      resourcePath: "src/index.ts",
      localHash: "local-h",
      serverHash: "server-h",
    });

    act(() => {
      result.current.setConflict(null);
    });

    expect(result.current.conflict).toBeNull();
  });

  it("enabled = false 时不应拉取状态", async () => {
    const { result } = renderHook(() =>
      useWorkspaceAuthorityState({ ...BASE_OPTIONS, enabled: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    expect(mockReadState).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it("标识未就绪时默认保持禁用，refresh 与 ack 也不应发请求", async () => {
    const { result } = renderHook(() =>
      useWorkspaceAuthorityState({
        ...BASE_OPTIONS,
        workspaceId: "",
        sessionId: "",
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await result.current.refresh();
      result.current.ackPreview(1 as never, "applied");
    });

    expect(mockReadState).not.toHaveBeenCalled();
    expect(mockReadEvents).not.toHaveBeenCalled();
    expect(mockReadAcks).not.toHaveBeenCalled();
    expect(mockAckPreview).not.toHaveBeenCalled();
  });
});
