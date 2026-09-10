import { render, screen } from "@testing-library/react";
import type { ConfigPoolItem } from "@/lib/design-specs";
import { formatSize, HoverPop } from "./DesignSpecVisuals";

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
  it("为非图片配置项直接加载所在页面的真实效果图", () => {
    render(<HoverPop pop={{ item: baseItem, x: 10, y: 20 }} projectId="proj_1" />);

    expect(screen.getByAltText("首页 页面效果图")).toHaveAttribute(
      "src",
      "/api/screenshots/file/proj_1/home",
    );
    expect(screen.getByAltText("首页 页面效果图")).toHaveClass("object-contain");
    expect(screen.queryByAltText("主标题")).not.toBeInTheDocument();
    expect(screen.queryByText("主标题")).not.toBeInTheDocument();
    expect(screen.queryByText("首页")).not.toBeInTheDocument();
  });

  it("为图片配置项同时显示默认图和所在页面效果图", () => {
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
    expect(screen.getByAltText("首页 页面效果图")).toBeInTheDocument();
    expect(screen.getByAltText("首页 页面效果图")).toHaveClass("object-contain");
    expect(screen.queryByText("主视觉图片")).not.toBeInTheDocument();
    expect(screen.queryByText("首页")).not.toBeInTheDocument();
  });
});

describe("formatSize", () => {
  it("格式化图片尺寸规则", () => {
    expect(formatSize({
      ...baseItem,
      kind: "image",
      size: {
        width: { min: { value: 100, inclusive: true }, max: { value: 100, inclusive: true } },
        height: { min: { value: 100, inclusive: true }, max: { value: 100, inclusive: true } },
      },
    })).toBe("W = 100px · H = 100px");
  });

  it("格式化开区间图片尺寸规则", () => {
    expect(formatSize({
      ...baseItem,
      kind: "image",
      size: {
        height: {
          min: { value: 670, inclusive: false },
          max: { value: 890, inclusive: false },
        },
      },
    })).toBe("不限 · H > 670px 且 H < 890px");
  });

  it("未设置尺寸规则时显示破折号", () => {
    expect(formatSize(baseItem)).toBe("—");
  });
});
