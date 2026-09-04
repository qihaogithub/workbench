import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageListWidget } from "./ImageListWidget";

describe("ImageListWidget", () => {
  it("uses the same subtle black fill for the add-image tile", () => {
    render(<ImageListWidget value={[]} onChange={vi.fn()} />);

    expect(screen.getByText("Upload").closest("div")).toHaveClass("bg-black/10");
  });

  it("does not render an image element for an item without a URL", () => {
    render(
      <ImageListWidget
        value={[{ url: "", alt: "未设置图片" }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("img", { name: "未设置图片" })).not.toBeInTheDocument();
  });
});
