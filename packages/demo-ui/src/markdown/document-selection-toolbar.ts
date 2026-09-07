import type { Ctx } from "@milkdown/kit/ctx";
import type { Editor } from "@milkdown/kit/core";
import type { PluginView } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { commandsCtx } from "@milkdown/kit/core";
import {
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  isMarkSelectedCommand,
  linkSchema,
  paragraphSchema,
  setBlockTypeCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  strikethroughSchema,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";
import { posToDOMRect } from "@milkdown/kit/prose";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  getHeadingStyleLabel,
  HEADING_STYLE_OPTIONS,
} from "./heading-style-toolbar";
import { mountDocumentOverlayPositioner } from "./document-overlay-positioning";

const ICONS = {
  bold: '<svg viewBox="0 0 24 24"><path d="M8 5h4.5a4 4 0 0 1 2.7 7A4.4 4.4 0 0 1 12.5 19H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 2v4h2.2a2 2 0 1 0 0-4H10Zm0 6v4h2.5a2.2 2.2 0 1 0 0-4H10Z"/></svg>',
  italic:
    '<svg viewBox="0 0 24 24"><path d="M10 5h8v2h-3l-4 10h3v2H6v-2h3l4-10h-3V5Z"/></svg>',
  strike:
    '<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5v-2Zm3.3-2.1c.1-1.2 1.1-2 2.9-2 1.7 0 2.8.6 3.8 1.6l1.4-1.4C15.1 5.7 13.4 5 11.2 5 8.1 5 6.2 6.5 6.2 9c0 .2 0 .5.1.7h2.1c-.1-.3-.1-.6-.1-.8Zm6.3 6.2h-2.2c.2.4.3.8.3 1.2 0 1.1-.9 1.8-2.6 1.8-1.5 0-2.8-.6-3.7-1.7l-1.5 1.4c1.2 1.5 3 2.2 5.2 2.2 3.1 0 5-1.5 5-3.9 0-.4-.2-.7-.5-1Z"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="m8.7 7.3-4.7 4.7 4.7 4.7 1.4-1.4L6.8 12l3.3-3.3-1.4-1.4Zm6.6 0-1.4 1.4 3.3 3.3-3.3 3.3 1.4 1.4 4.7-4.7-4.7-4.7Z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10.6 13.4a1 1 0 0 0 1.4 0l2.8-2.8a3 3 0 0 0-4.2-4.2L9 8l1.4 1.4 1.6-1.6a1 1 0 1 1 1.4 1.4l-2.8 2.8a1 1 0 0 1-1.4 0L10.6 13.4ZM13.4 10.6a1 1 0 0 0-1.4 0l-2.8 2.8a3 3 0 0 0 4.2 4.2L15 16l-1.4-1.4-1.6 1.6a1 1 0 1 1-1.4-1.4l2.8-2.8a1 1 0 0 1 1.4 0l-1.4-1.4Z"/></svg>',
  comment:
    '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v13l4-3h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 10H5.3L4 15V6h16v8Z"/></svg>',
};

interface ToolbarAction {
  key: string;
  label: string;
  icon: string;
  isActive: (ctx: Ctx) => boolean;
  run: (ctx: Ctx) => void;
}

export interface DocumentSelectionToolbarOptions {
  root: HTMLElement;
  onCommentSelection?: (view: EditorView) => void;
}

function isSelectionVisible(view: EditorView, content: HTMLElement): boolean {
  const { doc, selection } = view.state;
  if (
    !view.editable ||
    !(selection instanceof TextSelection || selection instanceof AllSelection)
  )
    return false;
  if (selection.empty || !doc.textBetween(selection.from, selection.to).length)
    return false;

  const activeElement = (view.dom.getRootNode() as ShadowRoot | Document)
    .activeElement;
  return view.hasFocus() || content.contains(activeElement);
}

function getCurrentHeadingLevel(ctx: Ctx, view: EditorView): number | null {
  const parent = view.state.selection.$from.parent;
  const heading = headingSchema.type(ctx);
  if (parent.type !== heading) return null;
  return Number(parent.attrs.level);
}

function createIcon(ownerDocument: Document, icon: string): HTMLSpanElement {
  const element = ownerDocument.createElement("span");
  element.className = "document-selection-toolbar-icon";
  element.setAttribute("aria-hidden", "true");
  element.innerHTML = icon;
  return element;
}

function createActionGroups(): ToolbarAction[][] {
  return [
    [
      {
        key: "bold",
        label: "加粗",
        icon: ICONS.bold,
        isActive: (ctx) =>
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, strongSchema.type(ctx)),
        run: (ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key),
      },
      {
        key: "italic",
        label: "斜体",
        icon: ICONS.italic,
        isActive: (ctx) =>
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, emphasisSchema.type(ctx)),
        run: (ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key),
      },
      {
        key: "strike",
        label: "删除线",
        icon: ICONS.strike,
        isActive: (ctx) =>
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, strikethroughSchema.type(ctx)),
        run: (ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key),
      },
    ],
    [
      {
        key: "inline-code",
        label: "行内代码",
        icon: ICONS.code,
        isActive: (ctx) =>
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, inlineCodeSchema.type(ctx)),
        run: (ctx) => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key),
      },
      {
        key: "link",
        label: "链接",
        icon: ICONS.link,
        isActive: (ctx) =>
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, linkSchema.type(ctx)),
        run: (ctx) => ctx.get(commandsCtx).call(toggleLinkCommand.key),
      },
    ],
  ];
}

function createHeadingSelector(
  ctx: Ctx,
  view: EditorView,
  ownerDocument: Document,
  onUpdate: () => void,
): HTMLSelectElement {
  const select = ownerDocument.createElement("select");
  select.className = "document-selection-toolbar-heading";
  select.setAttribute("aria-label", "标题样式");
  select.dataset.headingStyle = "";
  HEADING_STYLE_OPTIONS.forEach((option) => {
    const item = ownerDocument.createElement("option");
    item.value = option.level === null ? "paragraph" : String(option.level);
    item.textContent = option.label;
    select.append(item);
  });
  select.addEventListener("change", () => {
    const raw = select.value;
    const level = raw === "paragraph" ? null : Number(raw);
    const nodeType =
      level === null ? paragraphSchema.type(ctx) : headingSchema.type(ctx);
    ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
      nodeType,
      ...(level === null ? {} : { attrs: { level } }),
    });
    view.focus();
    onUpdate();
  });
  return select;
}

class DocumentSelectionToolbarView implements PluginView {
  readonly #content: HTMLElement;
  #dismissedSelection: EditorView["state"]["selection"] | null = null;
  #destroyed = false;
  #selectionFrame: number | null = null;
  readonly #positioner: ReturnType<typeof mountDocumentOverlayPositioner>;
  readonly #ctx: Ctx;
  readonly #view: EditorView;
  readonly #actions: ToolbarAction[][];
  readonly #headingSelector: HTMLSelectElement;
  readonly #onCommentSelection?: (view: EditorView) => void;

  constructor(
    ctx: Ctx,
    view: EditorView,
    options: DocumentSelectionToolbarOptions,
  ) {
    this.#ctx = ctx;
    this.#view = view;
    this.#onCommentSelection = options.onCommentSelection;
    this.#actions = createActionGroups();
    const ownerDocument = view.dom.ownerDocument;

    const content = ownerDocument.createElement("div");
    content.className = "milkdown-toolbar document-selection-toolbar";
    content.dataset.documentSelectionToolbar = "";
    content.setAttribute("role", "toolbar");
    content.setAttribute("aria-label", "文字格式工具");
    this.#content = content;

    content.dataset.show = "false";
    content.dataset.safe = "false";
    this.#headingSelector = createHeadingSelector(
      ctx,
      view,
      ownerDocument,
      () => this.update(view),
    );
    content.append(this.#headingSelector);
    const more = ownerDocument.createElement("details");
    more.className = "document-selection-toolbar-more";
    const summary = ownerDocument.createElement("summary");
    summary.textContent = "更多";
    summary.setAttribute("aria-label", "更多文字格式");
    summary.addEventListener("pointerdown", (event) => event.preventDefault());
    more.append(summary);
    content.append(more);
    this.#actions.forEach((group, groupIndex) => {
      const target = groupIndex === 0 ? content : more;
      if (groupIndex > 0) {
        const divider = ownerDocument.createElement("span");
        divider.className = "document-selection-toolbar-divider";
        divider.setAttribute("role", "separator");
        target.append(divider);
      }
      group.forEach((action) => {
        const button = ownerDocument.createElement("button");
        button.type = "button";
        button.className = "toolbar-item document-selection-toolbar-item";
        button.dataset.toolbarItem = action.key;
        button.title = action.label;
        button.setAttribute("aria-label", action.label);
        button.append(createIcon(ownerDocument, action.icon));
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
        });
        button.addEventListener("click", () => {
          action.run(this.#ctx);
          this.#view.focus();
          this.update(this.#view);
        });
        if (target === content) content.insertBefore(button, more);
        else target.append(button);
      });
    });

    if (this.#onCommentSelection) {
      const divider = ownerDocument.createElement("span");
      divider.className = "document-selection-toolbar-divider";
      divider.setAttribute("role", "separator");
      content.append(divider);
      const commentButton = ownerDocument.createElement("button");
      commentButton.type = "button";
      commentButton.className =
        "toolbar-item document-selection-toolbar-item document-comment-selection-button";
      commentButton.dataset.toolbarItem = "comment";
      commentButton.title = "添加选区评论";
      commentButton.setAttribute("aria-label", "添加选区评论");
      commentButton.append(createIcon(ownerDocument, ICONS.comment));
      commentButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      commentButton.addEventListener("click", () => {
        this.#onCommentSelection?.(this.#view);
      });
      content.append(commentButton);
    }

    options.root.append(content);
    this.#positioner = mountDocumentOverlayPositioner({
      root: options.root,
      boundary: view.dom.closest(".document-editor-crepe") ?? options.root,
      selectionToolbar: true,
      floating: content,
      contextElement: view.dom,
      getReferenceRect: () => {
        if (!this.#shouldShow()) return null;
        try {
          return posToDOMRect(
            view,
            view.state.selection.from,
            view.state.selection.to,
          );
        } catch {
          return null;
        }
      },
      getObstacles: () => {
        const topBar = view.dom
          .closest<HTMLElement>(".milkdown")
          ?.querySelector<HTMLElement>(".milkdown-top-bar");
        const topBarRect = topBar?.getBoundingClientRect();
        const topBarSafeRect = topBarRect
          ? new DOMRect(
              topBarRect.left - 8,
              topBarRect.top - 8,
              topBarRect.width + 16,
              topBarRect.height + 16,
            )
          : null;
        return topBarSafeRect ? [topBarSafeRect] : [];
      },
      placements: ["top-start", "bottom-start"],
      gap: 8,
    });
    ownerDocument.addEventListener("pointerdown", this.#onPointerDown, true);
    ownerDocument.addEventListener("pointerup", this.#onSelectionEvent);
    ownerDocument.addEventListener("selectionchange", this.#onSelectionEvent);
    ownerDocument.addEventListener("focusin", this.#onSelectionEvent);
    ownerDocument.addEventListener("focusout", this.#onSelectionEvent);
    ownerDocument.addEventListener("keydown", this.#onKeyDown, true);
    more.addEventListener("toggle", this.#onSelectionEvent);
    this.update(view);
  }

  #shouldShow = () =>
    !this.#destroyed &&
    !this.#dismissedSelection?.eq(this.#view.state.selection) &&
    isSelectionVisible(this.#view, this.#content);

  #onSelectionEvent = () => {
    // Focusout and focusin are separate native events. A microtask between
    // them can hide the target before focus reaches the toolbar control.
    const window = this.#content.ownerDocument.defaultView;
    if (!window || this.#selectionFrame !== null) return;
    this.#selectionFrame = window.requestAnimationFrame(() => {
      this.#selectionFrame = null;
      if (!this.#destroyed) this.update(this.#view);
    });
  };

  #onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && this.#content.contains(target)) {
      // Native select/details must receive focus; prevent only formatting
      // button pointerdown (registered on each button above).
      return;
    }
    if (target && this.#view.dom.contains(target)) {
      this.#dismissedSelection = null;
      return;
    }
    this.#dismiss();
  };

  #dismiss = () => {
    this.#dismissedSelection = this.#view.state.selection;
    this.#content.dataset.show = "false";
    this.#content.querySelector("details")?.removeAttribute("open");
    this.#positioner.hide();
  };

  #onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || this.#content.dataset.show !== "true") return;
    event.preventDefault();
    event.stopPropagation();
    const toolbarFocused = this.#content.contains(
      this.#content.ownerDocument.activeElement,
    );
    this.#dismiss();
    if (toolbarFocused) this.#view.focus();
  };

  update = (view: EditorView) => {
    if (this.#destroyed) return;
    const visible = this.#shouldShow();
    this.#content.dataset.show = String(visible);
    if (!visible) {
      this.#positioner.hide();
    } else {
      void this.#positioner.refresh();
    }

    const level = getCurrentHeadingLevel(this.#ctx, view);
    this.#headingSelector.value = level === null ? "paragraph" : String(level);
    this.#headingSelector.title = getHeadingStyleLabel(level);
    this.#actions.flat().forEach((action) => {
      const button = this.#content.querySelector<HTMLElement>(
        `[data-toolbar-item="${action.key}"]`,
      );
      if (!button) return;
      let active = false;
      try {
        active = action.isActive(this.#ctx);
      } catch {
        active = false;
      }
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  destroy = () => {
    this.#destroyed = true;
    const ownerDocument = this.#content.ownerDocument;
    if (this.#selectionFrame !== null)
      ownerDocument.defaultView?.cancelAnimationFrame(this.#selectionFrame);
    ownerDocument.removeEventListener("pointerdown", this.#onPointerDown, true);
    ownerDocument.removeEventListener("pointerup", this.#onSelectionEvent);
    ownerDocument.removeEventListener(
      "selectionchange",
      this.#onSelectionEvent,
    );
    ownerDocument.removeEventListener("focusin", this.#onSelectionEvent);
    ownerDocument.removeEventListener("focusout", this.#onSelectionEvent);
    ownerDocument.removeEventListener("keydown", this.#onKeyDown, true);
    this.#positioner.destroy();
    this.#content.remove();
  };
}

export const documentSelectionToolbar = (
  editor: Editor,
  options?: DocumentSelectionToolbarOptions,
) => {
  if (!options) return;
  editor.use(
    $prose((ctx) => {
      return new Plugin({
        key: new PluginKey("DOCUMENT_SELECTION_TOOLBAR"),
        view: (view) => new DocumentSelectionToolbarView(ctx, view, options),
      });
    }),
  );
};
