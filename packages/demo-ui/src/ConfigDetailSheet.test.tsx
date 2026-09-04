import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfigDetailSheet } from "./ConfigDetailSheet";

describe("ConfigDetailSheet", () => {
  it("renders a single dialog with level breadcrumbs and closes on Escape", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfigDetailSheet
        open
        title="关卡 01"
        breadcrumb={[
          { id: "module", label: "关卡模块", level: 2 },
          { id: "levels", label: "关卡列表", level: 2 },
          { id: "level-1", label: "关卡 01", level: 3 },
        ]}
        onClose={onClose}
      >
        <input aria-label="状态" />
      </ConfigDetailSheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("navigation", { name: "配置层级" })).toHaveTextContent("关卡模块");
    expect(screen.getByRole("navigation", { name: "配置层级" })).toHaveTextContent("关卡列表");
    expect(screen.getByRole("navigation", { name: "配置层级" }).querySelector('[aria-current="page"]')).toHaveTextContent("关卡 01");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <ConfigDetailSheet open={false} title="关卡 01" onClose={onClose}>
        <input aria-label="状态" />
      </ConfigDetailSheet>,
    );
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("navigates through a parent breadcrumb without creating another dialog", () => {
    const onNavigate = vi.fn();
    render(
      <ConfigDetailSheet
        open
        title="关卡 01"
        breadcrumb={[
          { id: "module", label: "关卡模块", level: 2 },
          { id: "levels", label: "关卡列表", level: 2 },
          { id: "level-1", label: "关卡 01", level: 3 },
        ]}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      >
        <div>内容</div>
      </ConfigDetailSheet>,
    );

    fireEvent.click(screen.getByRole("button", { name: "关卡列表" }));
    expect(onNavigate).toHaveBeenCalledWith({ id: "levels", label: "关卡列表", level: 2 }, 1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("keeps a single accessible title when no breadcrumb is provided", () => {
    render(
      <ConfigDetailSheet open title="关卡设置" onClose={vi.fn()}>
        内容
      </ConfigDetailSheet>,
    );
    expect(document.querySelectorAll("#config-detail-sheet-title")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "关卡设置" })).toBeInTheDocument();
  });

  it("can be bounded to the configuration panel without blocking the page around it", () => {
    const hostRef = createRef<HTMLDivElement>();
    const underlayRef = createRef<HTMLDivElement>();
    const onOutsideClick = vi.fn();

    render(
      <>
        <button type="button" onClick={onOutsideClick}>预览交互</button>
        <div ref={hostRef}>
          <div ref={underlayRef}>配置列表</div>
          <ConfigDetailSheet
            open
            title="关卡 01"
            onClose={vi.fn()}
            containerRef={hostRef}
            underlayRef={underlayRef}
          >
            <input aria-label="关卡名称" />
          </ConfigDetailSheet>
        </div>
      </>,
    );

    const shell = hostRef.current?.querySelector<HTMLElement>("[data-config-detail-sheet]");
    expect(shell).toHaveClass("absolute", "inset-0", "p-2");
    expect(shell).toHaveAttribute("data-config-detail-sheet-scope", "container");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "false");
    expect(screen.getByRole("dialog")).toHaveClass(
      "w-[calc(100%-16px)]",
      "max-w-[500px]",
      "transition-transform",
      "duration-[300ms]",
      "ease-in-out",
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("opacity-0", "opacity-100", "transition-[transform,opacity]");
    expect(screen.getByRole("dialog")).toHaveStyle({
      transitionDuration: "300ms",
      transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    });
    expect(shell?.querySelector('button[aria-label="关闭详情"]')).toHaveClass(
      "transition-opacity",
      "duration-[320ms]",
      "ease-in-out",
    );
    expect(shell?.querySelector('button[aria-label="关闭详情"]')).toHaveStyle({
      transitionDuration: "320ms",
      transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    });
    expect(underlayRef.current).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "预览交互" }));
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("");
  });
});
