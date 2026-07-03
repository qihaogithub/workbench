import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProviderWrapper, useToast } from "./toast-provider";

jest.mock("@/components/ui/toast", () => {
  const React = require("react");

  return {
    ToastProvider: ({ children, duration }: { children: React.ReactNode; duration?: number }) => (
      <div data-testid="toast-provider" data-duration={duration}>
        {children}
      </div>
    ),
    ToastViewport: () => <div data-testid="toast-viewport" />,
    Toast: ({ children }: { children: React.ReactNode }) => (
      <div role="status">{children}</div>
    ),
    ToastTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ToastDescription: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ToastClose: () => <button type="button">关闭</button>,
  };
});

function ToastTrigger() {
  const { toast } = useToast();

  return (
    <button
      type="button"
      onClick={() =>
        toast({
          title: "页面结构已更新",
          description: "已自动刷新当前页面结构。",
        })
      }
    >
      show toast
    </button>
  );
}

describe("ToastProviderWrapper", () => {
  it("使用 3 秒全局展示时长并渲染 toast 内容", async () => {
    const user = userEvent.setup();

    render(
      <ToastProviderWrapper>
        <ToastTrigger />
      </ToastProviderWrapper>
    );

    expect(screen.getByTestId("toast-provider")).toHaveAttribute("data-duration", "3000");

    await user.click(screen.getByRole("button", { name: "show toast" }));

    expect(screen.getByRole("status")).toHaveTextContent("页面结构已更新");
    expect(screen.getByRole("status")).toHaveTextContent("已自动刷新当前页面结构。");
  });
});
