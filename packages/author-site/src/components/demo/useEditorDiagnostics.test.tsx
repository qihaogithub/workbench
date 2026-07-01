"use client";

import { act, renderHook } from "@testing-library/react";

import { useEditorDiagnostics } from "./useEditorDiagnostics";

describe("useEditorDiagnostics", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    jest.useFakeTimers();
    window.history.pushState({}, "", "/demo/project-1/edit?diagnostics=1");
    URL.createObjectURL = jest.fn(() => "blob:diagnostics");
    URL.revokeObjectURL = jest.fn();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/editor-diagnostics/export")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              editorSessionId: "editor-1",
              exportedAt: 1,
              events: [],
              agentRunLogs: [],
              warnings: [],
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { written: 1 },
        }),
      } as Response;
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("批量上报事件并导出本地缓冲", async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation();
    const { result, unmount } = renderHook(() =>
      useEditorDiagnostics({
        projectId: "project-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        activePageId: "page-1",
        previewMode: "single",
        getSnapshot: () => ({ ok: true }),
      }),
    );

    act(() => {
      result.current.recordEvent({
        category: "autosave",
        name: "autosave.flush_started",
      });
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/editor-diagnostics/events",
      expect.objectContaining({
        method: "POST",
      }),
    );

    await act(async () => {
      await result.current.exportDiagnostics();
    });

    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    unmount();
  });
});
