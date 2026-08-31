import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentUnreadDot } from "./CommentUnreadDot";

describe("CommentUnreadDot", () => {
  it("未解决评论为 0 时不渲染", () => {
    const { container } = render(<CommentUnreadDot count={0} />);

    expect(container.querySelector("[data-comment-unread-dot]")).toBeNull();
  });

  it("有未解决评论时只渲染红点，不显示数字", () => {
    const { container } = render(<CommentUnreadDot count={3} />);
    const dot = container.querySelector<HTMLElement>(
      "[data-comment-unread-dot]",
    );

    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("bg-red-500");
    expect(dot?.textContent).toBe("");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });
});
