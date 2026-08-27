import { describe, expect, it } from "vitest";
import {
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
