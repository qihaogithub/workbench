import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AIChat } from "../ai-chat";
import type { ChatMessage } from "../message";

const handleCancelQueuedMessage = jest.fn();

jest.mock(
  "streamdown",
  () => ({
    Streamdown: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="streamdown-renderer">{children}</div>
    ),
  }),
  { virtual: true },
);

jest.mock("@streamdown/code", () => ({ code: {} }), { virtual: true });
jest.mock("@streamdown/mermaid", () => ({ mermaid: {} }), { virtual: true });
jest.mock("@streamdown/math", () => ({ math: {} }), { virtual: true });
jest.mock("@streamdown/cjk", () => ({ cjk: {} }), { virtual: true });

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("../chat/hooks/use-chat-models", () => ({
  useChatModels: () => ({
    modelState: {
      currentModelId: "deepseek-v4-flash",
      currentDepth: null,
      models: [],
      canSwitch: true,
      isLoading: false,
    },
    currentAvailableDepths: [],
    handleModelChange: jest.fn(),
    handleDepthChange: jest.fn(),
    handleModelsEvent: jest.fn(),
    handleModelError: jest.fn(),
    resetModelState: jest.fn(),
  }),
}));

jest.mock("../chat/hooks/use-chat-stream", () => ({
  useChatStream: () => ({
    plan: { items: [], fallbackText: "" },
    pendingPermissionRequest: null,
    silenceSeconds: null,
    memoryFilePathsRef: { current: new Set<string>() },
    handleSend: jest.fn(),
    handleCancel: jest.fn(),
    handleRegenerate: jest.fn(),
    handleRollback: jest.fn(),
    handleEditResend: jest.fn(),
    handleCancelQueuedMessage,
    handlePermissionResponse: jest.fn(),
    handlePermissionCancel: jest.fn(),
    handleUserChoiceResponse: jest.fn(),
  }),
}));

describe("AIChat 排队消息吸附输入框上方", () => {
  beforeEach(() => {
    handleCancelQueuedMessage.mockClear();
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    Element.prototype.scrollTo = jest.fn();
  });

  it("排队消息只在输入框上方队列栏展示并支持取消", async () => {
    const user = userEvent.setup();
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "已发送消息",
      },
      {
        id: "user-queued",
        role: "user",
        content: "排队消息",
        queueId: "queue-1",
        queueStatus: "queued",
      },
    ];

    render(
      <AIChat
        sessionId="session-1"
        agentSessionId="agent-session-1"
        externalMessages={messages}
      />,
    );

    const tray = screen.getByTestId("queued-messages-tray");
    expect(within(tray).getByText("排队消息")).toBeInTheDocument();
    expect(within(tray).getByText("等待发送")).toBeInTheDocument();
    expect(screen.getAllByText("排队消息")).toHaveLength(1);

    await user.click(within(tray).getByRole("button", { name: "取消" }));

    expect(handleCancelQueuedMessage).toHaveBeenCalledWith("queue-1");
  });
});
