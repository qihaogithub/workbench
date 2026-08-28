import { describe, expect, it } from "vitest";
import {
  buildNavigationConnectorRoute,
  findNavigationRoute,
  toRoundedNavigationPath,
  type NavigationRoutePoint,
  type NavigationRouteRect,
} from "./canvas-navigation-routing";

function segmentCrossesInterior(
  from: NavigationRoutePoint,
  to: NavigationRoutePoint,
  rect: NavigationRouteRect,
) {
  if (from.y === to.y) {
    return (
      from.y > rect.y &&
      from.y < rect.y + rect.height &&
      Math.max(from.x, to.x) > rect.x &&
      Math.min(from.x, to.x) < rect.x + rect.width
    );
  }
  return (
    from.x > rect.x &&
    from.x < rect.x + rect.width &&
    Math.max(from.y, to.y) > rect.y &&
    Math.min(from.y, to.y) < rect.y + rect.height
  );
}

describe("canvas navigation routing", () => {
  it("uses a direct orthogonal route when endpoints share an axis", () => {
    expect(
      findNavigationRoute({
        source: { x: 0, y: 0 },
        target: { x: 100, y: 0 },
        obstacles: [],
      }),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("can retain a bent connector for aligned endpoints", () => {
    const route = findNavigationRoute({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [],
      forceOrthogonalBends: true,
    });
    expect(route.length).toBeGreaterThan(2);
    expect(route.some((point) => point.y !== 0)).toBe(true);
  });

  it("prefers horizontal exit and entry for a side-by-side relationship", () => {
    expect(
      findNavigationRoute({
        source: { x: 0, y: 0 },
        target: { x: 100, y: 40 },
        obstacles: [],
        forceOrthogonalBends: true,
      }),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it("routes around an obstacle without entering its interior", () => {
    const obstacle = { x: 40, y: -10, width: 20, height: 20 };
    const route = findNavigationRoute({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [obstacle],
    });
    expect(route.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < route.length; index += 1) {
      expect(
        segmentCrossesInterior(route[index - 1], route[index], obstacle),
      ).toBe(false);
    }
  });

  it("does not fall back to a diagonal when an endpoint is covered by a duplicate obstacle", () => {
    const route = findNavigationRoute({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 40 },
      obstacles: [{ x: -16, y: -16, width: 132, height: 72 }],
      forceOrthogonalBends: true,
    });
    expect(route.length).toBeGreaterThan(2);
    for (let index = 1; index < route.length; index += 1) {
      expect(
        route[index - 1].x === route[index].x ||
          route[index - 1].y === route[index].y,
      ).toBe(true);
    }
  });

  it("locks the first and last segments to the connected page sides", () => {
    const route = buildNavigationConnectorRoute({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      targetRect: { x: 300, y: 120, width: 100, height: 100 },
      sourceAnchor: { x: 80, y: 50 },
      obstacles: [],
    });
    expect(route[0]).toEqual({ x: 100, y: 50 });
    expect(route[1].y).toBe(route[0].y);
    expect(route.at(-1)).toEqual({ x: 300, y: 170 });
    expect(route.at(-2)?.y).toBe(route.at(-1)?.y);
  });

  it("uses a clean direct connector for aligned page ports with no obstacle", () => {
    const route = buildNavigationConnectorRoute({
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      targetRect: { x: 240, y: 0, width: 100, height: 100 },
      sourceAnchor: { x: 80, y: 50 },
      obstacles: [],
    });
    expect(route.every((point) => point.y === 50)).toBe(true);
  });

  it("emits rounded SVG corners", () => {
    expect(
      toRoundedNavigationPath([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ]),
    ).toContain("Q 40 0");
  });
});
