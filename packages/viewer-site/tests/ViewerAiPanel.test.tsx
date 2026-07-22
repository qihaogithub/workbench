import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroySession: vi.fn().mockResolvedValue(undefined),
  readLocalChatSessions: vi.fn(),
  writeLocalChatSession: vi.fn(),
}));

const storedSession = {
  sessionId: "stored-session",
  projectId: "project-1",
  title: "历史问题",
  createdAt: 100,
  updatedAt: 200,
  messages: [{ id: "stored-message", role: "user", content: "上次的问题" }],
};

vi.mock("@workbench/agent-client", () => ({
  AgentClient: class {
    destroySession = mocks.destroySession;
  },
}));

vi.mock("@workbench/ai-chat-shared", () => ({
  AIChat: ({
    sessionId,
    externalMessages,
    onMessagesChange,
  }: {
    sessionId: string;
    externalMessages: Array<{ id: string; role: string; content: string }>;
    onMessagesChange: (
      messages: Array<{ id: string; role: string; content: string }>,
    ) => void;
  }) => (
    <div>
      <output data-testid="session-id">{sessionId}</output>
      <output data-testid="message-count">{externalMessages.length}</output>
      <button
        type="button"
        onClick={() =>
          onMessagesChange([
            ...externalMessages,
            { id: "current-message", role: "user", content: "本次的问题" },
          ])
        }
      >
        添加当前消息
      </button>
    </div>
  ),
  ToastProviderWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  configureAiChatShared: vi.fn(),
  deleteLocalChatSession: vi.fn(),
  deriveLocalChatTitle: vi.fn(() => "本次的问题"),
  readLocalChatSessions: mocks.readLocalChatSessions,
  writeLocalChatSession: mocks.writeLocalChatSession,
}));

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ReactModule.forwardRef<
      HTMLButtonElement,
      React.ButtonHTMLAttributes<HTMLButtonElement>
    >(({ children, ...props }, ref) => (
      <button ref={ref} {...props}>
        {children}
      </button>
    )),
  };
});

vi.mock("../src/components/ViewerAiHistoryDialog", () => ({
  ViewerAiHistoryDialog: ({
    sessions,
    onSelect,
  }: {
    sessions: typeof storedSession[];
    onSelect: (session: typeof storedSession) => void;
  }) => (
    <button type="button" onClick={() => onSelect(sessions[0])}>
      恢复历史
    </button>
  ),
}));

import { ViewerAiPanel } from "../src/components/ViewerAiPanel";

const baseProps = {
  projectId: "project-1",
  projectName: "演示项目",
  activePageId: "page-1",
  activePageName: "首页",
  onOpenChange: vi.fn(),
};

describe("浏览端 AI 会话生命周期", () => {
  beforeEach(() => {
    mocks.readLocalChatSessions.mockReturnValue([storedSession]);
    mocks.writeLocalChatSession.mockClear();
    mocks.destroySession.mockClear();
    baseProps.onOpenChange.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("页面重新挂载时默认创建新对话，不自动恢复最近历史", async () => {
    render(<ViewerAiPanel {...baseProps} open />);

    await waitFor(() => {
      expect(mocks.readLocalChatSessions).toHaveBeenCalledWith("project-1");
    });
    expect(screen.getByTestId("session-id").textContent).toMatch(
      /^viewer-project-1-/,
    );
    expect(screen.getByTestId("session-id").textContent).not.toBe(
      storedSession.sessionId,
    );
    expect(screen.getByTestId("message-count").textContent).toBe("0");
  });

  it("同一页面内收起再打开时保留当前对话", () => {
    const view = render(<ViewerAiPanel {...baseProps} open />);
    const sessionId = screen.getByTestId("session-id").textContent;

    fireEvent.click(screen.getByRole("button", { name: "添加当前消息" }));
    expect(screen.getByTestId("message-count").textContent).toBe("1");

    view.rerender(<ViewerAiPanel {...baseProps} open={false} />);
    view.rerender(<ViewerAiPanel {...baseProps} open />);

    expect(screen.getByTestId("session-id").textContent).toBe(sessionId);
    expect(screen.getByTestId("message-count").textContent).toBe("1");
  });

  it("仍可从历史记录手动恢复旧对话", async () => {
    render(<ViewerAiPanel {...baseProps} open />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "恢复历史" })).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "恢复历史" }));

    expect(screen.getByTestId("session-id").textContent).toBe(
      storedSession.sessionId,
    );
    expect(screen.getByTestId("message-count").textContent).toBe("1");
  });
});
