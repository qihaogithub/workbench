import { parseCanvasNavigation } from "./canvas-navigation";
import { describe, expect, it } from "vitest";

describe("parseCanvasNavigation", () => {
  const pageIds = new Set(["source", "target"]);
  const navigation = {
    hotspots: {
      hotspot: { id: "hotspot", pageId: "source", kind: "area", rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 }, createdAt: 1, updatedAt: 1 },
    },
    connections: {
      connection: { id: "connection", source: { pageId: "source", hotspotId: "hotspot" }, target: { pageId: "target" }, createdAt: 1, updatedAt: 1 },
    },
  };

  it("accepts a single cross-page connection", () => {
    expect(parseCanvasNavigation(navigation, pageIds)).toEqual(navigation);
  });

  it("rejects a dangling target or a same-page connection", () => {
    expect(parseCanvasNavigation({ ...navigation, connections: { connection: { ...navigation.connections.connection, target: { pageId: "missing" } } } }, pageIds)).toBeNull();
    expect(parseCanvasNavigation({ ...navigation, connections: { connection: { ...navigation.connections.connection, target: { pageId: "source" } } } }, pageIds)).toBeNull();
  });

  it("accepts an invisible point anchor and rejects an unknown source kind", () => {
    const pointNavigation = {
      ...navigation,
      hotspots: {
        hotspot: { ...navigation.hotspots.hotspot, kind: "point" as const, rect: { x: 0.5, y: 0.5, width: 0.002, height: 0.002 } },
      },
    };
    expect(parseCanvasNavigation(pointNavigation, pageIds)).toEqual(pointNavigation);
    expect(parseCanvasNavigation({ ...navigation, hotspots: { hotspot: { ...navigation.hotspots.hotspot, kind: "line" } } }, pageIds)).toBeNull();
  });
});
