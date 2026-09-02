import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { ManualIndex } from "./manual-index";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("ManualIndex", () => {
  it("filters articles by title, description and tags", () => {
    render(
      <ManualIndex
        sections={[{
          section: "开始使用",
          articles: [
            {
              slug: "quick-start",
              title: "快速开始",
              description: "完成第一次预览",
              section: "开始使用",
              order: 10,
              updatedAt: "2026-09-02",
              tags: ["入门"],
            },
            {
              slug: "workspace-basics",
              title: "认识工作台",
              description: "了解界面区域",
              section: "开始使用",
              order: 20,
              updatedAt: "2026-09-02",
              tags: ["导航"],
            },
          ],
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: /快速开始/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /认识工作台/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索用户手册" }), { target: { value: "导航" } });

    expect(screen.queryByRole("link", { name: /快速开始/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /认识工作台/ })).toBeInTheDocument();
  });
});
