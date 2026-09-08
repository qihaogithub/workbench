import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommentThread } from "@workbench/shared";
import { CommentPin } from "./CommentPin";

function makeThread(): CommentThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    target: { kind: "page", pageId: "page-1" },
    content: "第一条评论",
    author: { id: "u1", name: "甲", isAnonymous: false },
    createdAt: 1,
    updatedAt: 1,
    resolved: false,
    replies: [
      { id: "r1", content: "回复一", author: { id: "u2", name: "乙", isAnonymous: false }, createdAt: 2 },
      { id: "r2", content: "回复二", author: { id: "u3", name: "丙", isAnonymous: false }, createdAt: 3 },
      { id: "r3", content: "回复三", author: { id: "u4", name: "丁", isAnonymous: false }, createdAt: 4 },
    ],
  };
}

describe("CommentPin", () => {
  it("默认态不显示描边，展开对应浮窗后才显示高亮描边", () => {
    const { rerender } = render(<CommentPin thread={makeThread()} index={1} left={10} top={20} />);
    const button = screen.getByRole("button");
    const pin = button.firstElementChild as HTMLElement;
    expect(pin.className).toContain("border-transparent");

    rerender(<CommentPin thread={makeThread()} index={1} left={10} top={20} active />);
    expect(pin.className).toContain("border-[#a6ddff]");
  });

  it("展示多人头像堆叠及参与者数量", () => {
    render(<CommentPin thread={makeThread()} index={1} left={10} top={20} />);
    expect(screen.getByRole("button", { name: /4 位参与者/ })).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("回复三")).toBeInTheDocument();
  });

  it("已解决评论使用完成图标和可访问名称", () => {
    const thread = { ...makeThread(), resolved: true };
    render(<CommentPin thread={thread} index={2} left={0} top={0} />);
    expect(screen.getByRole("button", { name: /已解决/ })).toBeInTheDocument();
    expect(screen.getByRole("button").querySelector("svg")).toBeTruthy();
  });
});
