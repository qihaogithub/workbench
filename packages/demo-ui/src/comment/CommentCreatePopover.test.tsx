import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentCreatePopover } from "./CommentCreatePopover";

const draft = {
  target: { kind: "page" as const, pageId: "page-1" },
};

describe("CommentCreatePopover", () => {
  it("uses the composer's send button as the only create action", () => {
    render(
      <CommentCreatePopover
        draft={draft}
        mentionCandidates={[]}
        left={300}
        top={100}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "发送评论" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭评论输入" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^评论$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^取消$/ })).not.toBeInTheDocument();
  });

  it("allows the create window to move with its title handle", () => {
    render(
      <CommentCreatePopover
        draft={draft}
        mentionCandidates={[]}
        left={300}
        top={100}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
      />,
    );
    const handle = screen.getByRole("button", { name: "拖动评论浮窗，可使用方向键移动" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    const popover = handle.closest("[style]") as HTMLElement;
    expect(popover.style.left).toBe("316px");
  });
});
