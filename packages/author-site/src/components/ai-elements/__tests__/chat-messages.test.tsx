import { render, screen } from "@testing-library/react";

import { ChatMessages } from "@workbench/ai-chat-shared/chat/chat-messages";
import type { ChatMessage } from "@workbench/ai-chat-shared/message";
import { ToastProviderWrapper } from "@workbench/ai-chat-shared";

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
    <ToastProviderWrapper>
      <ChatMessages
        messages={messages}
        currentMessage={currentMessage}
        isStreaming={isStreaming}
        onRegenerate={jest.fn()}
        onExternalAuthConnected={jest.fn()}
        onRollback={jest.fn()}
        onEditResend={jest.fn()}
        messagesRef={{ current: messages }}
        setMessages={jest.fn()}
        handleSend={jest.fn()}
        onUserChoiceResponse={jest.fn()}
      />
    </ToastProviderWrapper>,
  );
}

describe("ChatMessages 流式占位", () => {
  it("等待首个 assistant 输出时展示处理中点阵", async () => {
    renderChatMessages({
      messages: [{ id: "user-1", role: "user", content: "创建页面" }],
    });

    expect(await screen.findByTestId("ai-working-indicator")).toBeInTheDocument();
  });

  it("最终 assistant 消息已落入历史后不再渲染空处理中占位", async () => {
    renderChatMessages({
      messages: [
        { id: "user-1", role: "user", content: "创建页面" },
        { id: "assistant-1", role: "assistant", content: "页面已创建" },
      ],
    });

    expect(await screen.findByText("页面已创建")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-working-indicator")).not.toBeInTheDocument();
  });

  it("仅展示服务端回执确认的 mutation 与 projection 状态", async () => {
    renderChatMessages({
      isStreaming: false,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "页面已更新",
          runSummary: {
            mutations: [
              {
                mutationId: "mutation-1",
                revision: 7,
                status: "committed",
                resources: [
                  { path: "demos/home/prototype.html", action: "modified" },
                ],
                actor: "agent",
              },
            ],
            projections: [
              { revision: 7, surface: "preview", status: "failed" },
            ],
          },
        },
      ],
    });

    expect(await screen.findByText("已提交 1 项修改；1 项预览同步失败")).toBeInTheDocument();
  });
});
