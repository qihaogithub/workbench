import { fireEvent, render, screen } from "@testing-library/react";

import { PageViewportControl } from "./PageViewportControl";

const desktop = {
  version: 1 as const,
  mode: "responsive-page" as const,
  viewport: { width: 1440, height: 900 },
  heightBehavior: "content" as const,
  preset: "desktop" as const,
  source: "recommended" as const,
};

describe("PageViewportControl", () => {
  it("临时视口不自动保存，只在用户确认时持久化", () => {
    const onSaveDefault = jest.fn();
    const mobile = { ...desktop, viewport: { width: 390, height: 844 }, preset: "mobile" as const, source: "user" as const };
    render(
      <PageViewportControl
        presentation={desktop}
        temporaryPresentation={mobile}
        onTemporaryChange={jest.fn()}
        onSaveDefault={onSaveDefault}
      />,
    );

    expect(onSaveDefault).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /设为默认/ }));
    expect(onSaveDefault).toHaveBeenCalledWith(mobile);
  });

  it("当前视口已是默认时不显示持久化按钮", () => {
    render(<PageViewportControl presentation={desktop} onTemporaryChange={jest.fn()} onSaveDefault={jest.fn()} />);
    expect(screen.queryByRole("button", { name: /设为默认/ })).not.toBeInTheDocument();
  });
});
