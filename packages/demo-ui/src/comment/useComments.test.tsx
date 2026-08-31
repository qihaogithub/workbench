import { act, renderHook, waitFor } from "@testing-library/react";
import type { CommentApiAdapter } from "./types";
import type {
  CommentTarget,
  CommentThread,
  CommentWsEvent,
} from "@workbench/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useComments } from "./useComments";

function createThread(id: string, target: CommentTarget): CommentThread {
  return {
    id,
    projectId: "project_1",
    target,
    content: id,
    author: { id: "user_1", name: "用户", isAnonymous: false },
    createdAt: 1,
    updatedAt: 1,
    resolved: false,
    replies: [],
  };
}

function createApi(threads: CommentThread[]): CommentApiAdapter {
  return {
    listComments: vi.fn().mockResolvedValue(threads),
    createComment: async () => {
      throw new Error("not used in this test");
    },
    addReply: async () => {
      throw new Error("not used in this test");
    },
    updateComment: async () => {
      throw new Error("not used in this test");
    },
    updateReply: async () => {
      throw new Error("not used in this test");
    },
    setResolved: async () => {
      throw new Error("not used in this test");
    },
    deleteThread: async () => {
      throw new Error("not used in this test");
    },
    deleteReply: async () => {
      throw new Error("not used in this test");
    },
    listMentionCandidates: async () => [],
  };
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.(new Event("open"));
  }

  emit(event: CommentWsEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
}

afterEach(() => {
  MockWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("useComments target scope", () => {
  it("页面 target 的 REST 与 WS 更新都只保留当前页面线程", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const pageTarget = { kind: "page", pageId: "page_a" } as const;
    const pageThread = createThread("page", pageTarget);
    const documentThread = createThread("document", {
      kind: "document",
      resourceId: "docs/brief.md",
      resourceLabel: "需求说明",
    });
    const api = createApi([pageThread, documentThread]);

    const { result } = renderHook(() =>
      useComments({
        projectId: "project_1",
        target: pageTarget,
        api,
        wsUrl: "ws://comments.test",
      }),
    );

    await waitFor(() =>
      expect(api.listComments).toHaveBeenCalledWith(pageTarget),
    );
    await waitFor(() => expect(result.current.threads).toEqual([pageThread]));
    const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      socket.open();
      socket.emit({ type: "comment:created", thread: documentThread });
    });

    expect(result.current.threads).toEqual([pageThread]);
  });

  it("不传 target 时通过 REST 和 WS 维护整个项目的线程", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const pageThread = createThread("page", { kind: "page", pageId: "page_a" });
    const documentThread = createThread("document", {
      kind: "document",
      resourceId: "docs/brief.md",
      resourceLabel: "需求说明",
    });
    const api = createApi([pageThread]);

    const { result } = renderHook(() =>
      useComments({
        projectId: "project_1",
        api,
        wsUrl: "ws://comments.test",
      }),
    );

    await waitFor(() =>
      expect(api.listComments).toHaveBeenCalledWith(undefined),
    );
    await waitFor(() => expect(result.current.threads).toEqual([pageThread]));
    const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      socket.open();
      socket.emit({ type: "comment:created", thread: documentThread });
    });

    expect(result.current.threads).toEqual([pageThread, documentThread]);
  });
});
