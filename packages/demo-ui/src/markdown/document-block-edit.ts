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
import { DocumentBlockMenu } from "./document-block-menu";
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
  #openingFromHandle = false;

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
      },
      () => this.hideMenu(),
      ownerDocument,
    );
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
        if (this.#programmaticPos === null) return null;
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
    });

    handle.addEventListener("click", this.#onHandleClick);
    handle.addEventListener("keydown", this.#onHandleKeyDown);
    this.#provider.update();
    this.update(view);
  }

  #onHandleClick = (event: MouseEvent) => {
    event.preventDefault();
    this.toggleMenu();
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
    const { selection } = view.state;
    if (isInsideExcludedBlock(selection)) return false;

    const currentText = this.getCurrentBlockContent(view);
    if (currentText == null || !isSelectionAtEndOfNode(selection)) return false;

    this.#menu.setFilter(
      currentText.startsWith("/") ? currentText.slice(1) : currentText,
    );

    if (this.#programmaticPos !== null) {
      const maxSize = view.state.doc.nodeSize - 2;
      const validPos = Math.min(this.#programmaticPos, maxSize);
      if (
        view.state.doc.resolve(validPos).node() !==
        view.state.doc.resolve(selection.from).node()
      ) {
        this.#programmaticPos = null;
        return false;
      }
      return true;
    }

    if (currentText.startsWith("/")) {
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
    if (!this.#view.hasFocus()) this.#view.focus();

    const { state, dispatch } = this.#view;
    this.#menuAnchorElement = active.el;
    const pos = active.$pos.pos + active.node.nodeSize;
    let transaction = state.tr.insert(
      pos,
      paragraphSchema.type(this.#ctx).create(),
    );
    transaction = transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(pos)),
    );
    this.#openingFromHandle = true;
    try {
      dispatch(transaction.scrollIntoView());
    } finally {
      this.#openingFromHandle = false;
    }
    this.#programmaticPos = transaction.selection.from;
    this.#provider.hide();
    this.#menu.setFilter("");
    this.#menu.setVisible(true);
    void this.#positioner.refresh();
  }

  private removeEmptyProgrammaticBlock(pos: number | null) {
    if (pos === null || this.#view.state.selection.from !== pos) return;

    const { state, dispatch } = this.#view;
    const { $from } = state.selection;
    if (
      $from.parent.type !== paragraphSchema.type(this.#ctx) ||
      $from.parent.content.size !== 0
    ) {
      return;
    }

    const from = $from.before($from.depth);
    const to = from + $from.parent.nodeSize;
    if (from < 0 || to > state.doc.content.size) return;
    dispatch(state.tr.delete(from, to));
  }

  private hideMenu() {
    const programmaticPos = this.#programmaticPos;
    this.#programmaticPos = null;
    this.#menuAnchorElement = null;
    this.#menu.setVisible(false);
    this.#positioner.hide();
    this.removeEmptyProgrammaticBlock(programmaticPos);
  }

  update = (view: EditorView) => {
    this.#provider.update();
    if (this.#openingFromHandle) return;
    if (this.shouldShowMenu(view)) {
      if (this.#menu.element.dataset.show !== "true") {
        this.#menu.setVisible(true);
      }
      void this.#positioner.refresh();
    } else {
      this.hideMenu();
    }
  };

  destroy = () => {
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
