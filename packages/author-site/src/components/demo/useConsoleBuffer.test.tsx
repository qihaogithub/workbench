"use client";

import { renderHook, act } from "@testing-library/react";
import type { RefObject } from "react";
import { useConsoleBuffer } from "./useConsoleBuffer";
import type { StreamService } from "@/components/ai-elements/chat/services/stream-service";
import type { ConsoleLogPayload } from "@workbench/demo-ui";

describe("useConsoleBuffer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createEntry(index: number): ConsoleLogPayload {
    return {
      level: "log",
      args: `message-${index}`,
      timestamp: 1_700_000_000_000 + index,
    };
  }

  function createStreamServiceRef(send: jest.Mock): RefObject<StreamService | null> {
    return {
      current: {
        ws: {
          readyState: WebSocket.OPEN,
          send,
        },
      } as unknown as StreamService,
    };
  }

  it("100ms 内合并控制台日志并通过 console_data 转发", () => {
    const send = jest.fn();
    const streamServiceRef = createStreamServiceRef(send);
    const { result, unmount } = renderHook(() => useConsoleBuffer(streamServiceRef));

    act(() => {
      result.current.handleConsoleEntry(createEntry(1));
      result.current.handleConsoleEntry(createEntry(2));
    });

    expect(send).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({
      type: "console_data",
      entries: [createEntry(1), createEntry(2)],
    });

    unmount();
  });

  it("清理后不会发送待转发日志", () => {
    const send = jest.fn();
    const streamServiceRef = createStreamServiceRef(send);
    const { result, unmount } = renderHook(() => useConsoleBuffer(streamServiceRef));

    act(() => {
      result.current.handleConsoleEntry(createEntry(1));
      result.current.clearBuffer();
      jest.advanceTimersByTime(100);
    });

    expect(send).not.toHaveBeenCalled();
    unmount();
  });
});
