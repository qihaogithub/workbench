import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { editorViewCtx } from "@milkdown/kit/core";
import { AllSelection, TextSelection } from "@milkdown/kit/prose/state";
import { undo, undoDepth } from "@milkdown/kit/prose/history";
import type { EditorView } from "@milkdown/kit/prose/view";
import { DocumentEditor } from "../DocumentEditor";

Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
});
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const fixture = vi.hoisted(() => ({
  getView: () => null as EditorView | null,
  get view() {
    return this.getView();
  },
}));

// Only pointer hit-testing is replaced: transactions, schema, history,
// DocumentEditor and its block-menu controller are real Milkdown instances.
vi.mock("@milkdown/kit/plugin/block", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@milkdown/kit/plugin/block")>();
  return {
    ...actual,
    BlockProvider: class {
      content: HTMLElement;
      constructor({
        ctx,
        root,
        content,
      }: {
        ctx: { get: (key: unknown) => EditorView };
        root: HTMLElement;
        content: HTMLElement;
      }) {
        fixture.getView = () => ctx.get(editorViewCtx);
        this.content = content;
        root.append(content);
      }
      get active() {
        const view = fixture.view!;
        return {
          el: view.dom.firstElementChild,
          $pos: view.state.doc.resolve(0),
          node: view.state.doc.firstChild,
        };
      }
      update() {}
      hide() {}
      destroy() {
        this.content.remove();
      }
    },
  };
});

async function ready() {
  await waitFor(() =>
    expect(document.querySelector("[data-block-handle-trigger]")).toBeTruthy(),
  );
  await waitFor(() => expect(fixture.view?.state).toBeTruthy());
  return fixture.view!;
}
function open() {
  fireEvent.click(document.querySelector("[data-block-handle-trigger]")!);
  return document.querySelector<HTMLElement>(".document-insert-menu")!;
}

describe("shared editor block menu transactions", () => {
  it("switches reference projects without editing and inserts the foreign identity in one undo", async () => {
    const foreign = { target: { kind: "page" as const, projectId: "b", pageId: "home" }, label: "外部首页", displayPath: "品牌官网 / 外部首页" };
    const provider = Object.assign(vi.fn(async ({ projectId }: { projectId?: string }) => projectId === "b" ? [foreign] : []), {
      listProjects: vi.fn(async () => [{ id: "a", name: "当前活动" }, { id: "b", name: "品牌官网" }]),
    });
    const onReferenceClick = vi.fn();
    render(<DocumentEditor value="说明" onChange={vi.fn()} onReferenceClick={onReferenceClick}
      referenceContext={{ source: { kind: "knowledge-document", projectId: "a", workspaceId: "w", docId: "d" }, policy: { sameProjectOnly: false, allowedTargetKinds: ["page", "config", "document"] } }} referenceProvider={provider} />);
    const view = await ready();
    const before = view.state.doc;
    const depth = undoDepth(view.state);
    open(); fireEvent.click(screen.getByRole("tab", { name: "插入项目引用", hidden: true }));
    fireEvent.click(await screen.findByRole("button", { name: "当前活动" }));
    fireEvent.click(await screen.findByRole("option", { name: /品牌官网/ }));
    const row = await screen.findByRole("treeitem", { name: "外部首页" });
    expect(view.state.doc.eq(before)).toBe(true);
    expect(undoDepth(view.state)).toBe(depth);
    expect(provider).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "b", context: expect.objectContaining({ source: expect.objectContaining({ projectId: "a" }) }) }));
    fireEvent.click(row);
    const reference = document.querySelector('[data-reference-uri="wb://page/b/home"]')!;
    expect(reference).toHaveAttribute("data-reference-path", "品牌官网 / 外部首页");
    fireEvent.click(reference);
    expect(onReferenceClick).toHaveBeenCalledWith(expect.objectContaining({ target: foreign.target }));
    expect(undoDepth(view.state)).toBe(depth + 1);
    undo(view.state, view.dispatch);
    expect(view.state.doc.eq(before)).toBe(true);
  });

  it("refreshes referenced projects independently and revokes only an inaccessible project", async () => {
    let denied = false;
    const provider = vi.fn(async ({ projectId }: { projectId?: string }) => {
      if (projectId === "b") throw Object.assign(new Error("failed"), { status: denied ? 403 : 503 });
      return [{ target: { kind: "page" as const, projectId: "a", pageId: "home" }, label: "当前首页", displayPath: "当前活动 / 首页" }];
    });
    render(<DocumentEditor value="[当前](wb://page/a/home) [外部](wb://page/b/home)" onChange={vi.fn()}
      referenceContext={{ source: { kind: "knowledge-document", projectId: "a", workspaceId: "w", docId: "d" }, policy: { sameProjectOnly: false, allowedTargetKinds: ["page", "config", "document"] } }} referenceProvider={provider} />);
    const view = await ready();
    const before = view.state.doc;
    await waitFor(() => expect(document.querySelector('[data-reference-uri="wb://page/a/home"]')).toHaveAttribute("data-reference-status", "available"));
    expect(document.querySelector('[data-reference-uri="wb://page/b/home"]')).toHaveAttribute("data-reference-status", "unknown");
    denied = true;
    fireEvent.focus(window);
    await waitFor(() => expect(document.querySelector('[data-reference-uri="wb://page/b/home"]')).toHaveAttribute("data-reference-status", "unavailable"));
    expect(document.querySelector('[data-reference-uri="wb://page/a/home"]')).toHaveAttribute("data-reference-status", "available");
    expect(view.state.doc.eq(before)).toBe(true);
  });

  it("blocks coordinate-based native previews for references but keeps ordinary link previews", async () => {
    render(<DocumentEditor value="[页面](wb://page/p/home) [网站](https://example.com)" onChange={vi.fn()} />);
    const view = await ready();
    const positions: Record<string, number> = {};
    view.state.doc.descendants((node, pos) => {
      const href = node.marks.find(mark => mark.type.name === "link")?.attrs.href;
      if (href) positions[href] = pos;
    });
    const focus = vi.spyOn(view, "hasFocus").mockReturnValue(true);
    const coords = vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: positions["https://example.com"], inside: 0 });
    try {
      fireEvent.mouseMove(view.dom, { clientX: 20, clientY: 20 });
      await waitFor(() => expect(document.querySelector('.milkdown-link-preview')?.getAttribute('data-show')).toBe('true'));
      coords.mockReturnValue({ pos: positions["wb://page/p/home"], inside: 0 });
      // Event target is the paragraph/editor, as with an icon or edge hit test.
      // DOM-target-only filtering does not protect this upstream delayed callback.
      fireEvent.mouseMove(view.dom, { clientX: 20, clientY: 20 });
      await waitFor(() => expect(document.querySelector('.milkdown-link-preview')?.getAttribute('data-show')).toBe('false'));
    } finally { coords.mockRestore(); focus.mockRestore(); }
  });

  it("project reference tab opens directly, cancellation is inert and insertion is one undo", async () => {
    const onChange = vi.fn();
    const onReferenceClick = vi.fn();
    render(<DocumentEditor value="引用说明" onChange={onChange}
      onReferenceClick={onReferenceClick}
      referenceContext={{ source: { kind: "knowledge-document", projectId: "p", workspaceId: "w", docId: "d" }, policy: { sameProjectOnly: true, allowedTargetKinds: ["page", "config", "document"] } }}
      referenceProvider={() => [{ target: { kind: "page", projectId: "p", pageId: "home" }, label: "首页", displayPath: "项目 / 首页" }]} />);
    const view = await ready();
    const before = view.state.doc;
    const depth = undoDepth(view.state);
    open();
    fireEvent.click(screen.getByRole("tab", { name: "插入项目引用", hidden: true }));
    await screen.findByRole("treeitem", { name: "首页" });
    expect(view.state.doc).toBe(before);
    expect(undoDepth(view.state)).toBe(depth);
    fireEvent.click(screen.getByRole("tab", { name: "文档" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭项目引用" }));
    expect(view.state.doc).toBe(before);
    open(); fireEvent.click(screen.getByRole("tab", { name: "插入项目引用", hidden: true }));
    fireEvent.click(await screen.findByRole("treeitem", { name: "首页" }));
    const reference = document.querySelector('[data-reference-uri="wb://page/p/home"]');
    expect(reference).toBeTruthy();
    fireEvent.click(reference!);
    expect(onReferenceClick).toHaveBeenCalledWith({ target: { kind: "page", projectId: "p", pageId: "home" }, labelSnapshot: "首页" });
    expect(screen.queryByRole("dialog", { name: "插入项目引用" })).toBeNull();
    expect(undoDepth(view.state)).toBe(depth + 1);
    expect(view.state.storedMarks).toEqual([]);
    undo(view.state, view.dispatch);
    expect(view.state.doc.eq(before)).toBe(true);
  });
  it("does not reopen a cancelled project reference request when the response arrives", async () => {
    let finish: (value: any[]) => void = () => {};
    render(<DocumentEditor value="说明" onChange={() => {}}
      referenceContext={{ source: { kind: "knowledge-document", projectId: "p", workspaceId: "w", docId: "d" }, policy: { sameProjectOnly: true, allowedTargetKinds: ["page", "config", "document"] } }}
      referenceProvider={() => new Promise(resolve => { finish = resolve; })} />);
    const view = await ready(); const before = view.state.doc;
    open(); fireEvent.click(screen.getByRole("tab", { name: "插入项目引用", hidden: true }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "关闭项目引用" }));
    finish([{ target: { kind: "page", projectId: "p", pageId: "home" }, displayPath: "首页" }]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole("dialog", { name: "插入项目引用" })).toBeNull();
    expect(view.state.doc).toBe(before);
  });
  it("topbar overflow preserves selection, executes a hidden tool and restores at wider widths", async () => {
    let width = 140;
    let resize = () => {};
    const previousObserver = globalThis.ResizeObserver;
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: () => void) {}
      observe(element: HTMLElement) {
        if (element.classList.contains("top-bar-inner")) resize = this.callback;
      }
      unobserve() {}
      disconnect() {}
    });
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("top-bar-inner") ? width : 0;
      });
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return new DOMRect(0, 0, this.classList.contains("top-bar-divider") ? 10 : 70, 32);
      });
    try {
      const { rerender } = render(<DocumentEditor value="选择文字" onChange={() => {}} />);
      const view = await ready();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)));
      const before = view.state.doc;
      const selection = view.state.selection;
      await waitFor(() => expect(document.querySelector(".top-bar-more")).toBeTruthy());
      fireEvent.click(document.querySelector(".top-bar-more")!);
      await waitFor(() => expect(document.querySelector(".top-bar-overflow-menu")).toBeTruthy());
      expect(view.state.doc).toBe(before);
      expect(view.state.selection.eq(selection)).toBe(true);
      fireEvent.click(document.querySelector('.top-bar-overflow-menu [aria-label="加粗"]')!);
      expect(view.state.doc.firstChild?.firstChild?.marks.some(mark => mark.type.name === "strong")).toBe(true);
      await waitFor(() => expect(document.querySelector(".top-bar-overflow-menu")).toBeNull());
      width = 2000;
      resize();
      await waitFor(() => expect(document.querySelector(".top-bar-more")).toBeNull());
      expect(document.querySelector('.top-bar-inner > [aria-label="分隔线"]')).toBeTruthy();
      rerender(<DocumentEditor value="选择文字" onChange={() => {}} readOnly />);
      await waitFor(() => expect(document.querySelector(".top-bar-inner")).toBeNull());
      rerender(<DocumentEditor value="选择文字" onChange={() => {}} />);
      await waitFor(() => expect(document.querySelector('.top-bar-inner > [aria-label="加粗"]')).toBeTruthy());
    } finally {
      clientWidth.mockRestore();
      rect.mockRestore();
      vi.stubGlobal("ResizeObserver", previousObserver);
    }
  });
  it.each(["selection", "topbar"])(
    "%s heading picker converts lists atomically and undoes in one step",
    async (variant) => {
      render(
        <DocumentEditor
          value={"1. 前\n2. **目标**\n3. 后"}
          onChange={() => {}}
        />,
      );
      const view = await ready();
      let pos = 0;
      view.state.doc.descendants((node, start) => {
        if (node.isTextblock && node.textContent === "目标") pos = start;
      });
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, pos + 1, pos + 3),
        ),
      );
      const before = view.state.doc;
      const depth = undoDepth(view.state);
      const trigger =
        variant === "selection"
          ? document.querySelector<HTMLElement>(
              ".document-selection-toolbar-heading",
            )!
          : document
              .querySelector("[data-document-heading-trigger]")!
              .closest("button")!;
      fireEvent.click(trigger);
      const menu = document.querySelector<HTMLElement>(
        `.document-${variant}-heading-menu`,
      )!;
      expect(menu.dataset.show).toBe("true");
      expect(menu.querySelector("select")).toBeNull();
      expect(menu.querySelector('[data-menu-key="h4"]')).toBeNull();
      expect(menu.textContent).toContain("将所选列表项转换为标题");
      fireEvent.click(menu.querySelector('[data-menu-key="h2"]')!);
      expect(view.state.doc.child(1).type.name).toBe("heading");
      expect(view.state.doc.child(1).attrs.level).toBe(2);
      expect(view.state.doc.child(2).attrs.order).toBe(3);
      expect(
        view.state.doc.textBetween(
          view.state.selection.from,
          view.state.selection.to,
        ),
      ).toBe("目标");
      expect(undoDepth(view.state)).toBe(depth + 1);
      undo(view.state, view.dispatch);
      expect(view.state.doc.eq(before)).toBe(true);
    },
  );

  it("Escape closes the heading submenu first and a stale target cannot write", async () => {
    render(<DocumentEditor value="原文" onChange={() => {}} />);
    const view = await ready();
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)),
    );
    const toolbar = document.querySelector<HTMLElement>(
      ".document-selection-toolbar",
    )!;
    const trigger = toolbar.querySelector(
      "button.document-selection-toolbar-heading",
    )!;
    fireEvent.click(trigger);
    const menu = document.querySelector<HTMLElement>(
      ".document-selection-heading-menu",
    )!;
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menu.dataset.show).toBe("false");
    expect(toolbar.dataset.show).toBe("true");
    fireEvent.click(trigger);
    const staleOption = menu.querySelector('[data-menu-key="h1"]')!;
    view.dispatch(view.state.tr.insertText("新", 1));
    const afterUpdate = view.state.doc;
    fireEvent.click(staleOption);
    expect(view.state.doc).toBe(afterUpdate);
    expect(menu.dataset.show).toBe("false");
  });
  it("selection formatting preserves its target, Escape stays dismissed, and a new selection reopens", async () => {
    render(<DocumentEditor value="原文内容" onChange={() => {}} />);
    const view = await ready();
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)),
    );
    const toolbar = document.querySelector<HTMLElement>(
      ".document-selection-toolbar",
    )!;
    expect(toolbar.dataset.show).toBe("true");
    const bold = toolbar.querySelector('[data-toolbar-item="bold"]')!;
    fireEvent.pointerDown(bold);
    fireEvent.click(bold);
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(3);
    expect(view.state.doc.textContent).toBe("原文内容");
    expect(view.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe(
      "strong",
    );
    fireEvent.keyDown(view.dom, { key: "Escape" });
    view.dispatch(view.state.tr);
    expect(toolbar.dataset.show).toBe("false");
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 5)),
    );
    expect(toolbar.dataset.show).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(toolbar.dataset.show).toBe("false");
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    expect(toolbar.dataset.show).toBe("true");
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );
    expect(toolbar.dataset.show).toBe("false");
  });
  it("TopBar uses common/more groups and changes style without inserting or deleting text", async () => {
    const onChange = vi.fn();
    render(<DocumentEditor value="原文" onChange={onChange} />);
    const view = await ready();
    const trigger = document
      .querySelector("[data-document-heading-trigger]")!
      .closest("button")!;
    fireEvent.click(trigger);
    const menu = document.querySelector<HTMLElement>(".document-heading-menu")!;
    expect(menu.dataset.show).toBe("true");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menu.dataset.show).toBe("false");
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger, { detail: 1 });
    expect(menu.dataset.show).toBe("true");
    expect(menu.querySelector('[data-menu-key="h4"]')).toBeNull();
    fireEvent.click(
      Array.from(menu.querySelectorAll('[role="tab"]')).find(
        (tab) => tab.textContent === "更多",
      )!,
    );
    expect(view.state.doc.textContent).toBe("原文");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(menu.querySelector('[data-menu-key="h4"]')!);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.attrs.level).toBe(4);
    expect(view.state.doc.textContent).toBe("原文");
    expect(trigger.textContent).toContain("H4");
    expect(undoDepth(view.state)).toBe(1);
  });
  it("opening, switching groups and cancelling never changes Markdown or history", async () => {
    const onChange = vi.fn();
    render(<DocumentEditor value="原文" onChange={onChange} />);
    const view = await ready();
    const original = view.state.doc;
    const depth = undoDepth(view.state);
    const menu = open();
    fireEvent.click(
      Array.from(menu.querySelectorAll("button")).find(
        (button) => button.textContent === "更多",
      )!,
    );
    view.dispatch(view.state.tr); // Ordinary plugin update must preserve the tab.
    expect(menu.querySelector('[data-menu-key="h4"]')).toBeTruthy();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(view.state.doc).toBe(original);
    expect(undoDepth(view.state)).toBe(depth);
    expect(onChange).not.toHaveBeenCalled();
    expect(menu.dataset.show).toBe("false");
  });

  it("inserting a heading creates one undoable transaction after the current block", async () => {
    render(<DocumentEditor value="原文" onChange={() => {}} />);
    const view = await ready();
    const original = view.state.doc;
    const menu = open();
    fireEvent.click(menu.querySelector('[data-menu-key="h1"]')!);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).textContent).toBe("原文");
    expect(view.state.doc.child(1).type.name).toBe("heading");
    expect(undoDepth(view.state)).toBe(1);
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.eq(original)).toBe(true);
  });

  it("slash navigation keeps editor focus and Escape does not reopen on selection-only updates", async () => {
    render(<DocumentEditor value="" onChange={() => {}} />);
    const view = await ready();
    view.focus();
    view.dispatch(view.state.tr.insertText("/", 1));
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
    );
    const menu = document.querySelector<HTMLElement>(".document-insert-menu")!;
    expect(menu.dataset.show).toBe("true");
    expect(document.activeElement).toBe(view.dom);
    fireEvent.keyDown(view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(view.dom, { key: "Escape" });
    view.dispatch(view.state.tr);
    expect(menu.dataset.show).toBe("false");
    expect(view.state.doc.textContent).toBe("/");
  });

  it.each([
    ["列表", "bullet-list", "bullet_list"],
    ["列表", "ordered-list", "ordered_list"],
    ["列表", "task-list", "bullet_list"],
    ["插入", "code", "code_block"],
    ["插入", "table", "table"],
    ["文本", "quote", "blockquote"],
    ["文本", "divider", "hr"],
  ])(
    "inserts valid %s/%s structure in one transaction",
    async (group, key, type) => {
      render(<DocumentEditor value="原文" onChange={() => {}} />);
      const view = await ready();
      const original = view.state.doc;
      const menu = open();
      fireEvent.click(
        Array.from(menu.querySelectorAll('[role="tab"]')).find(
          (tab) => tab.textContent === group,
        )!,
      );
      fireEvent.click(menu.querySelector(`[data-menu-key="${key}"]`)!);
      expect(view.state.doc.child(1).type.name).toBe(type);
      expect(() => view.state.doc.check()).not.toThrow();
      expect(undoDepth(view.state)).toBe(1);
      undo(view.state, view.dispatch);
      expect(view.state.doc.eq(original)).toBe(true);
    },
  );

  it("switching resource identity resets menus and history even for identical content", async () => {
    const { rerender } = render(
      <DocumentEditor documentKey="a" value="原文" onChange={() => {}} />,
    );
    const first = await ready();
    open();
    rerender(
      <DocumentEditor documentKey="b" value="原文" onChange={() => {}} />,
    );
    await waitFor(() => expect(fixture.view).not.toBe(first));
    await ready();
    expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(
      document.querySelector<HTMLElement>(".document-block-menu")?.dataset.show,
    ).toBe("false");
    expect(undoDepth(fixture.view!.state)).toBe(0);
  });
});
