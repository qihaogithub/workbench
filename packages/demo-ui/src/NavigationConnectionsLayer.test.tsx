import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  NavigationConnectionsLayer,
  removeNavigationConnectionFromState,
} from "./PreviewCanvas";

const hotspots = [
  {
    id: "hotspot-1",
    pageId: "source",
    kind: "point" as const,
    rect: { x: 0.5, y: 0.5, width: 0.002, height: 0.002 },
    createdAt: 1,
    updatedAt: 1,
  },
];
const layouts = {
  source: { x: 0, y: 0, width: 200, height: 300 },
  target: { x: 500, y: 0, width: 200, height: 300 },
};

describe("NavigationConnectionsLayer", () => {
  it("removes a selected connector together with its exclusive source anchor", () => {
    const state = removeNavigationConnectionFromState(
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        pages: {},
        navigation: {
          hotspots: { "hotspot-1": hotspots[0] },
          connections: {
            "connection-1": {
              id: "connection-1",
              source: { pageId: "source", hotspotId: "hotspot-1" },
              target: { pageId: "target" },
              createdAt: 1,
              updatedAt: 1,
            },
          },
        },
      },
      "connection-1",
    );

    expect(state.navigation).toEqual({ hotspots: {}, connections: {} });
  });

  it("renders a pointer-following draft connector without making it selectable", () => {
    render(
      <NavigationConnectionsLayer
        connections={[]}
        hotspots={hotspots}
        layouts={layouts}
        obstacles={[]}
        hoveredPageId={null}
        selectedConnectionId={null}
        interactive
        onConnectionSelect={vi.fn()}
        draft={{
          sourcePageId: "source",
          rect: hotspots[0].rect,
          pointer: { x: 460, y: 120 },
        }}
      />,
    );

    const draft = screen.getByLabelText("待完成页面跳转连线");
    expect(draft).toHaveAttribute("marker-end", "url(#canvas-navigation-arrow)");
    expect(draft.getAttribute("d")).not.toBe("");
    expect(screen.queryByRole("button", { name: "选择页面跳转连线" })).toBeNull();
  });

  it("selects an existing connector from either canvas selection mode", () => {
    const onConnectionSelect = vi.fn();
    render(
      <NavigationConnectionsLayer
        connections={[
          {
            id: "connection-1",
            source: { pageId: "source", hotspotId: "hotspot-1" },
            target: { pageId: "target" },
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
        hotspots={hotspots}
        layouts={layouts}
        obstacles={[]}
        hoveredPageId={null}
        selectedConnectionId={null}
        interactive
        onConnectionSelect={onConnectionSelect}
        draft={null}
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "选择页面跳转连线" }),
    );
    expect(onConnectionSelect).toHaveBeenCalledWith("connection-1");
  });
});
