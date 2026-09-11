import type { Ctx } from "@milkdown/kit/ctx";
import type { Node, NodeType } from "@milkdown/kit/prose/model";

import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
import {
  commandsCtx,
  editorViewCtx,
  type CommandManager,
} from "@milkdown/kit/core";
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  headingSchema,
  hrSchema,
  isMarkSelectedCommand,
  listItemSchema,
  linkSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";

import type { ConfigReferenceCandidate } from "../DocumentEditor";
import type { CrepeProjectActions } from "./crepe-config";
import { LUCIDE_ICONS, lucideHeadingIcon } from "./lucide-icons";
import { HEADING_STYLE_OPTIONS } from "./heading-style-toolbar";
export interface DocumentBlockMenuItem {
  key: string;
  label: string;
  icon: string;
  disabled?: boolean;
  checked?: boolean;
  description?: string;
  /** When selected from the TopBar, create this block instead of formatting the current block. */
  insertBlockKey?: string;
  searchTerms?: string[];
  run: (ctx: Ctx) => void | boolean;
}

export interface DocumentBlockMenuGroup {
  key: string;
  label: string;
  items: DocumentBlockMenuItem[];
}

export interface DocumentBlockMenuOptions {
  groups?: DocumentBlockMenuGroup[];
  label?: string;
  onSelect?: (item: DocumentBlockMenuItem) => void;
  actions: CrepeProjectActions;
  referenceCandidates?: ConfigReferenceCandidate[];
  enableUploads?: boolean;
  enableProjectReferences?: boolean;
}

export type DocumentInsertCategory = "basic" | "general" | "reference";

export interface DocumentInsertMenuItem extends DocumentBlockMenuItem {
  category: DocumentInsertCategory;
}

export interface DocumentInsertMenuGroup {
  key: string;
  label: string;
  items: DocumentInsertMenuItem[];
}

type DocumentMenuRenderOptions = Pick<
  DocumentBlockMenuOptions,
  "label" | "onSelect"
> & {
  groups: DocumentBlockMenuGroup[];
  description?: () => string;
};

function runBlockCommand(
  ctx: Ctx,
  callback: (commands: CommandManager) => void,
) {
  callback(ctx.get(commandsCtx));
}

function clearCurrentBlock(ctx: Ctx) {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
}

function setBlock(
  ctx: Ctx,
  nodeType: NodeType,
  attrs?: Record<string, unknown>,
) {
  runBlockCommand(ctx, (commands) => {
    commands.call(setBlockTypeCommand.key, {
      nodeType,
      ...(attrs ? { attrs } : {}),
    });
  });
}

function wrapBlock(
  ctx: Ctx,
  nodeType: NodeType,
  attrs?: Record<string, unknown>,
) {
  runBlockCommand(ctx, (commands) => {
    commands.call(wrapInBlockTypeCommand.key, {
      nodeType,
      ...(attrs ? { attrs } : {}),
    });
  });
}

function addBlock(ctx: Ctx, nodeType: NodeType | Node) {
  runBlockCommand(ctx, (commands) => {
    commands.call(addBlockTypeCommand.key, { nodeType });
  });
}

function insertableBlockItem(
  item: Omit<DocumentInsertMenuItem, "category" | "run"> & {
    run: (ctx: Ctx) => void | boolean;
  },
): DocumentInsertMenuItem {
  return { ...item, category: "basic" };
}

export function runDocumentLink(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const markType = linkSchema.type(ctx);
  if (view.state.selection.empty && isDocumentLinkActive(ctx)) {
    view.dispatch(view.state.tr.removeStoredMark(markType));
    return;
  }
  ctx.get(commandsCtx).call(toggleLinkCommand.key);
}

export function isDocumentLinkActive(ctx: Ctx): boolean {
  const markType = linkSchema.type(ctx);
  const commands = ctx.get(commandsCtx);
  if (commands.call(isMarkSelectedCommand.key, markType)) return true;

  const view = ctx.get(editorViewCtx);
  const { state } = view;
  if (state.storedMarks?.some((mark) => mark.type === markType)) return true;
  if (state.selection instanceof TextSelection) {
    const { $cursor } = state.selection;
    if ($cursor) return $cursor.marks().some((mark) => mark.type === markType);
  }
  return false;
}

export function wrapDocumentQuote(ctx: Ctx) {
  wrapBlock(ctx, blockquoteSchema.type(ctx));
}

/**
 * The canonical insert catalog shared by the TopBar and the block-handle menu.
 * The `run` handlers keep the old slash-menu behavior; TopBar consumers use
 * `insertBlockKey` to apply the new split-and-insert behavior.
 */
export function buildDocumentInsertGroups(
  ctx: Ctx,
  options: Pick<
    DocumentBlockMenuOptions,
    | "actions"
    | "referenceCandidates"
    | "enableUploads"
    | "enableProjectReferences"
  >,
  filter = "",
): DocumentInsertMenuGroup[] {
  const headingItems = HEADING_STYLE_OPTIONS.map((option) => {
    const level = option.level;
    return insertableBlockItem({
      key: level === null ? "text" : `h${level}`,
      label: level === null ? "正文" : `H${level}`,
      icon: lucideHeadingIcon(level),
      insertBlockKey: level === null ? "text" : `h${level}`,
      searchTerms: level === null ? ["段落", "paragraph"] : ["标题", "heading"],
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        if (level === null) {
          setBlock(currentCtx, paragraphSchema.type(currentCtx));
        } else {
          setBlock(currentCtx, headingSchema.type(currentCtx), { level });
        }
      },
    });
  });

  const basicItems: DocumentInsertMenuItem[] = [
    ...headingItems,
    {
      category: "basic",
      key: "link",
      label: "链接",
      icon: LUCIDE_ICONS.link,
      searchTerms: ["超链接", "link"],
      run: runDocumentLink,
    },
    {
      ...insertableBlockItem({
        key: "bullet-list",
        label: "无序列表",
        icon: LUCIDE_ICONS.bulletList,
        insertBlockKey: "bullet-list",
        searchTerms: ["列表", "bullet"],
        run: (currentCtx) => {
          clearCurrentBlock(currentCtx);
          wrapBlock(currentCtx, bulletListSchema.type(currentCtx));
        },
      }),
    },
    {
      ...insertableBlockItem({
        key: "ordered-list",
        label: "有序列表",
        icon: LUCIDE_ICONS.orderedList,
        insertBlockKey: "ordered-list",
        searchTerms: ["列表", "ordered"],
        run: (currentCtx) => {
          clearCurrentBlock(currentCtx);
          wrapBlock(currentCtx, orderedListSchema.type(currentCtx));
        },
      }),
    },
    {
      ...insertableBlockItem({
        key: "task-list",
        label: "任务列表",
        icon: LUCIDE_ICONS.todoList,
        insertBlockKey: "task-list",
        searchTerms: ["列表", "待办", "task"],
        run: (currentCtx) => {
          clearCurrentBlock(currentCtx);
          wrapBlock(currentCtx, listItemSchema.type(currentCtx), {
            checked: false,
          });
        },
      }),
    },
    {
      ...insertableBlockItem({
        key: "quote",
        label: "引用",
        icon: LUCIDE_ICONS.quote,
        insertBlockKey: "quote",
        searchTerms: ["blockquote", "quote"],
        run: (currentCtx) => {
          clearCurrentBlock(currentCtx);
          wrapDocumentQuote(currentCtx);
        },
      }),
    },
    {
      ...insertableBlockItem({
        key: "divider",
        label: "分隔线",
        icon: LUCIDE_ICONS.divider,
        insertBlockKey: "divider",
        searchTerms: ["水平线", "hr", "divider"],
        run: (currentCtx) => {
          clearCurrentBlock(currentCtx);
          addBlock(currentCtx, hrSchema.type(currentCtx));
        },
      }),
    },
  ];

  const generalItems: DocumentInsertMenuItem[] = [
    {
      category: "general",
      key: "image",
      label: "图片",
      icon: LUCIDE_ICONS.image,
      insertBlockKey: "image",
      searchTerms: ["image", "图片"],
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        addBlock(currentCtx, imageBlockSchema.type(currentCtx));
      },
    },
    {
      category: "general",
      key: "table",
      label: "表格",
      icon: LUCIDE_ICONS.table,
      insertBlockKey: "table",
      searchTerms: ["table"],
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        const commands = currentCtx.get(commandsCtx);
        const view = currentCtx.get(editorViewCtx);
        const { from } = view.state.selection;
        commands.call(addBlockTypeCommand.key, {
          nodeType: createTable(currentCtx, 3, 3),
        });
        commands.call(selectTextNearPosCommand.key, { pos: from });
      },
    },
    {
      category: "general",
      key: "code",
      label: "代码块",
      icon: LUCIDE_ICONS.codeBlock,
      insertBlockKey: "code",
      searchTerms: ["代码", "code", "code-block"],
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        setBlock(currentCtx, codeBlockSchema.type(currentCtx));
      },
    },
  ];

  if (options.enableUploads) {
    generalItems.push(
      {
        category: "general",
        key: "upload-video",
        label: "上传视频",
        icon: LUCIDE_ICONS.plus,
        searchTerms: ["视频", "video"],
        run: () => options.actions.uploadVideo(),
      },
      {
        category: "general",
        key: "upload-file",
        label: "上传附件",
        icon: LUCIDE_ICONS.plus,
        searchTerms: ["附件", "文件", "file"],
        run: () => options.actions.uploadFile(),
      },
    );
  }

  const referenceItems: DocumentInsertMenuItem[] = [
    ...(options.referenceCandidates ?? []).map((candidate) => ({
      category: "reference" as const,
      key: `reference-${candidate.key}`,
      label: candidate.label,
      icon: LUCIDE_ICONS.link,
      searchTerms: ["配置项", "引用", candidate.key],
      run: () => options.actions.insertReference(candidate),
    })),
  ];
  if (options.enableProjectReferences && options.actions.openProjectReference) {
    referenceItems.push({
      category: "reference",
      key: "insert-project-reference",
      label: "选择页面 / 配置项 / 文档",
      icon: LUCIDE_ICONS.link,
      searchTerms: ["项目", "页面", "文档", "配置项", "wb://"],
      run: () => options.actions.openProjectReference?.(),
    });
  }

  const groups: DocumentInsertMenuGroup[] = [
    { key: "basic", label: "基础", items: basicItems },
    { key: "general", label: "通用", items: generalItems },
  ];
  if (referenceItems.length) {
    groups.push({ key: "reference", label: "引用", items: referenceItems });
  }

  const normalizedFilter = filter.trim().toLocaleLowerCase();
  if (!normalizedFilter) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, ...(item.searchTerms ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedFilter),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function buildDocumentBlockMenuGroups(
  ctx: Ctx,
  options: DocumentBlockMenuOptions,
  filter = "",
): DocumentBlockMenuGroup[] {
  const shared = buildDocumentInsertGroups(ctx, options);
  const basic = shared.find((group) => group.key === "basic")?.items ?? [];
  const general = shared.find((group) => group.key === "general")?.items ?? [];
  const references =
    shared.find((group) => group.key === "reference")?.items ?? [];
  const headingItems = basic.filter((item) => /^h[1-6]$/.test(item.key));
  const groups: DocumentBlockMenuGroup[] = [
    {
      key: "text",
      label: "文本",
      items: basic.filter((item) =>
        ["text", "h1", "h2", "h3", "quote", "divider"].includes(item.key),
      ),
    },
    {
      key: "list",
      label: "列表",
      items: basic.filter((item) =>
        ["bullet-list", "ordered-list", "task-list"].includes(item.key),
      ),
    },
    {
      key: "advanced",
      label: "插入",
      items: general.filter((item) =>
        ["image", "code", "table"].includes(item.key),
      ),
    },
  ];

  const staticReferences = references.filter((item) =>
    item.key.startsWith("reference-"),
  );
  if (staticReferences.length) {
    groups.push({
      key: "project-references",
      label: "引用配置项",
      items: staticReferences,
    });
  }

  const projectReference = references.find(
    (item) => item.key === "insert-project-reference",
  );
  if (projectReference) {
    groups.push({
      key: "entity-references",
      label: "插入项目引用",
      items: [projectReference],
    });
  }

  const moreItems = [
    ...headingItems.slice(3),
    ...general.filter((item) =>
      ["upload-video", "upload-file"].includes(item.key),
    ),
  ];
  if (moreItems.length) {
    groups.push({
      key: "more",
      label: "更多",
      items: moreItems,
    });
  }

  const normalizedFilter = filter.trim().toLocaleLowerCase();
  if (!normalizedFilter) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, ...(item.searchTerms ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedFilter),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

function createIcon(ownerDocument: Document, icon: string): HTMLSpanElement {
  const element = ownerDocument.createElement("span");
  element.className = "document-block-menu-icon";
  element.setAttribute("aria-hidden", "true");
  element.innerHTML = icon;
  return element;
}

let nextDocumentBlockMenuId = 0;

/** Build the final node before dispatch; opening the picker never needs a draft paragraph. */
export function createDocumentBlockNode(ctx: Ctx, key: string): Node | null {
  const paragraph = () => paragraphSchema.type(ctx).create();
  if (key === "text") return paragraph();
  const heading = HEADING_STYLE_OPTIONS.find(
    (option) => `h${option.level}` === key,
  );
  if (heading) return headingSchema.type(ctx).create({ level: heading.level });
  if (key === "quote")
    return blockquoteSchema.type(ctx).create(null, paragraph());
  if (key === "divider") return hrSchema.type(ctx).create();
  if (key === "image") return imageBlockSchema.type(ctx).createAndFill();
  if (key === "code") return codeBlockSchema.type(ctx).create();
  if (key === "table") return createTable(ctx, 3, 3);
  if (["bullet-list", "ordered-list", "task-list"].includes(key)) {
    const item = listItemSchema
      .type(ctx)
      .create(key === "task-list" ? { checked: false } : null, paragraph());
    return (key === "ordered-list" ? orderedListSchema : bulletListSchema)
      .type(ctx)
      .create(null, item);
  }
  return null;
}

export class DocumentBlockMenu {
  readonly element: HTMLDivElement;
  readonly #ctx: Ctx;
  readonly #document: Document;
  readonly #options: DocumentBlockMenuOptions | DocumentMenuRenderOptions;
  readonly #onHide: () => void;
  readonly #menuId = `document-block-menu-${++nextDocumentBlockMenuId}`;
  #groups: DocumentBlockMenuGroup[] = [];
  #filter = "";
  #selectedGroupIndex = 0;
  #selectedIndex = 0;
  #visible = false;

  constructor(
    ctx: Ctx,
    options: DocumentBlockMenuOptions | DocumentMenuRenderOptions,
    onHide: () => void,
    ownerDocument: Document,
  ) {
    this.#ctx = ctx;
    this.#document = ownerDocument;
    this.#options = options;
    this.#onHide = onHide;
    this.element = this.#document.createElement("div");
    this.element.className = "milkdown-slash-menu document-block-menu";
    this.element.setAttribute("role", "menu");
    this.element.setAttribute("aria-label", options.label ?? "插入内容");
    this.element.tabIndex = -1;
    this.element.dataset.show = "false";
    this.element.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    this.element.addEventListener("keydown", this.#onKeyDown);
    this.render();
  }

  #onKeyDown = (event: KeyboardEvent) => {
    if (!this.#visible) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.hide();
      return;
    }
    const items = this.#groups[this.#selectedGroupIndex]?.items ?? [];
    if (!items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.#selectedIndex =
        (this.#selectedIndex + delta + items.length) % items.length;
      this.renderSelection();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      this.#selectedGroupIndex =
        (this.#selectedGroupIndex + delta + this.#groups.length) %
        this.#groups.length;
      this.#selectedIndex = 0;
      this.render();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[this.#selectedIndex];
      if (item?.disabled) return;
      if (item) this.runItem(item);
      this.hide();
    }
  };

  setFilter(filter: string) {
    if (filter === this.#filter) return;
    this.#filter = filter;
    this.#selectedGroupIndex = 0;
    this.#selectedIndex = 0;
    this.render();
  }

  setVisible(visible: boolean, focus = true) {
    this.#visible = visible;
    this.element.dataset.show = String(visible);
    this.element.setAttribute("aria-hidden", String(!visible));
    if (visible) {
      this.renderSelection();
      if (focus) this.element.focus({ preventScroll: true });
    }
  }

  hide() {
    this.setVisible(false);
    this.#onHide();
  }

  handleKeyDown(event: KeyboardEvent) {
    this.#onKeyDown(event);
    return event.defaultPrevented;
  }

  private runItem(item: DocumentBlockMenuItem) {
    if (item.disabled) return;
    if (this.#options.onSelect) this.#options.onSelect(item);
    else item.run(this.#ctx);
  }

  destroy() {
    this.element.removeEventListener("keydown", this.#onKeyDown);
    this.element.remove();
  }

  render() {
    this.#groups =
      this.#options.groups ??
      ("actions" in this.#options
        ? buildDocumentBlockMenuGroups(this.#ctx, this.#options, this.#filter)
        : []);
    if (this.#groups.length === 0) {
      this.#selectedGroupIndex = 0;
      this.#selectedIndex = 0;
    } else {
      this.#selectedGroupIndex = Math.min(
        this.#selectedGroupIndex,
        this.#groups.length - 1,
      );
      this.#selectedIndex = Math.min(
        this.#selectedIndex,
        this.#groups[this.#selectedGroupIndex].items.length - 1,
      );
    }
    this.element.replaceChildren();

    const tabs = this.#document.createElement("nav");
    tabs.className = "document-block-menu-tabs";
    tabs.setAttribute("aria-label", "插入菜单分组");
    const tabList = this.#document.createElement("ul");
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-orientation", "horizontal");
    tabs.append(tabList);

    this.#groups.forEach((group, groupIndex) => {
      const tab = this.#document.createElement("button");
      const selected = groupIndex === this.#selectedGroupIndex;
      tab.type = "button";
      tab.className = "document-block-menu-tab";
      tab.textContent = group.label;
      tab.setAttribute("role", "tab");
      tab.id = `${this.#menuId}-tab-${group.key}`;
      tab.setAttribute("aria-selected", String(selected));
      tab.setAttribute("aria-controls", `${this.#menuId}-panel`);
      tab.tabIndex = selected ? 0 : -1;
      tab.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      tab.addEventListener("click", () => {
        if (group.key === "entity-references") {
          const item = group.items[0];
          if (item) this.runItem(item);
          this.hide();
          return;
        }
        this.#selectedGroupIndex = groupIndex;
        this.#selectedIndex = 0;
        this.render();
        this.element.focus({ preventScroll: true });
      });
      const listItem = this.#document.createElement("li");
      listItem.append(tab);
      tabList.append(listItem);
    });
    this.element.append(tabs);

    const groups = this.#document.createElement("div");
    groups.className =
      "menu-groups document-block-menu-groups document-block-menu-panel";
    groups.id = `${this.#menuId}-panel`;
    groups.setAttribute("role", "tabpanel");
    const selectedGroup = this.#groups[this.#selectedGroupIndex];
    if (selectedGroup) {
      groups.setAttribute(
        "aria-labelledby",
        `${this.#menuId}-tab-${selectedGroup.key}`,
      );
      const section = this.#document.createElement("section");
      section.className = "menu-group document-block-menu-group";
      section.dataset.menuGroup = selectedGroup.key;
      const list = this.#document.createElement("ul");
      selectedGroup.items.forEach((item, index) => {
        const button = this.#document.createElement("button");
        button.type = "button";
        button.className = "document-block-menu-item";
        button.dataset.index = String(index);
        button.dataset.menuKey = item.key;
        button.setAttribute(
          "role",
          item.checked === undefined ? "menuitem" : "menuitemradio",
        );
        button.disabled = Boolean(item.disabled);
        if (item.checked !== undefined)
          button.setAttribute("aria-checked", String(item.checked));
        if (item.description) button.title = item.description;
        button.append(createIcon(this.#document, item.icon));
        const label = this.#document.createElement("span");
        label.textContent = item.label;
        button.append(label);
        if (item.checked) {
          const check = this.#document.createElement("span");
          check.className = "document-heading-menu-check";
          check.textContent = "✓";
          check.setAttribute("aria-hidden", "true");
          button.append(check);
        }
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
        });
        button.addEventListener("click", () => {
          this.runItem(item);
          this.hide();
        });
        const listItem = this.#document.createElement("li");
        listItem.append(button);
        list.append(listItem);
      });
      section.append(list);
      groups.append(section);
    }
    this.element.append(groups);
    if ("description" in this.#options && this.#options.description) {
      const hint = this.#document.createElement("p");
      hint.className = "document-heading-menu-hint";
      hint.setAttribute("role", "status");
      hint.textContent = this.#options.description();
      this.element.append(hint);
    }
    this.renderSelection();
  }

  private renderSelection() {
    const items = Array.from(
      this.element.querySelectorAll<HTMLElement>(
        ".document-block-menu-item[data-index]",
      ),
    );
    items.forEach((item, index) => {
      const selected = index === this.#selectedIndex;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    const groups = this.element.querySelectorAll<HTMLElement>(
      ".document-block-menu-group",
    );
    groups.forEach((group) => {
      const hasSelected = Boolean(group.querySelector(".selected"));
      group.classList.toggle("selected", hasSelected);
    });
    const tabs = this.element.querySelectorAll<HTMLElement>(
      ".document-block-menu-tab",
    );
    tabs.forEach((tab, index) => {
      const selected = index === this.#selectedGroupIndex;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const selected = items[this.#selectedIndex];
    selected?.scrollIntoView?.({ block: "nearest" });
  }
}
