import { describe, expect, it } from "vitest";

import { mountHeadingStyleToolbar } from "./heading-style-toolbar";

describe("mountHeadingStyleToolbar", () => {
  it("does not react to its own label update indefinitely", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="milkdown-toolbar"></div>';
    document.body.append(root);

    const toolbar = mountHeadingStyleToolbar({
      root,
      getActiveLevel: () => null,
      onSelect: () => {},
    });

    // Let the MutationObserver process mutations produced by the initial label.
    await Promise.resolve();
    await Promise.resolve();

    expect(
      root.querySelectorAll("[data-heading-style-selector]"),
    ).toHaveLength(1);
    expect(root.querySelector("[data-heading-style-trigger]")?.textContent).toBe(
      "正文⌄",
    );

    toolbar.destroy();
    root.remove();
  });
});
