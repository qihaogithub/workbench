import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
