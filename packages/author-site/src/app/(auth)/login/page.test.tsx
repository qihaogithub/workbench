import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";

import LoginPage from "./page";

const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();
const mockToast = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("LoginPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams("redirect=%2Fdemo%2Fproject-1");
    mockRouterPush.mockReset();
    mockRouterRefresh.mockReset();
    mockToast.mockReset();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/auth/dingtalk/config")) {
        return {
          json: async () => ({
            success: true,
            data: {
              enabled: true,
              browserOAuthEnabled: true,
              corpId: "ding-corp",
            },
          }),
        } as Response;
      }
      return {
        json: async () => ({
          success: true,
          data: { user: { username: "alice" } },
        }),
      } as Response;
    }) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("defaults to DingTalk login without exposing a registration entry", async () => {
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "钉钉一键登录" })).toHaveClass(
      "bg-[#1677ff]",
    );
    expect(screen.getByRole("button", { name: "账号密码登录" })).toBeInTheDocument();
    expect(screen.queryByText(/注册/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /注册/ })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/dingtalk/config");
    });
  });

  it("switches to password login and keeps the DingTalk fallback", () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "账号密码登录" }));

    expect(screen.getByLabelText("用户名")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用钉钉一键登录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "忘记密码？" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByText(/注册/)).not.toBeInTheDocument();
  });

  it("submits password login using the safe redirect", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "账号密码登录" }));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: " alice " },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "alice", password: "secret" }),
        }),
      );
      expect(mockRouterPush).toHaveBeenCalledWith("/demo/project-1");
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });
});
