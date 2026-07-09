import { act, renderHook } from "@testing-library/react";

import { useChatMessages } from "../chat/hooks/use-chat-messages";

describe("useChatMessages", () => {
  it("受控 streaming 状态在同一轮旧闭包内从 true 回到 false 时仍通知父层", () => {
    const onIsStreamingChange = jest.fn();
    const { result } = renderHook(() =>
      useChatMessages({
        externalIsStreaming: false,
        onIsStreamingChange,
      }),
    );

    act(() => {
      result.current.setIsStreaming(true);
      result.current.setIsStreaming(false);
    });

    expect(onIsStreamingChange).toHaveBeenNthCalledWith(1, true);
    expect(onIsStreamingChange).toHaveBeenNthCalledWith(2, false);
  });
});
