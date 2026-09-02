import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useMarkdownImageLightbox } from "./MarkdownImageLightbox";

function MarkdownFixture({ onContainerClick }: { onContainerClick?: () => void }) {
  const { handleMarkdownImageClick, lightbox } = useMarkdownImageLightbox();
  return (
    <>
      <div
        className="markdown-image-previewable"
        onClick={(event) => {
          if (handleMarkdownImageClick(event)) return;
          onContainerClick?.();
        }}
      >
        <a href="https://example.test/target">
          <img src="/api/images/example.png" alt="示例图片" />
        </a>
      </div>
      {lightbox}
    </>
  );
}

it("点击 Markdown 图片打开预览并阻止父级链接交互", async () => {
  const onContainerClick = vi.fn();
  render(<MarkdownFixture onContainerClick={onContainerClick} />);

  fireEvent.click(screen.getByRole("img", { name: "示例图片" }));

  expect(onContainerClick).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeInTheDocument();
  expect(dialog.querySelector("img")?.getAttribute("src")).toMatch(/\/api\/images\/example\.png$/);

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
