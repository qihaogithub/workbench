import { render, screen, within } from "@testing-library/react";

import { HistoryDialog } from "@workbench/ai-chat-shared/history-dialog";

describe("HistoryDialog 布局", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: [
          {
            sessionId: "session-long-title",
            demoId: "demo-1",
            workspaceId: "workspace-1",
            title:
              "请根据右侧属性面板中的结构化变量修改当前页面。页面运行时：HTML/CSS 原型页 主要文件：demo/prototype.html",
            createdAt: Date.now() - 60 * 60 * 1000,
            expiresAt: Date.now() + 60 * 60 * 1000,
            isExpired: false,
            messageCount: 2,
            lastMessageAt: Date.now() - 30 * 60 * 1000,
            hasUnsavedChanges: true,
          },
        ],
      }),
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("长标题不会撑破弹窗内容宽度", async () => {
    render(
      <HistoryDialog
        open
        onOpenChange={jest.fn()}
        projectId="project-1"
        workspaceId="workspace-1"
        currentSessionId="session-current"
        onSelectSession={jest.fn()}
        onNewSession={jest.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("w-[calc(100vw-2rem)]", "max-w-2xl", "overflow-hidden");

    const newSessionButton = within(dialog).getByRole("button", {
      name: "新建对话",
    });
    expect(newSessionButton).toHaveClass("w-full", "min-w-0");

    const title = await screen.findByText(/请根据右侧属性面板中的结构化变量修改当前页面/);
    expect(title).toHaveClass("min-w-0", "flex-1", "truncate");

    const sessionRow = title.closest('[class*="items-center"][class*="rounded-lg"]');
    expect(sessionRow).toHaveClass("w-full", "min-w-0");
  });
});
