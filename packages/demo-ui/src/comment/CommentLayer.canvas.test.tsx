import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentThread } from "@workbench/shared";

vi.mock("./CommentPin", () => ({
  CommentPin: ({ thread, left, top }: { thread: CommentThread; left: number; top: number }) => (
    <button type="button" data-testid={`pin-${thread.id}`} data-left={left} data-top={top} />
  ),
}));

vi.mock("./CommentThreadPopover", () => ({
  CommentThreadPopover: ({ thread, left, top }: { thread: CommentThread; left: number; top: number }) => (
    <div data-testid={`thread-popover-${thread.id}`} data-left={left} data-top={top} />
  ),
}));

vi.mock("./CommentCreatePopover", () => ({
  CommentCreatePopover: ({ left, top }: { left: number; top: number }) => (
    <div data-testid="create-popover" data-left={left} data-top={top} />
  ),
}));

vi.mock("./CommentSidebar", () => ({ CommentSidebar: () => null }));

import { CommentLayer } from "./CommentLayer";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function createThread(): CommentThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    target: { kind: "page", pageId: "page-1" },
    anchor: { domPath: "canvas-page", tagName: "canvas-page" },
    pin: { xRatio: 0.5, yRatio: 0.5 },
    content: "正文",
    author: { id: "user-1", name: "用户", isAnonymous: false },
    createdAt: 1,
    updatedAt: 1,
    resolved: false,
    replies: [],
  };
}

function createApi() {
  return {
    listComments: vi.fn(async () => []),
    createComment: vi.fn(async () => createThread()),
    addReply: vi.fn(async () => ({
      id: "reply-1",
      content: "",
      author: { id: "user-1", name: "用户", isAnonymous: false },
      createdAt: 1,
    })),
    updateComment: vi.fn(async () => createThread()),
    updateReply: vi.fn(async () => ({
      id: "reply-1",
      content: "",
      author: { id: "user-1", name: "用户", isAnonymous: false },
      createdAt: 1,
    })),
    setResolved: vi.fn(async () => undefined),
    deleteThread: vi.fn(async () => undefined),
    deleteReply: vi.fn(async () => undefined),
    uploadCommentImage: vi.fn(async () => ({ url: "/api/images/test", kind: "image" as const })),
    listMentionCandidates: vi.fn(async () => []),
  };
}

describe("CommentLayer canvas positioning", () => {
  it("repositions pins and both popovers from the transformed page rect", async () => {
    const rects = new WeakMap<Element, DOMRect>();
    const getRect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        return rects.get(this) ?? rect(0, 0, 0, 0);
      });

    const thread = createThread();
    const api = createApi();
    const draft = {
      input: {
        target: { kind: "page" as const, pageId: "page-1" },
        anchor: { domPath: "canvas-page", tagName: "canvas-page" },
        pin: thread.pin,
      },
      clientX: 20,
      clientY: 30,
    };

    const { rerender } = render(
      <CommentLayer
        projectId="project-1"
        pageId="page-1"
        api={api}
        currentUser={null}
        threads={[thread]}
        showPins
        activeThreadId={thread.id}
        canvasViewport={{ x: 0, y: 0, zoom: 1 }}
        canvasCreateDraft={draft}
        showToggle={false}
      >
        <div data-canvas-root>
          <div data-page-id="page-1" data-testid="canvas-page" />
        </div>
      </CommentLayer>,
    );

    const page = screen.getByTestId("canvas-page");
    const area = page.parentElement?.parentElement;
    expect(area).toBeTruthy();
    rects.set(area!, rect(0, 0, 800, 600));
    rects.set(page, rect(100, 120, 200, 100));

    rerender(
      <CommentLayer
        projectId="project-1"
        pageId="page-1"
        api={api}
        currentUser={null}
        threads={[thread]}
        showPins
        activeThreadId={thread.id}
        canvasViewport={{ x: 80, y: 40, zoom: 1.5 }}
        canvasCreateDraft={draft}
        showToggle={false}
      >
        <div data-canvas-root>
          <div data-page-id="page-1" data-testid="canvas-page" />
        </div>
      </CommentLayer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pin-thread-1")).toHaveAttribute("data-left", "200");
      expect(screen.getByTestId("pin-thread-1")).toHaveAttribute("data-top", "170");
      expect(screen.getByTestId("thread-popover-thread-1")).toHaveAttribute("data-left", "200");
      expect(screen.getByTestId("thread-popover-thread-1")).toHaveAttribute("data-top", "190");
      expect(screen.getByTestId("create-popover")).toHaveAttribute("data-left", "200");
      expect(screen.getByTestId("create-popover")).toHaveAttribute("data-top", "184");
    });

    rects.set(page, rect(180, 160, 300, 150));
    rerender(
      <CommentLayer
        projectId="project-1"
        pageId="page-1"
        api={api}
        currentUser={null}
        threads={[thread]}
        showPins
        activeThreadId={thread.id}
        canvasViewport={{ x: 160, y: 80, zoom: 2 }}
        canvasCreateDraft={draft}
        showToggle={false}
      >
        <div data-canvas-root>
          <div data-page-id="page-1" data-testid="canvas-page" />
        </div>
      </CommentLayer>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pin-thread-1")).toHaveAttribute("data-left", "330");
      expect(screen.getByTestId("pin-thread-1")).toHaveAttribute("data-top", "235");
      expect(screen.getByTestId("thread-popover-thread-1")).toHaveAttribute("data-left", "330");
      expect(screen.getByTestId("thread-popover-thread-1")).toHaveAttribute("data-top", "255");
      expect(screen.getByTestId("create-popover")).toHaveAttribute("data-left", "330");
      expect(screen.getByTestId("create-popover")).toHaveAttribute("data-top", "249");
    });

    getRect.mockRestore();
  });
});
