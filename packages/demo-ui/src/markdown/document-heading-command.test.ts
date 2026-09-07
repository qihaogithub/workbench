import { describe, expect, it } from "vitest";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { AllSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  buildHeadingTransaction,
  getHeadingSelection,
} from "./document-heading-command";

async function fixture(
  markdown: string,
  run: (view: EditorView, editor: Editor) => void,
) {
  const root = document.createElement("div");
  document.body.append(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);
  await editor.create();
  try {
    run(editor.ctx.get(editorViewCtx), editor);
  } finally {
    await editor.destroy();
    root.remove();
  }
}

function select(view: EditorView, text: string) {
  let pos = -1;
  view.state.doc.descendants((node, start) => {
    if (node.isTextblock && node.textContent === text) pos = start;
  });
  expect(pos).toBeGreaterThanOrEqual(0);
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, pos + 1, pos + 1 + text.length),
    ),
  );
}

describe("heading conversion semantics", () => {
  it("extracts the middle ordered item, preserving marks, tail ordinals and Markdown roundtrip", async () => {
    await fixture("1. 前\n2. **目标**\n3. 后", (view, editor) => {
      select(view, "目标");
      const tr = buildHeadingTransaction(view.state, 1);
      expect(tr).not.toBeNull();
      view.dispatch(tr!);
      expect(view.state.doc.childCount).toBe(3);
      const heading = view.state.doc.child(1);
      expect(heading.type.name).toBe("heading");
      expect(heading.attrs.level).toBe(1);
      expect(heading.textContent).toBe("目标");
      expect(heading.firstChild?.marks[0].type.name).toBe("strong");
      expect(view.state.doc.child(2).attrs.order).toBe(3);
      expect(
        view.state.doc.textBetween(
          view.state.selection.from,
          view.state.selection.to,
        ),
      ).toBe("目标");
      const markdown = editor.action(getMarkdown());
      expect(markdown).toContain("# **目标**");
      const parsed = editor.ctx.get(parserCtx)(markdown)!;
      expect(parsed.child(1).type.name).toBe("heading");
      expect(parsed.child(2).attrs.order).toBe(3);
    });
  });

  it.each([
    "* 前\n* 目标\n* 后",
    "* [x] 前\n* [ ] 目标\n* [x] 后",
    "* 外层\n  * 前\n  * 目标\n  * 后\n* 末尾",
  ])("extracts bullet/task/nested list items: %s", async (markdown) => {
    await fixture(markdown, (view) => {
      select(view, "目标");
      const text = view.state.doc.textContent;
      const tr = buildHeadingTransaction(view.state, 2);
      expect(tr).not.toBeNull();
      view.dispatch(tr!);
      expect(view.state.doc.textContent).toBe(text);
      const $from = view.state.selection.$from;
      expect($from.parent.type.name).toBe("heading");
      expect($from.parent.attrs.level).toBe(2);
      for (let d = 1; d < $from.depth; d++)
        expect($from.node(d).type.name).not.toBe("list_item");
      expect(() => view.state.doc.check()).not.toThrow();
    });
  });

  it("reports mixed styles and converts every selected paragraph", async () => {
    await fixture("# 首\n\n正文\n\n1. 列表", (view) => {
      view.dispatch(
        view.state.tr.setSelection(new AllSelection(view.state.doc)),
      );
      expect(getHeadingSelection(view.state).label).toBe("混合");
      const tr = buildHeadingTransaction(view.state, 2);
      expect(tr).not.toBeNull();
      view.dispatch(tr!);
      view.state.doc.forEach((node) => {
        expect(node.type.name).toBe("heading");
        expect(node.attrs.level).toBe(2);
      });
    });
  });

  it("refuses a mixed code selection without partial conversion", async () => {
    await fixture("正文\n\n\`\`\`js\nconst x = 1\n\`\`\`", (view) => {
      view.dispatch(
        view.state.tr.setSelection(new AllSelection(view.state.doc)),
      );
      const before = view.state.doc;
      expect(buildHeadingTransaction(view.state, 1)).toBeNull();
      expect(getHeadingSelection(view.state).reason).toBeTruthy();
      expect(view.state.doc).toBe(before);
    });
  });
});
