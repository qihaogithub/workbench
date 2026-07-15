"use client";

import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import type { CanvasState } from "@workbench/demo-ui";
import { useCanvasWorkspace } from "./useCanvasWorkspace";

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function jsonFetchResponse(body: unknown, init?: { status?: number }): Response {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("useCanvasWorkspace", () => {
  const originalFetch = global.fetch;
  const originalWindowFetch = window.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    window.fetch = originalWindowFetch;
  });

  it("画布布局变更后标记未保存，flushCanvasState 清除 dirty 但不发送 HTTP（Yjs-First）", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          return jsonFetchResponse({
            success: true,
            data: { state: null },
          });
        }
        return jsonFetchResponse({ success: false }, { status: 404 });
      },
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() =>
      useCanvasWorkspace({ sessionId: "session_1", projectId: "project_1" }),
    );

    await waitFor(() => {
      expect(result.current.saveStatus).toBe("idle");
    });

    const nextState: CanvasState = {
      viewport: { x: 40, y: 40, zoom: 0.5 },
      pages: {
        page_1: { x: 160, y: 180, width: 375, height: 812 },
      },
      nodes: {},
    };

    act(() => {
      result.current.setCanvasState(nextState);
    });

    await waitFor(() => {
      expect(result.current.hasUnsavedCanvasChanges).toBe(true);
    });

    await act(async () => {
      await result.current.flushCanvasState();
    });

    // Yjs-First: flushCanvasState 只清除本地 dirty 标记，不发送 HTTP POST
    // hasUnsavedCanvasChanges 由 markCanvasChangesSaved 清除
    expect(result.current.hasUnsavedCanvasChanges).toBe(true);
    expect(result.current.saveStatus).toBe("idle");

    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        getFetchUrl(input).includes("/api/sessions/session_1/canvas-layout") &&
        init?.method === "POST",
    );
    expect(saveCall).toBeUndefined();

    act(() => {
      result.current.markCanvasChangesSaved();
    });

    expect(result.current.hasUnsavedCanvasChanges).toBe(false);
  });

  it("Yjs-First: 画布变更后不会触发自动 HTTP 保存", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          return jsonFetchResponse({
            success: true,
            data: { state: null },
          });
        }
        return jsonFetchResponse({ success: false }, { status: 404 });
      },
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() =>
      useCanvasWorkspace({ sessionId: "session_1", projectId: "project_1" }),
    );

    await waitFor(() => {
      expect(result.current.saveStatus).toBe("idle");
    });

    jest.useFakeTimers();

    act(() => {
      result.current.setCanvasState({
        viewport: { x: 40, y: 40, zoom: 0.5 },
        pages: {
          page_1: { x: 160, y: 180, width: 375, height: 812 },
        },
        nodes: {},
      });
    });

    expect(result.current.hasUnsavedCanvasChanges).toBe(true);

    // Yjs-First: 不再有 700ms 自动保存定时器
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // saveStatus 保持 idle，不变为 saved
    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.hasUnsavedCanvasChanges).toBe(true);

    // 不应有 POST 请求
    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        getFetchUrl(input).includes("/api/sessions/session_1/canvas-layout") &&
        init?.method === "POST",
    );
    expect(saveCall).toBeUndefined();
  });

  it("Yjs-First: flushCanvasState 清除 dirty 但不发送 HTTP POST", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          return jsonFetchResponse({
            success: true,
            data: { state: null },
          });
        }
        return jsonFetchResponse({ success: false }, { status: 404 });
      },
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() =>
      useCanvasWorkspace({ sessionId: "session_1", projectId: "project_1" }),
    );

    await waitFor(() => {
      expect(result.current.saveStatus).toBe("idle");
    });

    const latestState: CanvasState = {
      viewport: { x: 40, y: 40, zoom: 0.5 },
      pages: {
        page_1: { x: 220, y: 260, width: 375, height: 812 },
      },
      nodes: {
        text_1: {
          id: "text_1",
          kind: "text",
          title: "文字",
          text: "立即退出前的文字",
          fontSize: 18,
          color: "#111827",
          layout: { x: 480, y: 180, width: 180, height: 64 },
          createdAt: 1782630000000,
          updatedAt: 1782630000001,
        },
      },
    };

    await act(async () => {
      result.current.setCanvasState(latestState);
      await result.current.flushCanvasState();
    });

    // Yjs-First: flushCanvasState 不发送 HTTP POST
    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        getFetchUrl(input).includes("/api/sessions/session_1/canvas-layout") &&
        init?.method === "POST",
    );
    expect(saveCall).toBeUndefined();

    // canvas state 仍然保留最新值
    expect(result.current.canvasState.pages.page_1).toEqual(
      latestState.pages.page_1,
    );
    const savedTextNode = result.current.canvasState.nodes?.text_1;
    expect(savedTextNode?.kind).toBe("text");
    if (savedTextNode?.kind === "text") {
      expect(savedTextNode.text).toBe("立即退出前的文字");
    }
  });
});
