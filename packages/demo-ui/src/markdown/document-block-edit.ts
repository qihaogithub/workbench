import type { Ctx } from "@milkdown/kit/ctx";
import type { Editor } from "@milkdown/kit/core";
import type { EditorState, PluginView } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { BlockProvider, block, blockConfig } from "@milkdown/kit/plugin/block";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { findParent, posToDOMRect } from "@milkdown/kit/prose";
import { TextSelection } from "@milkdown/kit/prose/state";

import type { ConfigReferenceCandidate } from "../DocumentEditor";
import type { CrepeProjectActions } from "./crepe-config";
import {
  DocumentBlockMenu,
  createDocumentBlockNode,
  type DocumentBlockMenuItem,
} from "./document-block-menu";
import { mountDocumentOverlayPositioner } from "./document-overlay-positioning";

const HANDLE_ICON =
  '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="1.4"/><circle cx="16" cy="7" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/><circle cx="8" cy="17" r="1.4"/><circle cx="16" cy="17" r="1.4"/></svg>';

export interface DocumentBlockEditOptions {
  root: HTMLElement;
  actions: CrepeProjectActions;
  referenceCandidates?: ConfigReferenceCandidate[];
  enableUploads?: boolean;
  enableProjectReferences?: boolean;
}

export function isBlockHandleActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

function isSelectionAtEndOfNode(selection: EditorState["selection"]): boolean {
  return (
    selection instanceof TextSelection &&
    selection.$head.parentOffset === selection.$head.parent.content.size
  );
}

function getFirstLineRect(element: HTMLElement): DOMRect {
  const label = element.querySelector<HTMLElement>(".label-wrapper");
  if (label) return label.getBoundingClientRect();

  try {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const firstRect = Array.from(range.getClientRects()).find(
      (rect) => rect.width > 0 || rect.height > 0,
    );
    if (firstRect) return firstRect;
  } catch {
    // A detached or partially-rendered block can have no range yet.
  }
  return element.getBoundingClientRect();
}

function isInsideExcludedBlock(selection: EditorState["selection"]): boolean {
  return Boolean(
    findParent((node) =>
      ["table", "blockquote", "math_inline"].includes(node.type.name),
    )(selection.$from),
  );
}

function createHandleButton(ownerDocument: Document): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "document-block-handle-trigger";
  button.dataset.blockHandleTrigger = "";
  button.title = "打开插入菜单";
  button.setAttribute("aria-label", "打开插入菜单");
  const icon = ownerDocument.createElement("span");
  icon.className = "document-block-handle-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = HANDLE_ICON;
  button.append(icon);
  return button;
}

class DocumentBlockEditView implements PluginView {
  readonly #ctx: Ctx;
  readonly #view: EditorView;
  readonly #content: HTMLDivElement;
  readonly #handle: HTMLButtonElement;
  readonly #provider: BlockProvider;
  readonly #menu: DocumentBlockMenu;
  readonly #positioner: ReturnType<typeof mountDocumentOverlayPositioner>;
  #programmaticPos: number | null = null;
  #menuAnchorElement: HTMLElement | null = null;
  #anchorDoc: EditorState["doc"] | null = null;
  #slashDismissed = false;

  constructor(ctx: Ctx, view: EditorView, options: DocumentBlockEditOptions) {
    this.#ctx = ctx;
    this.#view = view;
    const ownerDocument = view.dom.ownerDocument;

    const content = ownerDocument.createElement("div");
    content.className = "milkdown-block-handle document-block-handle";
    content.dataset.documentBlockHandle = "";
    const handle = createHandleButton(ownerDocument);
    content.append(handle);
    this.#content = content;
    this.#handle = handle;

    this.#provider = new BlockProvider({
      ctx,
      content,
      root: options.root,
      // The 32px gutter contains the 32px hit area. The 16px icon is centered
      // inside it, leaving the requested 8px visual gap before the text.
      getOffset: () => 0,
      getPlacement: () => "left-start",
      getPosition: ({ active }) => getFirstLineRect(active.el),
    });

    this.#menu = new DocumentBlockMenu(
      ctx,
      {
        actions: options.actions,
        referenceCandidates: options.referenceCandidates,
        enableUploads: options.enableUploads,
        enableProjectReferences: options.enableProjectReferences,
        onSelect: (item) => this.executeItem(item),
      },
      () => {
        this.#slashDismissed = true;
        this.hideMenu();
        this.#view.focus();
      },
      ownerDocument,
    );
    this.#menu.element.classList.add("document-insert-menu");
    options.root.append(this.#menu.element);

    this.#positioner = mountDocumentOverlayPositioner({
      root: options.root,
      boundary:
        view.dom.closest<HTMLElement>('[data-document-editor="crepe"]') ??
        view.dom,
      floating: this.#menu.element,
      contextElement: view.dom,
      getReferenceRect: () => {
        if (this.#menuAnchorElement?.isConnected) {
          return getFirstLineRect(this.#menuAnchorElement);
        }
        if (this.#menu.element.dataset.show !== "true") return null;
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
        if (this.#menuAnchorElement?.isConnected) {
          return [getFirstLineRect(this.#menuAnchorElement)];
        }
        return [];
      },
      placements: ["bottom-start", "right-start", "left-start"],
      gap: 8,
      minimumSize: { width: 160, height: 96 },
    });

    handle.addEventListener("click", this.#onHandleClick);
    handle.addEventListener("keydown", this.#onHandleKeyDown);
    ownerDocument.addEventListener(
      "pointerdown",
      this.#onOutsidePointerDown,
      true,
    );
    view.dom.addEventListener("keydown", this.#onEditorKeyDown, true);
    this.#provider.update();
    this.update(view);
  }

  #onHandleClick = (event: MouseEvent) => {
    event.preventDefault();
    this.toggleMenu();
  };

  #onOutsidePointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!this.#content.contains(target) && !this.#menu.element.contains(target))
      this.hideMenu();
  };

  #onEditorKeyDown = (event: KeyboardEvent) => {
    if (this.#menu.handleKeyDown(event)) event.stopPropagation();
  };

  #onHandleKeyDown = (event: KeyboardEvent) => {
    if (!isBlockHandleActivationKey(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.toggleMenu();
  };

  private getCurrentBlockContent(view: EditorView): string | undefined {
    const { selection } = view.state;
    const activeElement = view.dom.ownerDocument.activeElement;
    const menuHasFocus = this.#menu.element.contains(activeElement);
    const notHasFocus = !view.hasFocus() && !menuHasFocus;

    if (
      notHasFocus ||
      !view.editable ||
      view.composing ||
      !selection.empty ||
      !(selection instanceof TextSelection)
    ) {
      return;
    }

    const paragraph = findParent((node) =>
      ["paragraph", "heading"].includes(node.type.name),
    )(selection.$from);
    if (!paragraph) return;

    return selection.$from.parent.textBetween(
      Math.max(0, selection.$from.parentOffset - 500),
      selection.$from.parentOffset,
      undefined,
      "\uFFFC",
    );
  }

  private shouldShowMenu(view: EditorView): boolean {
    if (!view.editable || view.composing) return false;
    if (this.#programmaticPos !== null) {
      return (
        this.#anchorDoc === view.state.doc &&
        Boolean(this.#menuAnchorElement?.isConnected)
      );
    }
    const { selection } = view.state;
    if (isInsideExcludedBlock(selection)) return false;

    const currentText = this.getCurrentBlockContent(view);
    if (currentText == null || !isSelectionAtEndOfNode(selection)) return false;

    if (currentText.startsWith("/")) {
      if (this.#slashDismissed) return false;
      this.#menu.setFilter(currentText.slice(1));
      this.#menuAnchorElement = null;
      return true;
    }

    return false;
  }

  private toggleMenu() {
    if (this.#menu.element.dataset.show === "true") {
      this.hideMenu();
      return;
    }
    this.openMenu();
  }

  private openMenu() {
    const active = this.#provider.active;
    if (!active) return;
    this.#menuAnchorElement = active.el;
    // Insert next to the top-level block, never a bare heading/table inside
    // a list container whose schema only accepts list items.
    this.#programmaticPos =
      active.$pos.depth > 0
        ? active.$pos.after(1)
        : active.$pos.pos + active.node.nodeSize;
    this.#anchorDoc = this.#view.state.doc;
    this.#provider.hide();
    this.#menu.setFilter("");
    this.#menu.setVisible(true);
    void this.#positioner.refresh();
  }

  private executeItem(item: DocumentBlockMenuItem) {
    const { state } = this.#view;
    const position = this.#programmaticPos;
    if (position !== null && this.#anchorDoc !== state.doc) return;
    const node = createDocumentBlockNode(this.#ctx, item.key);
    this.hideMenu();
    if (node) {
      const from = position ?? state.selection.$from.before();
      const to = position ?? state.selection.$from.after();
      const transaction = state.tr.replaceWith(from, to, node);
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(from + 1)),
      );
      this.#view.dispatch(transaction.scrollIntoView());
      this.#view.focus();
    } else {
      // Host pickers keep their existing callback contract. Only a committed
      // command creates its insertion paragraph, never opening/cancelling a menu.
      if (position !== null) {
        const transaction = state.tr.insert(
          position,
          paragraphSchema.type(this.#ctx).create(),
        );
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(position + 1)),
        );
        this.#view.dispatch(transaction);
      }
      this.#view.focus();
      item.run(this.#ctx);
    }
  }

  private hideMenu() {
    if (this.#menu.element.dataset.show === "true") this.#slashDismissed = true;
    this.#programmaticPos = null;
    this.#anchorDoc = null;
    this.#menuAnchorElement = null;
    this.#menu.setVisible(false);
    this.#positioner.hide();
  }

  update = (view: EditorView, previous?: EditorState) => {
    this.#provider.update();
    if (previous && previous.doc !== view.state.doc)
      this.#slashDismissed = false;
    if (this.shouldShowMenu(view)) {
      if (this.#menu.element.dataset.show !== "true") {
        this.#menu.setVisible(true, this.#programmaticPos !== null);
      }
      void this.#positioner.refresh();
    } else {
      this.hideMenu();
    }
  };

  destroy = () => {
    this.#view.dom.ownerDocument.removeEventListener(
      "pointerdown",
      this.#onOutsidePointerDown,
      true,
    );
    this.#view.dom.removeEventListener("keydown", this.#onEditorKeyDown, true);
    this.#handle.removeEventListener("click", this.#onHandleClick);
    this.#handle.removeEventListener("keydown", this.#onHandleKeyDown);
    this.#positioner.destroy();
    this.#provider.destroy();
    this.#menu.destroy();
    this.#content.remove();
  };
}

export const documentBlockEdit = (
  editor: Editor,
  options?: DocumentBlockEditOptions,
) => {
  if (!options) return;
  editor
    .config((ctx) => {
      ctx.set(blockConfig.key, {
        filterNodes: (pos) =>
          !findParent((node) =>
            ["table", "blockquote", "math_inline"].includes(node.type.name),
          )(pos),
      });
    })
    .config((ctx) => {
      ctx.set(block.key, {
        view: (view) => new DocumentBlockEditView(ctx, view, options),
      });
    })
    .use(block);
};
