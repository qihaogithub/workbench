import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ChatInput } from "@workbench/ai-chat-shared/chat/chat-input";
import { configureAiChatShared } from "@workbench/ai-chat-shared/config";
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

describe("AI 输入区附件提交", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:test-attachment"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  function renderAttachmentInput(
    uploadAttachment: jest.Mock,
    onSubmit = jest.fn(),
    onDiagnosticEvent = jest.fn(),
  ) {
    configureAiChatShared({
      getAgentClient: () => ({ uploadAttachment }) as never,
    });
    const result = render(
      <ToastProviderWrapper>
        <ChatInput
          onSubmit={onSubmit}
          onDiagnosticEvent={onDiagnosticEvent}
          onCancel={jest.fn()}
          isStreaming={false}
          agentSessionId="session-1"
          projectId="project-1"
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
          supportsHistory={false}
        />
      </ToastProviderWrapper>,
    );
    return { ...result, onSubmit, onDiagnosticEvent };
  }

  function selectImage(container: HTMLElement) {
    const image = new File([new Uint8Array([1, 2, 3])], "diagram.png", {
      type: "image/png",
    });
    const input = container.querySelector(
      'input[type="file"][accept="image/*"]',
    );
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { files: [image] } });
  }

  it("上传失败时不发送消息，附件保留在输入区并记录可重试诊断", async () => {
    const uploadAttachment = jest
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const { container, onSubmit, onDiagnosticEvent } = renderAttachmentInput(
      uploadAttachment,
    );

    selectImage(container);
    await waitFor(() => expect(screen.getByText("diagram.png")).toBeInTheDocument());
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() =>
      expect(
        screen.getByText("附件上传失败：无法连接 AI 服务，请稍后重试"),
      ).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(onDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ai.attachment_upload_failed",
        details: expect.objectContaining({
          stage: "upload",
          errorKind: "network",
          retryable: true,
        }),
      }),
    );
  });

  it("上传成功后同时提交图片请求内容和聊天附件记录", async () => {
    const uploadAttachment = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: "attachment-1",
        name: "diagram.png",
        mimeType: "image/png",
        size: 3,
        textExtracted: false,
      },
    });
    const { container, onSubmit } = renderAttachmentInput(uploadAttachment);

    selectImage(container);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(uploadAttachment).toHaveBeenCalledWith(
      "session-1",
      "project-1",
      expect.any(File),
    );
    expect(onSubmit).toHaveBeenCalledWith(
      "请结合附件内容处理",
      [
        expect.objectContaining({
          mimeType: "image/png",
          name: "diagram.png",
          data: "AQID",
        }),
      ],
      undefined,
      [expect.objectContaining({ id: "attachment-1" })],
    );
  });
});
