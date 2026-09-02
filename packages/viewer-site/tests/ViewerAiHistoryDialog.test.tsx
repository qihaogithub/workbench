import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LocalChatSession } from "@workbench/ai-chat-shared";
import { Popover } from "../src/components/ui/popover";
import { ViewerAiHistoryDialog } from "../src/components/ViewerAiHistoryDialog";

describe("ViewerAiHistoryDialog", () => {
  it("只显示标题，时间和技术元数据不进入列表", () => {
    const onNew = vi.fn();
    const sessions: LocalChatSession[] = [
      {
        sessionId: "session-1",
        projectId: "project-1",
        title: "优化页面布局",
        createdAt: Date.now() - 60_000,
        updatedAt: Date.now() - 10_000,
        messages: [{ role: "user", content: "优化页面布局" }],
      },
    ];

    render(
      <Popover open>
        <ViewerAiHistoryDialog
          sessions={sessions}
          currentSessionId="session-1"
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onNew={onNew}
        />
      </Popover>,
    );

    const dialog = screen.getByRole("dialog", { name: "对话历史" });
    expect(dialog.className).toContain("w-[min(360px,calc(100vw-1rem))]");
    expect(dialog.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(dialog.className).toContain("min-w-0");
    expect(within(dialog).getByText("优化页面布局")).toBeTruthy();
    const newSessionButton = within(dialog).getByRole("button", {
      name: "新建对话",
    });
    expect(newSessionButton.className).toContain("h-7");
    expect(newSessionButton.className).toContain("px-2");
    expect(newSessionButton.textContent).toContain("新建对话");
    expect(newSessionButton.getAttribute("title")).toBe("新建对话");
    expect(newSessionButton.className).not.toContain("w-7");
    expect(newSessionButton.className).not.toContain("w-full");
    newSessionButton.click();
    expect(onNew).toHaveBeenCalledOnce();
    expect(within(dialog).queryByText(/刚刚|分钟前|小时前|天前/)).toBeNull();
    expect(within(dialog).queryByText(/Session:/)).toBeNull();
  });
});
