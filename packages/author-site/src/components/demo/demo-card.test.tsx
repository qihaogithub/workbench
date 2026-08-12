import { act, fireEvent, render, screen } from "@testing-library/react";

import { DemoCard } from "./demo-card";
import type { DemoMeta } from "@workbench/shared";

const demo: DemoMeta = {
  id: "proj-1",
  name: "活动页",
  category: "活动",
  createdAt: 1,
  updatedAt: 2,
  demoPages: [],
};

function renderCard() {
  const callbacks = {
    onDelete: jest.fn(),
    onSaveAsTemplate: jest.fn(),
    onDuplicate: jest.fn(),
    onRename: jest.fn(),
    onChangeCategory: jest.fn(),
    onChangeCover: jest.fn(),
    onShare: jest.fn(),
    onConvertToProject: jest.fn(),
  };
  render(<DemoCard demo={demo} {...callbacks} />);
  return callbacks;
}

describe("DemoCard", () => {
  it("更多菜单点击分享会触发 onShare", async () => {
    const callbacks = renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "打开项目 活动页 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /分享/ }));

    expect(callbacks.onShare).toHaveBeenCalledWith(demo);
  });

  it("只消费上层聚合的截图地址，不自行请求元数据", () => {
    const originalFetch = global.fetch;
    const originalIntersectionObserver = global.IntersectionObserver;
    global.fetch = jest.fn() as typeof fetch;
    let reveal: (() => void) | undefined;
    global.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
      reveal = () =>
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      return {
        disconnect: jest.fn(),
        observe: jest.fn(),
        takeRecords: jest.fn(() => []),
        unobserve: jest.fn(),
        root: null,
        rootMargin: "0px",
        thresholds: [0],
      };
    }) as unknown as typeof IntersectionObserver;

    const screenshotDemo: DemoMeta = {
      ...demo,
      demoPages: [{ id: "page-1", name: "首页", order: 0, parentId: null }],
    };
    const callbacks = {
      onDelete: jest.fn(),
      onSaveAsTemplate: jest.fn(),
      onDuplicate: jest.fn(),
      onRename: jest.fn(),
      onChangeCategory: jest.fn(),
      onChangeCover: jest.fn(),
      onShare: jest.fn(),
      onConvertToProject: jest.fn(),
    };
    render(
      <DemoCard
        demo={screenshotDemo}
        screenshotMetadata={{
          "page-1": "/api/screenshots/file/proj-1/page-1?hash=1111111111111111",
        }}
        {...callbacks}
      />,
    );
    act(() => reveal?.());

    expect(screen.getByAltText("首页")).toHaveAttribute(
      "src",
      "/api/screenshots/file/proj-1/page-1?hash=1111111111111111",
    );
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = originalFetch;
    global.IntersectionObserver = originalIntersectionObserver;
  });
});
