import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import { metadata } from "@/app/page";
import { LandingPage } from "./landing-page";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("LandingPage", () => {
  it("exposes the primary marketing navigation and calls to action", () => {
    render(<LandingPage />);

    for (const link of screen.getAllByRole("link", { name: /进入工作台/ })) {
      expect(link).toHaveAttribute("href", "/workbench");
    }
    for (const link of screen.getAllByRole("link", { name: /阅读用户手册/ })) {
      expect(link).toHaveAttribute("href", "/manual");
    }
    expect(
      screen.queryByRole("link", { name: "登录" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "开始创作" }),
    ).not.toBeInTheDocument();
  });

  it("leads with business positioning and preserves the narrative order", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "真正耗时的，是一个人的想法反复翻译给另一个人",
    );
    expect(
      screen.getByText("面向营销活动业务的 AI 协作平台"),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "真正消耗团队的，不只是页面制作",
      "让 AI 先成为理解业务的协作管家",
      "OneFlow 串联交付，不替代业务系统",
      "一场活动，在同一条链路里完成",
      "不只完成一次活动，更要改变下一次的起点",
      "从理解与规划，走向生成与施工",
      "选择一个真实活动，跑通第一条 OneFlow 工作流",
    ]);
    expect(metadata.title).toBe("OneFlow｜面向营销活动业务的 AI 协作平台");
  });

  it("clearly separates current capabilities from future delivery promises", () => {
    render(<LandingPage />);

    const current = within(
      screen.getByRole("article", { name: "理解业务，组织交付" }),
    );
    const future = within(
      screen.getByRole("article", { name: "生成页面，执行施工" }),
    );
    expect(current.getByText("当前能力")).toBeInTheDocument();
    expect(
      current.getByText(/当前仍需要团队制作与调整资源/),
    ).toBeInTheDocument();
    expect(current.queryByText(/Headless/)).not.toBeInTheDocument();
    expect(future.getByText("未来方向 · 建设中")).toBeInTheDocument();
    expect(
      future.getByText(/未来 AI 将进一步生成页面代码/),
    ).toBeInTheDocument();
    expect(
      future.getByText(/Headless 将活动逻辑与页面外观解耦/),
    ).toBeInTheDocument();
    expect(
      future.getByText("通过系统校验和人工验收后再进入真实环境"),
    ).toBeInTheDocument();
  });

  it("provides working section anchors and the complete six-step workflow", () => {
    render(<LandingPage />);

    const contentNavigation = screen.getByRole("navigation", {
      name: "首页内容导航",
    });
    for (const link of within(contentNavigation).getAllByRole("link")) {
      const target = link.getAttribute("href")?.slice(1);
      expect(target).toBeTruthy();
      expect(document.getElementById(target!)).toBeInTheDocument();
    }
    const workflow = screen.getByRole("region", {
      name: "一场活动，在同一条链路里完成",
    });
    expect(within(workflow).getAllByRole("listitem")).toHaveLength(6);
  });

  it("keeps the mobile navigation operable", () => {
    render(<LandingPage />);

    const menu = screen.getByRole("button", { name: "打开官网菜单" });
    fireEvent.click(menu);
    expect(
      screen.getByRole("button", { name: "关闭官网菜单" }),
    ).toHaveAttribute("aria-expanded", "true");
    const mobileNavigation = screen.getByRole("navigation", {
      name: "移动官网导航",
    });
    fireEvent.click(
      within(mobileNavigation).getByRole("link", { name: "用户手册" }),
    );
    expect(
      screen.getByRole("button", { name: "打开官网菜单" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
