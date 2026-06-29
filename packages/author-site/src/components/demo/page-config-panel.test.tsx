import { fireEvent, render, screen } from "@testing-library/react";
import { PageConfigPanel } from "@opencode-workbench/demo-ui";

const sharedSchema = JSON.stringify({
  type: "object",
  properties: {
    logo: { type: "string", title: "Logo" },
    theme: { type: "string", title: "主题" },
  },
});

const pageSchema = JSON.stringify({
  type: "object",
  properties: {
    title: { type: "string", title: "标题" },
  },
});

describe("PageConfigPanel", () => {
  it("一级展示页面配置数量，二级展示共享配置和本页配置", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: "",
            configData: {},
          },
        ]}
        activePageId="page_a"
        projectConfigSchema={sharedSchema}
        readonly
      />,
    );

    expect(screen.queryByText(/个页面有配置/)).not.toBeInTheDocument();
    expect(screen.queryByText(/共享 2 · 独有/)).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.queryByText(/项配置/)).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("返回所有页面"));
    fireEvent.click(screen.getByText("页面 B"));

    expect(screen.queryByText(/项配置/)).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.queryByText("本页配置")).not.toBeInTheDocument();
  });

  it("单页详情模式隐藏配置面板头部", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
        ]}
        activePageId="page_a"
        detailPageId="page_a"
        projectConfigSchema={sharedSchema}
        hideDetailHeader
        readonly
      />,
    );

    expect(screen.queryByText("配置面板")).not.toBeInTheDocument();
    expect(screen.queryByText("页面 A")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("返回所有页面")).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();
  });
});
