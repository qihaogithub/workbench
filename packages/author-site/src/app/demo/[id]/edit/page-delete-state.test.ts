import {
  filterPendingDeletedPages,
  mergePendingDeletedPages,
} from "./page-delete-state";

describe("page delete optimistic state", () => {
  it("hides pending pages without changing the canonical page list", () => {
    const pages = [{ id: "page-a" }, { id: "page-b" }, { id: "page-c" }];

    expect(filterPendingDeletedPages(pages, new Set(["page-b"]))).toEqual([
      { id: "page-a" },
      { id: "page-c" },
    ]);
    expect(pages).toEqual([
      { id: "page-a" },
      { id: "page-b" },
      { id: "page-c" },
    ]);
  });

  it("preserves pending pages when the visible page tree is edited", () => {
    const currentPages = [
      { id: "page-a", order: 0 },
      { id: "page-b", order: 1 },
      { id: "page-c", order: 2 },
    ];

    expect(
      mergePendingDeletedPages(
        currentPages,
        [
          { id: "page-c", order: 0 },
          { id: "page-a", order: 1 },
        ],
        new Set(["page-b"]),
      ),
    ).toEqual([
      { id: "page-c", order: 0 },
      { id: "page-a", order: 1 },
      { id: "page-b", order: 1 },
    ]);
  });

  it("restores a pending page at its existing order when no reorder occurred", () => {
    const currentPages = [
      { id: "page-a", order: 0 },
      { id: "page-b", order: 1 },
      { id: "page-c", order: 2 },
    ];

    expect(
      mergePendingDeletedPages(
        currentPages,
        [
          { id: "page-a", order: 0 },
          { id: "page-c", order: 2 },
        ],
        new Set(["page-b"]),
      ),
    ).toEqual(currentPages);
  });
});
