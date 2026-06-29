"use client";

import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import type { CanvasState } from "@opencode-workbench/demo-ui";
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

  it("画布布局变更后标记未保存，项目保存确认后清除状态", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          if (init?.method === "POST") {
            return jsonFetchResponse({ success: true, data: {} });
          }
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

    await waitFor(() => {
      expect(result.current.hasUnsavedCanvasChanges).toBe(true);
      expect(result.current.saveStatus).toBe("saved");
    });

    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        getFetchUrl(input).includes("/api/sessions/session_1/canvas-layout") &&
        init?.method === "POST",
    );
    expect(saveCall).toBeDefined();

    const body = JSON.parse(String(saveCall?.[1]?.body)) as {
      projectId: string;
      state: CanvasState;
    };
    expect(body.projectId).toBe("project_1");
    expect(body.state.pages.page_1).toEqual(nextState.pages.page_1);

    act(() => {
      result.current.markCanvasChangesSaved();
    });

    expect(result.current.hasUnsavedCanvasChanges).toBe(false);
  });

  it("自动保存写入布局后仍保留项目未保存状态", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          if (init?.method === "POST") {
            return jsonFetchResponse({ success: true, data: {} });
          }
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

    await act(async () => {
      jest.advanceTimersByTime(700);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.saveStatus).toBe("saved");
    });
    expect(result.current.hasUnsavedCanvasChanges).toBe(true);
  });

  it("画布状态更新后立即强制保存时写入最新状态", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/sessions/session_1/canvas-layout")) {
          if (init?.method === "POST") {
            return jsonFetchResponse({ success: true, data: {} });
          }
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

    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        getFetchUrl(input).includes("/api/sessions/session_1/canvas-layout") &&
        init?.method === "POST",
    );
    expect(saveCall).toBeDefined();

    const body = JSON.parse(String(saveCall?.[1]?.body)) as {
      state: CanvasState;
    };
    expect(body.state.pages.page_1).toEqual(latestState.pages.page_1);
    const savedTextNode = body.state.nodes?.text_1;
    expect(savedTextNode?.kind).toBe("text");
    if (savedTextNode?.kind === "text") {
      expect(savedTextNode.text).toBe("立即退出前的文字");
    }
  });
});
