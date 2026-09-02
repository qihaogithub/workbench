import {
  getDesignSpecDropPosition,
  reorderDesignSpecEntries,
} from "./design-spec-order";

describe("reorderDesignSpecEntries", () => {
  const entries = [
    { id: "entry-1", title: "第一条", markdown: "", target: { type: "page" as const, pageIds: [] } },
    { id: "entry-2", title: "第二条", markdown: "", target: { type: "page" as const, pageIds: [] } },
    { id: "entry-3", title: "第三条", markdown: "", target: { type: "page" as const, pageIds: [] } },
  ];

  it("moves a lower entry before the upper target card", () => {
    expect(reorderDesignSpecEntries(entries, "entry-3", "entry-1", "before").map((entry) => entry.id)).toEqual([
      "entry-3",
      "entry-1",
      "entry-2",
    ]);
  });

  it("moves an adjacent lower entry before the first card", () => {
    expect(reorderDesignSpecEntries(entries, "entry-2", "entry-1", "before").map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-1",
      "entry-3",
    ]);
  });

  it("moves an upper entry after the lower target card", () => {
    expect(reorderDesignSpecEntries(entries, "entry-1", "entry-3", "after").map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-3",
      "entry-1",
    ]);
  });

  it("supports explicit after placement for adjacent cards", () => {
    expect(reorderDesignSpecEntries(entries, "entry-1", "entry-2", "after").map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-1",
      "entry-3",
    ]);
    expect(reorderDesignSpecEntries(entries, "entry-2", "entry-1", "after")).toBe(entries);
  });

  it("keeps an already-first entry first when dropped on the upper half of the second card", () => {
    expect(reorderDesignSpecEntries(entries, "entry-1", "entry-2", "before")).toBe(entries);
  });

  it("supports moving the first and last entries across the full list", () => {
    expect(reorderDesignSpecEntries(entries, "entry-1", "entry-3", "before").map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-1",
      "entry-3",
    ]);
    expect(reorderDesignSpecEntries(entries, "entry-3", "entry-1", "after").map((entry) => entry.id)).toEqual([
      "entry-1",
      "entry-3",
      "entry-2",
    ]);
  });

  it("returns the original array for invalid IDs or self-drop", () => {
    expect(reorderDesignSpecEntries(entries, "entry-1", "entry-1", "before")).toBe(entries);
    expect(reorderDesignSpecEntries(entries, "entry-1", "missing", "after")).toBe(entries);
    expect(reorderDesignSpecEntries(entries, "missing", "entry-2", "before")).toBe(entries);
  });
});

describe("getDesignSpecDropPosition", () => {
  it("uses the target midpoint to choose the before/after indicator", () => {
    const targetRect = { top: 100, height: 80 };
    expect(getDesignSpecDropPosition({ top: 80, height: 20 }, targetRect)).toBe("before");
    expect(getDesignSpecDropPosition({ top: 160, height: 20 }, targetRect)).toBe("after");
  });

  it("prefers the pointer position when the grabbed handle offsets the dragged card", () => {
    const targetRect = { top: 100, height: 80 };
    expect(getDesignSpecDropPosition({ top: 160, height: 20 }, targetRect, 115)).toBe("before");
    expect(getDesignSpecDropPosition({ top: 80, height: 20 }, targetRect, 185)).toBe("after");
  });
});
