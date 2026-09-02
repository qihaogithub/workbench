import { fireEvent, render, screen } from "@testing-library/react";

import { ChatInput } from "@workbench/ai-chat-shared/chat/chat-input";
import { Popover, PopoverContent } from "@workbench/ai-chat-shared/ui/popover";
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

  it("历史按钮通过共享 Popover 打开上方菜单，并支持 Escape 关闭", () => {
    const onHistoryClick = jest.fn();
    render(
      <ToastProviderWrapper>
        <Popover>
          <ChatInput
            onSubmit={jest.fn()}
            onCancel={jest.fn()}
            isStreaming={false}
            agentSessionId="session-1"
            onHistoryClick={onHistoryClick}
            historyPopoverEnabled
            onModelChange={jest.fn()}
            onDepthChange={jest.fn()}
            currentModelId="model-1"
            currentDepth={null}
            availableDepths={[]}
            models={[]}
            canSwitch={false}
            isModelLoading={false}
            supportsHistory
          />
          <PopoverContent side="top">历史菜单内容</PopoverContent>
        </Popover>
      </ToastProviderWrapper>,
    );

    const historyButton = screen.getByRole("button", { name: "对话历史" });
    expect(historyButton).toHaveAttribute("title", "对话历史");
    fireEvent.click(historyButton);
    expect(onHistoryClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("历史菜单内容")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.querySelector('[data-radix-dialog-overlay]')).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("历史菜单内容")).not.toBeInTheDocument();
  });

  it("AI 流式输出期间禁用历史按钮", () => {
    const onHistoryClick = jest.fn();
    render(
      <ToastProviderWrapper>
        <Popover>
          <ChatInput
            onSubmit={jest.fn()}
            onCancel={jest.fn()}
            isStreaming
            agentSessionId="session-1"
            onHistoryClick={onHistoryClick}
            historyPopoverEnabled
            onModelChange={jest.fn()}
            onDepthChange={jest.fn()}
            currentModelId="model-1"
            currentDepth={null}
            availableDepths={[]}
            models={[]}
            canSwitch={false}
            isModelLoading={false}
            supportsHistory
          />
        </Popover>
      </ToastProviderWrapper>,
    );

    const historyButton = screen.getByRole("button", { name: "对话历史" });
    expect(historyButton).toBeDisabled();
    fireEvent.click(historyButton);
    expect(onHistoryClick).not.toHaveBeenCalled();
  });

  it("添加元素引用标签时不为隐藏删除控件预留右侧空白", () => {
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
          selectedElement={{ id: "element-1", label: "图片", context: "img" }}
        />
      </ToastProviderWrapper>,
    );

    const tag = container.querySelector('[data-tag-id="element-1"]');
    expect(tag).toHaveClass("relative");
    expect(tag).toHaveClass("rounded-md");
    expect(tag).toHaveClass("pl-1", "pr-2");
    const removeControl = tag?.querySelector("span:last-child");
    expect(removeControl).toHaveClass("absolute", "pointer-events-none");
    expect(removeControl).not.toHaveClass("ml-0.5", "shrink-0");
  });
});
