import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasToolbar } from "./CanvasToolbar";

describe("CanvasToolbar", () => {
  it("keeps navigation controls separate and places Section and connectors in the creation group", () => {
    const { container } = render(
      <CanvasToolbar
        zoom={1}
        onZoomChange={vi.fn()}
        onAddDocument={vi.fn()}
        onAddText={vi.fn()}
        onAddImageFiles={vi.fn()}
        onToolModeChange={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "画布工具栏" });
    const navigationGroup = toolbar.children[0];
    const creationGroup = toolbar.children[1];
    const sectionTool = screen.getByRole("button", { name: "Section 工具" });
    const connectorTool = screen.getByRole("button", { name: "连线工具" });

    expect(navigationGroup).toContainElement(screen.getByRole("button", { name: "拖动工具" }));
    expect(navigationGroup).toContainElement(screen.getByRole("button", { name: "选择工具" }));
    expect(navigationGroup).not.toContainElement(sectionTool);
    expect(navigationGroup).not.toContainElement(connectorTool);
    expect(creationGroup).toContainElement(sectionTool);
    expect(creationGroup).toContainElement(connectorTool);
    expect(sectionTool.querySelector(".lucide-layout-panel-top")).toBeInTheDocument();
    expect(container.querySelector(".lucide-square")).toBeNull();
  });
});
