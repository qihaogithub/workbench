import { describe, expect, it } from "vitest";
import { filterSelectableTabs, isHttpTab, toggleTabSelection } from "../src/sidepanel/batch-selection.js";

describe("batch tab selection", () => {
  it("only accepts HTTP and HTTPS tabs with an id", () => {
    expect(isHttpTab({ id: 1, url: "https://example.test" })).toBe(true);
    expect(isHttpTab({ id: 2, url: "chrome://settings" })).toBe(false);
    expect(filterSelectableTabs([{ id: 1, url: "https://a.test" }, { id: 2, url: "file:///tmp/a" }])).toHaveLength(1);
  });

  it("filters title and URL without selecting everything by default", () => {
    const tabs = [{ id: 2, title: "Docs", url: "https://docs.test" }, { id: 1, title: "App", url: "http://app.test" }];
    expect(filterSelectableTabs(tabs).map((tab) => tab.id)).toEqual([1, 2]);
    expect(filterSelectableTabs(tabs, "docs").map((tab) => tab.id)).toEqual([2]);
  });

  it("toggles explicit ids immutably", () => {
    const selected = [3, 1];
    expect(toggleTabSelection(selected, 2, true)).toEqual([1, 2, 3]);
    expect(toggleTabSelection(selected, 1, false)).toEqual([3]);
    expect(selected).toEqual([3, 1]);
  });
});
