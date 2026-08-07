import { fireEvent, render, screen } from "@testing-library/react";

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
});
