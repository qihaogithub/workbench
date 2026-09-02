import { render, screen, within } from "@testing-library/react";

import { HistoryDialog } from "@workbench/ai-chat-shared/history-dialog";
import { Popover } from "@workbench/ai-chat-shared/ui/popover";

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

  it("长标题不会撑破锚定菜单，并隐藏技术元数据", async () => {
    const onNewSession = jest.fn();
    render(
      <Popover open>
        <HistoryDialog
          open
          onOpenChange={jest.fn()}
          projectId="project-1"
          workspaceId="workspace-1"
          currentSessionId="session-current"
          onSelectSession={jest.fn()}
          onNewSession={onNewSession}
        />
      </Popover>,
    );

    const dialog = screen.getByRole("dialog", { name: "对话历史" });
    expect(dialog).toHaveClass(
      "w-[min(360px,calc(100vw-1rem))]",
      "max-w-[calc(100vw-1rem)]",
      "min-w-0",
      "overflow-hidden",
      "rounded-xl",
      "shadow-xl",
    );
    expect(dialog).toHaveAttribute("data-side", "top");
    expect(document.querySelector('[data-radix-dialog-overlay]')).toBeNull();

    const newSessionButton = within(dialog).getByRole("button", {
      name: "新建对话",
    });
    expect(newSessionButton).toHaveClass("h-7", "shrink-0", "px-2");
    expect(newSessionButton).toHaveTextContent("新建对话");
    expect(newSessionButton).toHaveAttribute("title", "新建对话");
    expect(newSessionButton).not.toHaveClass("w-7");
    expect(newSessionButton).not.toHaveClass("w-full");
    newSessionButton.click();
    expect(onNewSession).toHaveBeenCalledWith("workspace-1");

    const title = await screen.findByText(/请根据右侧属性面板中的结构化变量修改当前页面/);
    expect(title).toHaveClass("truncate", "text-sm", "font-semibold");
    expect(screen.queryByText(/Session:/)).toBeNull();
    expect(screen.queryByText("未保存")).toBeNull();
    expect(screen.queryByText("已过期")).toBeNull();
    expect(screen.queryByText(/刚刚|分钟前|小时前|天前/)).toBeNull();

    const sessionRow = title.closest('[class*="items-center"][class*="rounded-lg"]');
    expect(sessionRow).not.toBeNull();
    const actions = within(sessionRow as HTMLElement).getByLabelText("导出对话").parentElement;
    expect(actions).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-within:opacity-100",
    );
  });

  it("使用宿主侧栏宽度覆盖不稳定的 Radix 锚点测量", () => {
    render(
      <Popover open>
        <HistoryDialog
          open
          popoverWidth={320}
          onOpenChange={jest.fn()}
          projectId="project-1"
          currentSessionId="session-current"
          onSelectSession={jest.fn()}
          onNewSession={jest.fn()}
        />
      </Popover>,
    );

    expect(screen.getByRole("dialog", { name: "对话历史" })).toHaveStyle({
      width: "320px",
    });
  });
});
