import type { Ctx } from "@milkdown/kit/ctx";
import type { Editor } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $ctx, $prose } from "@milkdown/kit/utils";

import type { ConfigReferenceCandidate } from "../DocumentEditor";
import type { CrepeProjectActions } from "./crepe-config";
import {
  buildDocumentInsertGroups,
  createDocumentBlockNode,
  type DocumentInsertMenuGroup,
  type DocumentInsertMenuItem,
} from "./document-block-menu";
import { mountDocumentOverlayPositioner } from "./document-overlay-positioning";

export interface DocumentInsertMenuOptions {
  root: HTMLElement;
  actions: CrepeProjectActions;
  referenceCandidates?: ConfigReferenceCandidate[];
  enableUploads?: boolean;
  enableProjectReferences?: boolean;
}

/**
 * Split the current text block at the selection start and put a fresh block in
 * the gap. The original selection is intentionally not deleted: this keeps a
 * non-empty selection's text in the trailing block and makes the whole action
 * one ProseMirror transaction/undo step.
 */
export function insertDocumentBlockAtSelection(
  view: EditorView,
  node: ProseMirrorNode,
): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.$from.parent.isTextblock) return false;

  const insertionPos = selection.from;
  const transaction = state.tr;
  try {
    transaction.split(insertionPos);
    // The split mapping keeps the old cursor at the end of the leading block
    // for assoc=-1; the sibling boundary is the following position.
    const boundary = transaction.mapping.map(insertionPos, -1) + 1;
    const $boundary = transaction.doc.resolve(boundary);
    if (
      !$boundary.parent.canReplaceWith(
        $boundary.index(),
        $boundary.index(),
        node.type,
      )
    ) {
      return false;
    }

    transaction.insert(boundary, node);
    if (node.isTextblock) {
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(boundary + 1)),
      );
    } else if (node.type.spec.selectable !== false) {
      transaction.setSelection(NodeSelection.create(transaction.doc, boundary));
    } else {
      transaction.setSelection(
        Selection.near(transaction.doc.resolve(boundary + node.nodeSize), 1),
      );
    }
    view.dispatch(transaction.scrollIntoView());
    view.focus();
    return true;
  } catch {
    return false;
  }
}

let nextDocumentInsertMenuId = 0;

export class DocumentInsertMenu {
  readonly element: HTMLDivElement;
  readonly #ctx: Ctx;
  readonly #view: EditorView;
  readonly #options: DocumentInsertMenuOptions;
  readonly #document: Document;
  readonly #positioner: ReturnType<typeof mountDocumentOverlayPositioner>;
  readonly #menuId = `document-topbar-insert-menu-${++nextDocumentInsertMenuId}`;
  #target: EditorState | null = null;
  #anchor: HTMLElement | null = null;
  #allGroups: DocumentInsertMenuGroup[] = [];
  #groups: DocumentInsertMenuGroup[] = [];
  #displayItems: DocumentInsertMenuItem[] = [];
  #filter = "";
  #selectedIndex = 0;
  #recentKeys: string[] = [];

  constructor(ctx: Ctx, view: EditorView, options: DocumentInsertMenuOptions) {
    this.#ctx = ctx;
    this.#view = view;
    this.#options = options;
    this.#document = view.dom.ownerDocument;
    this.element = this.#document.createElement("div");
    this.element.className =
      "milkdown-slash-menu document-block-menu document-topbar-insert-menu";
    this.element.id = this.#menuId;
    this.element.setAttribute("role", "menu");
    this.element.setAttribute("aria-label", "插入");
    this.element.tabIndex = -1;
    this.element.dataset.show = "false";
    this.element.setAttribute("aria-hidden", "true");
    this.element.addEventListener("pointerdown", this.#onPointerDown);
    this.element.addEventListener("keydown", this.#onKeyDown);
    this.#positioner = mountDocumentOverlayPositioner({
      root: options.root,
      boundary: view.dom.closest('[data-document-editor="crepe"]') ?? view.dom,
      floating: this.element,
      contextElement: view.dom,
      getReferenceRect: () => {
        if (!this.#anchor?.isConnected || !this.#target) return null;
        const rect = this.#anchor.getBoundingClientRect();
        const bar = this.#anchor
          .closest(".milkdown-top-bar")
          ?.getBoundingClientRect();
        return new DOMRect(
          rect.left,
          rect.top,
          rect.width,
          Math.max(rect.bottom, bar?.bottom ?? rect.bottom) - rect.top,
        );
      },
      placements: ["bottom-start", "top-start"],
      minimumSize: { width: 300, height: 160 },
    });
    options.root.append(this.element);
    this.#document.addEventListener("pointerdown", this.#outside, true);
    this.#document.addEventListener("keydown", this.#documentKeyDown, true);
  }

  get isOpen() {
    return this.#target !== null;
  }

  contains(node: globalThis.Node | null) {
    return Boolean(node && this.element.contains(node));
  }

  toggle(anchor: HTMLElement) {
    if (this.isOpen) {
      this.close(true);
      return;
    }
    if (!this.#view.editable) return;
    this.#target = this.#view.state;
    this.#anchor = anchor;
    this.#filter = "";
    this.#selectedIndex = 0;
    this.#allGroups = buildDocumentInsertGroups(this.#ctx, this.#options);
    this.render();
    anchor.setAttribute("aria-expanded", "true");
    this.element.dataset.show = "true";
    this.element.setAttribute("aria-hidden", "false");
    void this.#positioner.refresh();
    this.element
      .querySelector<HTMLInputElement>(".document-insert-search")
      ?.focus({
        preventScroll: true,
      });
  }

  close(restoreFocus = false) {
    if (!this.isOpen) return;
    const anchor = this.#anchor;
    this.#target = null;
    this.#anchor = null;
    this.element.dataset.show = "false";
    this.element.setAttribute("aria-hidden", "true");
    this.#positioner.hide();
    anchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor?.focus({ preventScroll: true });
  }

  recordRecent(key: string) {
    this.#recentKeys = [
      key,
      ...this.#recentKeys.filter((item) => item !== key),
    ].slice(0, 4);
    if (this.isOpen) this.render();
  }

  update() {
    if (
      this.#target &&
      (!this.#view.editable ||
        this.#view.state.doc !== this.#target.doc ||
        !this.#view.state.selection.eq(this.#target.selection))
    ) {
      this.close(false);
    }
  }

  #onPointerDown = (event: PointerEvent) => {
    if ((event.target as Element).closest("button")) event.preventDefault();
  };

  #onKeyDown = (event: KeyboardEvent) => {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (this.#displayItems.length) {
        this.#selectedIndex =
          (this.#selectedIndex + delta + this.#displayItems.length) %
          this.#displayItems.length;
        this.renderSelection();
      }
      return;
    }
    if (event.key === "Enter") {
      const target = event.target as HTMLElement;
      if (target.classList.contains("document-insert-search")) {
        event.preventDefault();
        event.stopPropagation();
      }
      const item = this.#displayItems[this.#selectedIndex];
      if (item) {
        event.preventDefault();
        event.stopPropagation();
        this.#runItem(item);
      }
    }
  };

  #documentKeyDown = (event: KeyboardEvent) => {
    if (!this.isOpen || event.defaultPrevented) return;
    if (event.key === "Escape") this.#onKeyDown(event);
  };

  #outside = (event: PointerEvent) => {
    const target = event.target as globalThis.Node | null;
    if (!this.contains(target) && !this.#anchor?.contains(target))
      this.close(false);
  };

  #getRecentItems() {
    const items = new Map(
      this.#allGroups
        .flatMap((group) => group.items)
        .map((item) => [item.key, item]),
    );
    return this.#recentKeys
      .map((key) => items.get(key))
      .filter((item): item is DocumentInsertMenuItem => Boolean(item));
  }

  #runItem(item: DocumentInsertMenuItem) {
    if (item.disabled) return;
    const target = this.#target;
    if (
      !target ||
      target.doc !== this.#view.state.doc ||
      !target.selection.eq(this.#view.state.selection) ||
      !this.#view.editable
    ) {
      this.close(false);
      return;
    }

    if (item.insertBlockKey) {
      const node = createDocumentBlockNode(this.#ctx, item.insertBlockKey);
      if (!node || !insertDocumentBlockAtSelection(this.#view, node)) return;
      this.close(false);
      this.recordRecent(item.key);
      return;
    }

    this.close(false);
    try {
      this.#view.focus();
      const succeeded = item.run(this.#ctx) !== false;
      // Opening the project picker is not a successful insertion. Its async
      // completion records the item through documentInsertMenuApi below.
      if (
        succeeded &&
        !["insert-project-reference", "upload-video", "upload-file"].includes(
          item.key,
        )
      ) {
        this.recordRecent(item.key);
      }
    } catch {
      // Failed commands and permission errors must not pollute recent usage.
    }
  }

  render() {
    this.#groups = buildDocumentInsertGroups(
      this.#ctx,
      this.#options,
      this.#filter,
    );
    const recent = this.#filter ? [] : this.#getRecentItems();
    this.#displayItems = [
      recent,
      ...this.#groups.map((group) => group.items),
    ].flat();
    this.#selectedIndex = Math.min(
      this.#selectedIndex,
      Math.max(0, this.#displayItems.length - 1),
    );
    this.element.replaceChildren();

    const search = this.#document.createElement("input");
    search.type = "search";
    search.className = "document-insert-search";
    search.placeholder = "搜索内容";
    search.setAttribute("aria-label", "搜索插入内容");
    search.value = this.#filter;
    search.addEventListener("input", () => {
      this.#filter = search.value;
      this.#selectedIndex = 0;
      this.render();
      this.element
        .querySelector<HTMLInputElement>(".document-insert-search")
        ?.focus({
          preventScroll: true,
        });
    });
    this.element.append(search);

    let displayIndex = 0;
    if (recent.length) {
      this.#appendSection("最近使用", recent, () => displayIndex++);
    }
    for (const group of this.#groups) {
      this.#appendSection(group.label, group.items, () => displayIndex++);
    }
    if (!this.#displayItems.length) {
      const empty = this.#document.createElement("p");
      empty.className = "document-insert-empty";
      empty.setAttribute("role", "status");
      empty.textContent = "没有匹配的内容";
      this.element.append(empty);
    }
    this.renderSelection();
  }

  #appendSection(
    label: string,
    items: DocumentInsertMenuItem[],
    nextIndex: () => number,
  ) {
    const section = this.#document.createElement("section");
    section.className = "document-insert-section";
    const heading = this.#document.createElement("h3");
    heading.className = "document-insert-section-title";
    heading.textContent = label;
    section.append(heading);
    const list = this.#document.createElement("ul");
    list.className =
      label === "基础" ? "document-insert-grid" : "document-insert-list";
    for (const item of items) {
      const index = nextIndex();
      const button = this.#document.createElement("button");
      button.type = "button";
      button.className = "document-insert-item";
      button.title = item.label;
      button.setAttribute("aria-label", item.label);
      button.dataset.menuIndex = String(index);
      button.dataset.menuKey = item.key;
      button.setAttribute("role", "menuitem");
      button.setAttribute(
        "aria-selected",
        String(index === this.#selectedIndex),
      );
      button.disabled = Boolean(item.disabled);
      button.append(this.#createIcon(item.icon));
      if (label !== "基础") {
        const text = this.#document.createElement("span");
        text.className = "document-insert-item-label";
        text.textContent = item.label;
        button.append(text);
      }
      button.addEventListener("click", () => this.#runItem(item));
      const listItem = this.#document.createElement("li");
      listItem.append(button);
      list.append(listItem);
    }
    section.append(list);
    this.element.append(section);
  }

  #createIcon(icon: string) {
    const element = this.#document.createElement("span");
    element.className = "document-insert-item-icon";
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = icon;
    return element;
  }

  renderSelection() {
    const buttons = this.element.querySelectorAll<HTMLElement>(
      ".document-insert-item[data-menu-index]",
    );
    buttons.forEach((button) => {
      const selected = Number(button.dataset.menuIndex) === this.#selectedIndex;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    buttons[this.#selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  destroy() {
    this.close(false);
    this.#document.removeEventListener("pointerdown", this.#outside, true);
    this.#document.removeEventListener("keydown", this.#documentKeyDown, true);
    this.element.removeEventListener("pointerdown", this.#onPointerDown);
    this.element.removeEventListener("keydown", this.#onKeyDown);
    this.#positioner.destroy();
    this.element.remove();
  }
}

export const documentInsertMenuApi = $ctx(
  { toggle: () => {}, recordRecent: (_key: string) => {} },
  "documentInsertMenuApi",
);

/** Registers the native Crepe TopBar trigger and its single-panel menu. */
export const documentInsertMenu = (
  editor: Editor,
  options?: DocumentInsertMenuOptions,
) => {
  if (!options) return;
  editor.use(documentInsertMenuApi).use(
    $prose(
      (ctx) =>
        new Plugin({
          key: new PluginKey("document-insert-menu"),
          view: (view: EditorView) => {
            const menu = new DocumentInsertMenu(ctx, view, options);
            const trigger = () =>
              view.dom.parentElement?.querySelector<HTMLElement>(
                "[data-document-insert-trigger]",
              ) ?? null;
            ctx.set(documentInsertMenuApi.key, {
              toggle: () => {
                const button = trigger()?.closest("button");
                if (button) menu.toggle(button);
              },
              recordRecent: (key: string) => menu.recordRecent(key),
            });
            const keyboardClick = (event: MouseEvent) => {
              if (event.detail !== 0) return;
              const button = (event.target as Element).closest("button");
              if (!button?.contains(trigger())) return;
              event.preventDefault();
              menu.toggle(button);
            };
            const toolbarRoot = view.dom.parentElement;
            toolbarRoot?.addEventListener("click", keyboardClick);
            const update = () => {
              menu.update();
              const span = trigger();
              const button = span?.closest("button");
              button?.setAttribute("aria-label", "插入");
              button?.setAttribute("aria-haspopup", "menu");
              button?.setAttribute("aria-controls", menu.element.id);
              button?.setAttribute("aria-expanded", String(menu.isOpen));
            };
            update();
            return {
              update,
              destroy() {
                toolbarRoot?.removeEventListener("click", keyboardClick);
                menu.destroy();
              },
            };
          },
        }),
    ),
  );
};
