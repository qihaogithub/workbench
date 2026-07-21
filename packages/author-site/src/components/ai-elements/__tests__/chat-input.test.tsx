import { fireEvent, render, screen } from "@testing-library/react";

import { ChatInput } from "@workbench/ai-chat-shared/chat/chat-input";
import { ToastProviderWrapper } from "@/components/ui/toast-provider";

describe("AI 输入区附件入口", () => {
  it("使用单一加号气泡菜单分流图片和附件", () => {
    const { container } = render(
      <ToastProviderWrapper>
        <ChatInput
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
          isStreaming={false}
          agentSessionId="session-1"
          onHistoryClick={jest.fn()}
          onModelChange={jest.fn()}
          onDepthChange={jest.fn()}
          currentModelId="model-1"
          currentDepth={null}
          availableDepths={[]}
          models={[]}
          canSwitch={false}
          isModelLoading={false}
          supportsImages
          supportsFiles
          supportsHistory
        />
      </ToastProviderWrapper>,
    );

    expect(screen.queryByRole("button", { name: "添加图片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加文件" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加图片或附件" }));

    expect(screen.getByRole("button", { name: "添加图片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"][accept="image/*"]'))
      .toBeInTheDocument();
    expect(
      container.querySelector('input[type="file"][accept*=".pdf"]'),
    ).toBeInTheDocument();
  });
});
