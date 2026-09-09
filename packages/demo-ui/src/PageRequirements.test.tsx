import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeMarkdownReference } from "@workbench/shared/markdown-reference";
import { PageRequirements } from "./PageRequirements";

vi.mock("./MarkdownImageLightbox", () => ({
  useMarkdownImageLightbox: () => ({ handleMarkdownImageClick: () => false, lightbox: null }),
}));
afterEach(cleanup);

describe("read-only project references", () => {
  it.each([false, true])("keeps inline styling in either CSS load order (reversed=%s)", (reverse) => {
    const styles = ["src/markdown/project-reference-presentation.css", "src/page-requirements.css"];
    if (reverse) styles.reverse();
    const style = document.createElement("style");
    style.textContent = styles.map((file) => readFileSync(file, "utf8")).join("\n");
    document.head.appendChild(style);
    try {
      const { container } = render(<PageRequirements markdown="[Home](wb://page/p/home) @[Legacy](title)" />);
      const reference = container.querySelector<HTMLElement>(".pr-reference")!;
      const computed = getComputedStyle(reference);
      expect(computed.display).toBe("inline");
      expect(computed.padding).toBe("0px");
      expect(computed.margin).toBe("0px");
      expect(computed.borderRadius).toBe("0");
      expect(computed.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(reference.classList.contains("wb-reference")).toBe(true);
      expect(reference.dataset.referenceKind).toBe("page");
      const legacy = getComputedStyle(container.querySelector(".pr-ref")!);
      expect(legacy.display).toBe("inline-flex");
      expect(legacy.borderRadius).toBe("9999px");
    } finally { style.remove(); }
  });

  it("decodes the canonical URI and passes the snapshot to the host without a browser href", () => {
    const target = { kind: "config", projectId: "项目", pageId: "页面", fieldPath: "group/title" } as const;
    const onReferenceClick = vi.fn();
    const onRefClick = vi.fn();
    const { container } = render(<PageRequirements markdown={`${serializeMarkdownReference(target, "Stored name")} @[Legacy](title)`} onReferenceClick={onReferenceClick} onRefClick={onRefClick} />);
    const reference = container.querySelector(".pr-reference")!;
    expect(reference.hasAttribute("href")).toBe(false);
    expect(fireEvent.click(reference)).toBe(false);
    expect(onReferenceClick).toHaveBeenCalledOnce();
    expect(onReferenceClick).toHaveBeenCalledWith({ target, labelSnapshot: "Stored name" });
    expect(onRefClick).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".pr-ref")!);
    expect(onRefClick).toHaveBeenCalledOnce();
    expect(onRefClick).toHaveBeenCalledWith("title");
  });

  it("does not navigate malformed or foreign URI metadata", () => {
    const onReferenceClick = vi.fn();
    const { container } = render(<PageRequirements markdown={'<span data-reference-uri="javascript:alert(1)">Bad</span> <span data-reference-uri="wb://config/p/page">Incomplete</span>'} onReferenceClick={onReferenceClick} />);
    for (const reference of container.querySelectorAll("[data-reference-uri]")) fireEvent.click(reference);
    expect(onReferenceClick).not.toHaveBeenCalled();
  });
});
