import { render, screen } from "@testing-library/react";

import { ChatMessages } from "@workbench/ai-chat-shared/chat/chat-messages";
import type { ChatMessage } from "@workbench/ai-chat-shared/message";

jest.mock(
  "streamdown",
  () => ({
    Streamdown: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  }),
  { virtual: true },
);

jest.mock("@streamdown/code", () => ({ code: {} }), { virtual: true });
jest.mock("@streamdown/mermaid", () => ({ mermaid: {} }), { virtual: true });
jest.mock("@streamdown/math", () => ({ math: {} }), { virtual: true });
jest.mock("@streamdown/cjk", () => ({ cjk: {} }), { virtual: true });

function renderChatMessages({
  messages,
  currentMessage = { role: "assistant", content: "", parts: [] },
  isStreaming = true,
}: {
  messages: ChatMessage[];
  currentMessage?: ChatMessage;
  isStreaming?: boolean;
}) {
  return render(
    <ChatMessages
      messages={messages}
      currentMessage={currentMessage}
      isStreaming={isStreaming}
      isUserScrolling={false}
      onScrollToBottom={jest.fn()}
      onRegenerate={jest.fn()}
      onExternalAuthConnected={jest.fn()}
      onRollback={jest.fn()}
      onEditResend={jest.fn()}
      messagesRef={{ current: messages }}
      setMessages={jest.fn()}
      handleSend={jest.fn()}
      onUserChoiceResponse={jest.fn()}
    />,
  );
}

describe("ChatMessages 流式占位", () => {
  it("等待首个 assistant 输出时展示处理中点阵", () => {
    renderChatMessages({
      messages: [{ id: "user-1", role: "user", content: "创建页面" }],
    });

    expect(screen.getByTestId("ai-working-indicator")).toBeInTheDocument();
  });

  it("最终 assistant 消息已落入历史后不再渲染空处理中占位", () => {
    renderChatMessages({
      messages: [
        { id: "user-1", role: "user", content: "创建页面" },
        { id: "assistant-1", role: "assistant", content: "页面已创建" },
      ],
    });

    expect(screen.getByText("页面已创建")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-working-indicator")).not.toBeInTheDocument();
  });
});
