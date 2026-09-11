import type { Ctx } from "@milkdown/kit/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { EditorState } from "@milkdown/kit/prose/state";
import {
  DocumentBlockMenu,
  type DocumentBlockMenuGroup,
} from "./document-block-menu";
import { mountDocumentOverlayPositioner } from "./document-overlay-positioning";
import {
  PRIMARY_HEADING_STYLE_OPTIONS,
  MORE_HEADING_STYLE_OPTIONS,
} from "./heading-style-toolbar";
import { lucideHeadingIcon } from "./lucide-icons";
import {
  buildHeadingTransaction,
  getHeadingSelection,
} from "./document-heading-command";

export class DocumentHeadingPicker {
  readonly menu: DocumentBlockMenu;
  readonly #positioner: ReturnType<typeof mountDocumentOverlayPositioner>;
  readonly #groups: DocumentBlockMenuGroup[] = [];
  #target: EditorState | null = null;
  #anchor: HTMLElement | null = null;
  #description = "";

  constructor(
    ctx: Ctx,
    readonly view: EditorView,
    readonly options: {
      root: HTMLElement;
      variant: "topbar" | "selection";
      onClose?: () => void;
    },
  ) {
    const ownerDocument = view.dom.ownerDocument;
    this.menu = new DocumentBlockMenu(
      ctx,
      {
        groups: this.#groups,
        label: "标题样式",
        description: () => this.#description,
      },
      () => this.close(true),
      ownerDocument,
    );
    this.menu.element.classList.add(
      "document-heading-menu",
      `document-${options.variant}-heading-menu`,
    );
    options.root.append(this.menu.element);
    this.#positioner = mountDocumentOverlayPositioner({
      root: options.root,
      boundary: view.dom.closest('[data-document-editor="crepe"]') ?? view.dom,
      floating: this.menu.element,
      contextElement: view.dom,
      getReferenceRect: () => {
        if (!this.#anchor?.isConnected || !this.#target) return null;
        const rect = this.#anchor.getBoundingClientRect();
        const bar = this.#anchor
          .closest(
            options.variant === "topbar"
              ? ".milkdown-top-bar"
              : ".document-selection-toolbar",
          )
          ?.getBoundingClientRect();
        return new DOMRect(
          rect.left,
          rect.top,
          rect.width,
          Math.max(rect.bottom, bar?.bottom ?? rect.bottom) - rect.top,
        );
      },
      placements: ["bottom-start", "top-start"],
      minimumSize: { width: 160, height: 96 },
    });
    ownerDocument.addEventListener("pointerdown", this.#outside, true);
    ownerDocument.addEventListener("keydown", this.#keyDown, true);
  }

  get isOpen() {
    return this.#target !== null;
  }
  contains(node: Node | null) {
    return Boolean(node && this.menu.element.contains(node));
  }

  toggle(anchor: HTMLElement) {
    if (this.isOpen) {
      this.close(true);
      return;
    }
    if (!this.view.editable) return;
    this.#target = this.view.state;
    this.#anchor = anchor;
    const info = getHeadingSelection(this.#target);
    this.#groups.splice(
      0,
      this.#groups.length,
      ...[
        { key: "text", label: "文本", options: PRIMARY_HEADING_STYLE_OPTIONS },
        { key: "more", label: "更多", options: MORE_HEADING_STYLE_OPTIONS },
      ].map(({ key, label, options }) => ({
        key,
        label,
        items: options.map(({ label, level }) => ({
          key: level === null ? "text" : `h${level}`,
          label,
          icon: lucideHeadingIcon(level),
          checked: info.label === label,
          disabled: !buildHeadingTransaction(this.#target!, level),
          description:
            info.reason ||
            (info.inList && level !== null ? "将所选列表项转换为标题" : ""),
          run: () => {
            const target = this.#target;
            if (
              !target ||
              target.doc !== this.view.state.doc ||
              !target.selection.eq(this.view.state.selection) ||
              !this.view.editable
            ) {
              this.close(false);
              return;
            }
            const tr = buildHeadingTransaction(this.view.state, level);
            if (!tr) return;
            this.close(false);
            this.view.dispatch(tr);
            this.view.focus();
          },
        })),
      })),
    );
    this.#description =
      info.reason ||
      (info.inList ? "将所选列表项转换为标题" : "应用于选区所在段落");
    this.menu.render();
    anchor.setAttribute("aria-expanded", "true");
    this.menu.setVisible(true);
    void this.#positioner.refresh();
  }

  close(restoreFocus = false) {
    if (!this.isOpen) return;
    const anchor = this.#anchor;
    this.#target = null;
    this.#anchor = null;
    this.menu.setVisible(false);
    this.#positioner.hide();
    anchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor?.focus({ preventScroll: true });
    this.options.onClose?.();
  }
  update() {
    if (
      this.#target &&
      (!this.view.editable ||
        this.view.state.doc !== this.#target.doc ||
        !this.view.state.selection.eq(this.#target.selection))
    )
      this.close(false);
  }
  #outside = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!this.contains(target) && !this.#anchor?.contains(target))
      this.close(false);
  };
  #keyDown = (event: KeyboardEvent) => {
    if (!this.isOpen || event.defaultPrevented) return;
    if (
      ![
        "Escape",
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
      ].includes(event.key)
    )
      return;
    this.menu.handleKeyDown(event);
    if (event.defaultPrevented) event.stopPropagation();
  };
  destroy() {
    this.close(false);
    this.view.dom.ownerDocument.removeEventListener(
      "pointerdown",
      this.#outside,
      true,
    );
    this.view.dom.ownerDocument.removeEventListener(
      "keydown",
      this.#keyDown,
      true,
    );
    this.#positioner.destroy();
    this.menu.destroy();
  }
}
