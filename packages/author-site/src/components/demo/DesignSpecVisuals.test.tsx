import { render, screen, waitFor } from "@testing-library/react";
import type { ConfigPoolItem } from "@/lib/design-specs";
import { HoverPop } from "./DesignSpecVisuals";

const baseItem: ConfigPoolItem = {
  id: "page:home:headline",
  scope: "page",
  pageId: "home",
  pageName: "首页",
  key: "headline",
  title: "主标题",
  kind: "text",
  value: "欢迎",
};

describe("HoverPop", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { url: "/api/screenshots/file/proj_1/home?hash=1234567890abcdef" },
      }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("为非图片配置项显示所在页面的真实效果图", async () => {
    render(<HoverPop pop={{ item: baseItem, x: 10, y: 20 }} projectId="proj_1" />);

    await waitFor(() =>
      expect(screen.getByAltText("首页 页面效果图")).toHaveAttribute(
        "src",
        "/api/screenshots/file/proj_1/home?hash=1234567890abcdef",
      ),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/screenshots/file/proj_1/home?meta=1",
      { cache: "no-store" },
    );
    expect(screen.queryByAltText("主标题")).not.toBeInTheDocument();
    expect(screen.queryByText("主标题")).not.toBeInTheDocument();
    expect(screen.queryByText("首页")).not.toBeInTheDocument();
  });

  it("为图片配置项同时显示默认图和所在页面效果图", async () => {
    const imageItem: ConfigPoolItem = {
      ...baseItem,
      id: "page:home:hero",
      key: "hero",
      title: "主视觉图片",
      kind: "image",
      value: "/hero.png",
    };

    render(<HoverPop pop={{ item: imageItem, x: 10, y: 20 }} projectId="proj_1" />);

    expect(screen.getByAltText("主视觉图片")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByAltText("首页 页面效果图")).toBeInTheDocument(),
    );
    expect(screen.queryByText("主视觉图片")).not.toBeInTheDocument();
    expect(screen.queryByText("首页")).not.toBeInTheDocument();
  });
});
