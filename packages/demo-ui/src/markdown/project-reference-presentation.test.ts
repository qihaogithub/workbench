import { describe, expect, it, vi } from "vitest";
import { Schema, DOMSerializer } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { history, undo } from "@milkdown/kit/prose/history";
import {
  encodeMarkdownReferenceUri,
  type MarkdownReferenceCandidate,
} from "@workbench/shared/markdown-reference";
import {
  createProjectReferencePresentationPlugin,
  projectReferenceDirectoryMeta,
  referenceDecorations,
  suppressReferenceLinkPreview,
  guardReferencePreviewView,
  findReferenceElement,
} from "./project-reference-presentation";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
  marks: {
    link: {
      attrs: { href: {} },
      // Match Milkdown's actual DOM while keeping canonical href in the document.
      toDOM: (mark) => [
        "a",
        { href: mark.attrs.href.startsWith("wb://") ? "" : mark.attrs.href },
        0,
      ],
    },
    strong: { toDOM: () => ["strong", 0] },
  },
});
const target = {
  kind: "config",
  projectId: "项目",
  pageId: "页面",
  fieldPath: "group/name",
} as const;
const uri = encodeMarkdownReferenceUri(target);
const candidate: MarkdownReferenceCandidate = {
  target,
  label: "Current name",
  displayPath: "Project / Page / Group / Current name",
};
const doc = schema.node("doc", null, [
  schema.node("paragraph", null, [
    schema.text("Old name", [schema.mark("link", { href: uri })]),
  ]),
]);

describe("reference presentation", () => {
  it("does not mark a different project's unresolved directory as missing", () => {
    const attributes = (resolved: ReadonlySet<string>) =>
      (
        referenceDecorations(doc, [], resolved).find()[0] as unknown as {
          type: { attrs: Record<string, string> };
        }
      ).type.attrs;
    expect(attributes(new Set(["other"]))["data-reference-status"]).toBe(
      "unknown",
    );
    expect(
      attributes(new Set([target.projectId]))["data-reference-status"],
    ).toBe("unavailable");
    const sameIds = {
      ...candidate,
      target: { ...target, projectId: "other" },
      label: "Wrong project",
    };
    const decoration = referenceDecorations(
      doc,
      [sameIds, candidate],
      new Set(["other", target.projectId]),
    ).find()[0] as unknown as { type: { attrs: Record<string, string> } };
    expect(decoration.type.attrs["data-reference-label"]).toBe(candidate.label);
  });
  it("uses canonical full target identity and distinguishes unknown from unavailable", () => {
    const attrs = (directory: readonly MarkdownReferenceCandidate[] | null) =>
      (
        referenceDecorations(doc, directory).find()[0] as unknown as {
          type: { attrs: Record<string, string> };
        }
      ).type.attrs;
    expect(attrs([candidate])["data-reference-label"]).toBe("Current name");
    expect(attrs(null)["data-reference-status"]).toBe("unknown");
    expect(attrs([])["aria-disabled"]).toBe("true");
    expect(
      attrs([{ ...candidate, target: { ...target, projectId: "another" } }])[
        "data-reference-status"
      ],
    ).toBe("unavailable");
    expect(doc.textContent).toBe("Old name");
  });

  it("refreshes without document steps or undo entries; shows safe popup and cleans up", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let directory: readonly MarkdownReferenceCandidate[] | null = null;
    const view = new EditorView(root, {
      state: EditorState.create({
        doc,
        plugins: [
          history(),
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => directory,
          }),
        ],
      }),
    });
    directory = [{ ...candidate, label: "<img src=x onerror=alert(1)>" }];
    const tr = view.state.tr.setMeta(projectReferenceDirectoryMeta, true);
    expect(tr.docChanged).toBe(false);
    view.dispatch(tr);
    expect(view.state.doc.eq(doc)).toBe(true);
    expect(undo(view.state)).toBe(false);
    const reference = root.querySelector<HTMLElement>(".wb-reference")!;
    expect(reference.textContent).toBe("Old name");
    expect(reference.getAttribute("aria-label")).toBe(directory[0].label);
    reference.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const popup = root.querySelector<HTMLElement>(".wb-reference-popup")!;
    await vi.waitFor(() => expect(popup.hidden).toBe(false));
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.textContent).toContain(candidate.displayPath);
    expect(reference.getAttribute("aria-describedby")).toBe(popup.id);
    window.dispatchEvent(new Event("scroll"));
    expect(popup.hidden).toBe(true);
    expect(reference.hasAttribute("aria-describedby")).toBe(false);
    reference.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(popup.hidden).toBe(false);
    reference.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(popup.hidden).toBe(true);
    view.destroy();
    expect(root.querySelector(".wb-reference-popup")).toBeNull();
    root.remove();
  });

  it("treats directory exceptions as unknown", () => {
    const root = document.createElement("div");
    const view = new EditorView(root, {
      state: EditorState.create({
        doc,
        plugins: [
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => {
              throw new Error("offline");
            },
          }),
        ],
      }),
    });
    expect(
      root
        .querySelector(".wb-reference")
        ?.getAttribute("data-reference-status"),
    ).toBe("unknown");
    view.destroy();
  });

  it("supports document subtypes and ignores malformed or ordinary URLs", () => {
    for (const documentKind of [
      undefined,
      "knowledge",
      "memory",
      "project-convention",
      "page-convention",
      "design-spec",
    ] as const) {
      const documentTarget = {
        kind: "document" as const,
        projectId: "项目",
        docId:
          documentKind === "memory"
            ? "memory"
            : documentKind === "project-convention"
              ? "convention"
              : "文档",
        documentKind,
      };
      const documentUri = encodeMarkdownReferenceUri(documentTarget);
      const documentNode = schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("snapshot", [schema.mark("link", { href: documentUri })]),
        ]),
      ]);
      expect(
        referenceDecorations(documentNode, [
          {
            target: documentTarget,
            label: "current",
            displayPath: "Folder/current",
          },
        ]).find(),
      ).toHaveLength(1);
    }
    for (const href of [
      "https://example.com",
      "wb://config/project/page",
      "wb://page/%XX/page",
    ]) {
      const ordinary = schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("link", [schema.mark("link", { href })]),
        ]),
      ]);
      expect(referenceDecorations(ordinary, []).find()).toHaveLength(0);
    }
  });

  it("does not repeat the replacement label or icon across formatted text runs", () => {
    const mark = schema.mark("link", { href: uri });
    const formatted = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Old ", [mark]),
        schema.text("name", [mark, schema.mark("strong")]),
      ]),
    ]);
    const root = document.createElement("div");
    const view = new EditorView(root, {
      state: EditorState.create({
        doc: formatted,
        plugins: [
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => [candidate],
          }),
        ],
      }),
    });
    expect(
      root.querySelectorAll(".wb-reference:not(.wb-reference-continuation)"),
    ).toHaveLength(1);
    expect(root.querySelectorAll(".wb-reference-continuation")).toHaveLength(1);
    expect(
      root
        .querySelector(".wb-reference-continuation")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(view.state.doc.textContent).toBe("Old name");
    const copy = document.createElement("div");
    copy.appendChild(
      DOMSerializer.fromSchema(schema).serializeFragment(
        view.state.doc.content,
      ),
    );
    expect(copy.textContent).toBe("Old name");
    expect(copy.querySelector("strong")?.textContent).toBe("name");
    expect(copy.querySelector(".wb-reference")).toBeNull();
    view.destroy();
  });

  it("skips the native reference preview but preserves normal mousemove handlers", async () => {
    const root = document.createElement("div");
    const mousemove = vi.fn(() => false);
    const mouseleave = vi.fn(() => false);
    const view = new EditorView(root, {
      ...suppressReferenceLinkPreview({
        handleDOMEvents: { mousemove, mouseleave },
      }),
      state: EditorState.create({
        doc,
        plugins: [
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => [candidate],
          }),
        ],
      }),
    });
    root
      .querySelector(".wb-reference")!
      .dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(mousemove).not.toHaveBeenCalled();
    expect(mouseleave).toHaveBeenCalledOnce();
    const anchor = root.querySelector("a")!;
    expect(anchor.hasAttribute("href")).toBe(false);
    expect(anchor.getAttribute("role")).toBe("presentation");
    expect(anchor.hasAttribute("tabindex")).toBe(false);
    anchor.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(mousemove).not.toHaveBeenCalled();
    expect(mouseleave).toHaveBeenCalledTimes(2);
    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLElement>(".wb-reference-popup")?.hidden,
      ).toBe(false),
    );
    view.dom.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(mousemove).toHaveBeenCalledOnce();
    view.destroy();
  });

  it("guards delayed native previews without changing ordinary links", () => {
    const original = vi.fn();
    const native = { show: original, hide: vi.fn(), update: vi.fn() };
    const guarded = guardReferencePreviewView(native) as typeof native;
    guarded.show(schema.mark("link", { href: uri }), 1, 8, new DOMRect());
    expect(original).not.toHaveBeenCalled();
    expect(native.hide).toHaveBeenCalledOnce();
    const normal = schema.mark("link", { href: "https://example.com" });
    guarded.show(normal, 1, 8, new DOMRect());
    expect(original).toHaveBeenCalledWith(normal, 1, 8, expect.any(DOMRect));
  });

  it("uses the whole wrapper and retains the tooltip across the pointer gap", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const view = new EditorView(root, {
      state: EditorState.create({
        doc,
        plugins: [
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => [candidate],
          }),
        ],
      }),
    });
    const reference = root.querySelector<HTMLElement>(".wb-reference")!;
    const wrapper = root.querySelector<HTMLElement>(
      "[data-wb-reference-wrapper]",
    )!;
    const popup = root.querySelector<HTMLElement>(".wb-reference-popup")!;
    try {
      expect(findReferenceElement(wrapper, view.dom)).toBe(reference);
      expect(findReferenceElement(reference.firstChild, view.dom)).toBe(
        reference,
      );
      wrapper.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(popup.hidden).toBe(true);
      await vi.waitFor(() => expect(popup.hidden).toBe(false));
      expect(popup.querySelector("strong")?.textContent).toBe(
        "配置项 · Current name",
      );
      expect(popup.textContent).toContain(`来源：${candidate.displayPath}`);
      expect(popup.textContent).toContain("点击引用，在新标签页打开");
      expect(view.state.doc.eq(doc)).toBe(true);
      wrapper.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: root }),
      );
      popup.dispatchEvent(new MouseEvent("mouseenter"));
      await new Promise((resolve) => setTimeout(resolve, 170));
      expect(popup.hidden).toBe(false);
      popup.dispatchEvent(new Event("scroll"));
      expect(popup.hidden).toBe(false);
      popup.dispatchEvent(
        new MouseEvent("mouseleave", { relatedTarget: root }),
      );
      await vi.waitFor(() => expect(popup.hidden).toBe(true));
      reference.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(popup.hidden).toBe(false);
      reference.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      wrapper.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      expect(popup.hidden).toBe(true);
      expect(view.state.doc.eq(doc)).toBe(true);
    } finally {
      view.destroy();
      root.remove();
    }
  });

  it("keeps focused tooltip across selection-only updates, inherits font size, and hides on directory/doc updates", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const style = document.createElement("style");
    style.textContent = "[data-wb-reference-wrapper] { font-size: 32px; }";
    document.head.appendChild(style);
    const view = new EditorView(root, {
      state: EditorState.create({
        doc,
        plugins: [
          createProjectReferencePresentationPlugin({
            root,
            getCandidates: () => [candidate],
          }),
        ],
      }),
    });
    try {
      const reference = root.querySelector<HTMLElement>(".wb-reference")!;
      const wrapper = root.querySelector<HTMLElement>(
        "[data-wb-reference-wrapper]",
      )!;
      const popup = root.querySelector<HTMLElement>(".wb-reference-popup")!;
      expect(wrapper.style.getPropertyValue("--wb-reference-font-size")).toBe(
        "32px",
      );
      expect(root.querySelectorAll('[role="link"], a[href]')).toHaveLength(1);
      reference.focus();
      expect(document.activeElement).toBe(reference);
      expect(popup.hidden).toBe(false);
      reference.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Shift", bubbles: true }),
      );
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
      );
      expect(popup.hidden).toBe(false);
      expect(reference.getAttribute("aria-describedby")).toBe(popup.id);
      view.dispatch(view.state.tr.setMeta(projectReferenceDirectoryMeta, true));
      expect(popup.hidden).toBe(true);
      reference.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(popup.hidden).toBe(false);
      view.dispatch(view.state.tr.insertText("!", 1));
      expect(popup.hidden).toBe(true);
    } finally {
      view.destroy();
      root.remove();
      style.remove();
    }
  });
});
