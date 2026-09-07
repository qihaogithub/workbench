import { describe, expect, it, vi } from "vitest";

import type { CrepeProjectActions } from "./crepe-config";
import { DocumentBlockMenu } from "./document-block-menu";

function createActions(): CrepeProjectActions {
  return {
    uploadImage: vi.fn(async () => "/image.png"),
    uploadVideo: vi.fn(),
    uploadFile: vi.fn(),
    insertReference: vi.fn(),
  };
}

describe("document block menu", () => {
  it("renders one accessible menu with the existing Chinese groups", () => {
    const menu = new DocumentBlockMenu(
      {} as never,
      { actions: createActions() },
      vi.fn(),
      document,
    );
    document.body.append(menu.element);

    expect(
      menu.element.querySelectorAll(".document-block-menu-tab"),
    ).toHaveLength(4);
    expect(
      menu.element.querySelectorAll(".document-block-menu-item"),
    ).toHaveLength(6);
    expect(
      menu.element.querySelectorAll(".document-block-menu-group"),
    ).toHaveLength(1);
    expect(
      menu.element.querySelector('[data-menu-key="text"]')?.textContent,
    ).toBe("正文");

    const moreTab = Array.from(
      menu.element.querySelectorAll<HTMLButtonElement>(
        ".document-block-menu-tab",
      ),
    ).find((tab) => tab.textContent === "更多");
    moreTab?.click();
    expect(
      menu.element.querySelectorAll(".document-block-menu-item"),
    ).toHaveLength(3);
    expect(
      menu.element.querySelector('[data-menu-key="h4"]')?.textContent,
    ).toBe("H4");
    expect(
      menu.element.querySelector('[role="tabpanel"]')?.getAttribute(
        "aria-labelledby",
      ),
    ).toContain("-tab-more");

    menu.setVisible(true);
    expect(menu.element.dataset.show).toBe("true");
    expect(menu.element.getAttribute("aria-hidden")).toBe("false");
    menu.hide();
    expect(menu.element.dataset.show).toBe("false");
    menu.destroy();
  });

  it("filters items without discarding the group API", () => {
    const menu = new DocumentBlockMenu(
      {} as never,
      { actions: createActions() },
      vi.fn(),
      document,
    );
    document.body.append(menu.element);

    menu.setFilter("列表");
    expect(
      menu.element.querySelectorAll(".document-block-menu-group"),
    ).toHaveLength(1);
    expect(
      menu.element.querySelectorAll(".document-block-menu-item"),
    ).toHaveLength(3);

    menu.destroy();
  });

  it("keeps native click activation for menu buttons", () => {
    const actions = createActions();
    const menu = new DocumentBlockMenu(
      {} as never,
      { actions, enableUploads: true },
      vi.fn(),
      document,
    );
    document.body.append(menu.element);
    menu.setVisible(true);

    Array.from(
      menu.element.querySelectorAll<HTMLButtonElement>(
        ".document-block-menu-tab",
      ),
    )
      .find((tab) => tab.textContent === "更多")
      ?.click();

    menu.element
      .querySelector<HTMLButtonElement>('[data-menu-key="upload-video"]')
      ?.click();

    expect(actions.uploadVideo).toHaveBeenCalledTimes(1);
    expect(menu.element.dataset.show).toBe("false");
    menu.destroy();
  });
});
