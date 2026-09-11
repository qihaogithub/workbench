import { describe, expect, it } from "vitest";

import { normalizeWorkspacePageRouteKeys } from "../../src/backends/pi-tools/workspace-page-utils";

describe("workspace page route keys", () => {
  it("normalizes invalid and duplicate route keys before Authority writes", () => {
    expect(normalizeWorkspacePageRouteKeys([
      {
        id: "type21-环节播放器_8d5024",
        name: "Type21 环节播放器",
        routeKey: "type21-环节播放器",
        order: 0,
        parentId: null,
      },
      {
        id: "type21-copy_1234",
        name: "Type21 Copy",
        routeKey: "type21",
        order: 1,
        parentId: null,
      },
    ])).toEqual([
      expect.objectContaining({ routeKey: "type21" }),
      expect.objectContaining({ routeKey: "type21-2" }),
    ]);
  });
});
