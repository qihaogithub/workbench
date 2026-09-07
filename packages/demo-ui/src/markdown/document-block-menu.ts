import type { Ctx } from "@milkdown/kit/ctx";
import type { Node, NodeType } from "@milkdown/kit/prose/model";

import { imageBlockSchema } from "@milkdown/kit/component/image-block";
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
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";

import type { ConfigReferenceCandidate } from "../DocumentEditor";
import type { CrepeProjectActions } from "./crepe-config";
import { HEADING_STYLE_OPTIONS } from "./heading-style-toolbar";

const ICONS = {
  text: '<svg viewBox="0 0 24 24"><path d="M5 5h14v2h-6v12h-2V7H5V5Z"/></svg>',
  heading:
    '<svg viewBox="0 0 24 24"><path d="M5 5h2v6h10V5h2v14h-2v-6H7v6H5V5Z"/></svg>',
  quote:
    '<svg viewBox="0 0 24 24"><path d="M7.2 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h5v6.2A2.8 2.8 0 0 1 7.2 17ZM17.2 17H15a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h5v6.2a2.8 2.8 0 0 1-2.8 2.8Z"/></svg>',
  divider: '<svg viewBox="0 0 24 24"><path d="M4 11h16v2H4v-2Z"/></svg>',
  bullet:
    '<svg viewBox="0 0 24 24"><path d="M4 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 6h12v2H8V6Zm-4 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 12h12v2H8v-2Zm-4 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0-3 0ZM8 18h12v2H8v-2Z"/></svg>',
  ordered:
    '<svg viewBox="0 0 24 24"><path d="M3 5h2v6H3V5Zm0 8h2v6H3v-6ZM8 6h12v2H8V6Zm0 5h12v2H8v-2Zm0 5h12v2H8v-2Z"/></svg>',
  task: '<svg viewBox="0 0 24 24"><path d="m4 6 1.5 1.5L8 5l1.4 1.4-3.9 3.9L4 8.8 2.6 7.4 4 6Zm7-1h9v2h-9V5Zm-7 7 1.5 1.5L8 11l1.4 1.4-3.9 3.9L4 14.8 2.6 13.4 4 12Zm7-1h9v2h-9v-2Z"/></svg>',
  image:
    '<svg viewBox="0 0 24 24"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9.2l3.3-3.3 2.8 2.8 2.7-3.4 3.2 4V6H6Zm3 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="m8.7 7.3-4.7 4.7 4.7 4.7 1.4-1.4L6.8 12l3.3-3.3-1.4-1.4Zm6.6 0-1.4 1.4 3.3 3.3-3.3 3.3 1.4 1.4 4.7-4.7-4.7-4.7Z"/></svg>',
  table:
    '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4Zm2 2v4h5V6H6Zm7 0v4h5V6h-5Zm-7 6v4h5v-4H6Zm7 0v4h5v-4h-5Z"/></svg>',
  reference:
    '<svg viewBox="0 0 24 24"><path d="M7 5h10v2H7a3 3 0 1 0 0 6h7v2H7A5 5 0 1 1 7 5Zm3 6h7a5 5 0 1 1 0 10H7v-2h10a3 3 0 1 0 0-6h-7v-2Z"/></svg>',
  upload:
    '<svg viewBox="0 0 24 24"><path d="M12 3 7 8l1.4 1.4L11 6.8V16h2V6.8l2.6 2.6L17 8l-5-5ZM5 18h14v2H5v-2Z"/></svg>',
};

export interface DocumentBlockMenuItem {
  key: string;
  label: string;
  icon: string;
  run: (ctx: Ctx) => void;
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

export function buildDocumentBlockMenuGroups(
  ctx: Ctx,
  options: DocumentBlockMenuOptions,
  filter = "",
): DocumentBlockMenuGroup[] {
  const headingItems: DocumentBlockMenuItem[] = HEADING_STYLE_OPTIONS.filter(
    (option) => option.level !== null,
  ).map((option) => {
    const level = option.level!;
    return {
      key: `h${level}`,
      label: `H${level}`,
      icon: ICONS.heading,
      run: (currentCtx: Ctx) => {
        clearCurrentBlock(currentCtx);
        setBlock(currentCtx, headingSchema.type(currentCtx), { level });
      },
    };
  });

  const textItems: DocumentBlockMenuItem[] = [
    {
      key: "text",
      label: "正文",
      icon: ICONS.text,
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        setBlock(currentCtx, paragraphSchema.type(currentCtx));
      },
    },
    ...headingItems.slice(0, 3),
    {
      key: "quote",
      label: "引用",
      icon: ICONS.quote,
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        wrapBlock(currentCtx, blockquoteSchema.type(currentCtx));
      },
    },
    {
      key: "divider",
      label: "分隔线",
      icon: ICONS.divider,
      run: (currentCtx) => {
        clearCurrentBlock(currentCtx);
        addBlock(currentCtx, hrSchema.type(currentCtx));
      },
    },
  ];

  const groups: DocumentBlockMenuGroup[] = [
    { key: "text", label: "文本", items: textItems },
    {
      key: "list",
      label: "列表",
      items: [
        {
          key: "bullet-list",
          label: "无序列表",
          icon: ICONS.bullet,
          run: (currentCtx) => {
            clearCurrentBlock(currentCtx);
            wrapBlock(currentCtx, bulletListSchema.type(currentCtx));
          },
        },
        {
          key: "ordered-list",
          label: "有序列表",
          icon: ICONS.ordered,
          run: (currentCtx) => {
            clearCurrentBlock(currentCtx);
            wrapBlock(currentCtx, orderedListSchema.type(currentCtx));
          },
        },
        {
          key: "task-list",
          label: "任务列表",
          icon: ICONS.task,
          run: (currentCtx) => {
            clearCurrentBlock(currentCtx);
            wrapBlock(currentCtx, listItemSchema.type(currentCtx), {
              checked: false,
            });
          },
        },
      ],
    },
    {
      key: "advanced",
      label: "插入",
      items: [
        {
          key: "image",
          label: "图片",
          icon: ICONS.image,
          run: (currentCtx) => {
            clearCurrentBlock(currentCtx);
            addBlock(currentCtx, imageBlockSchema.type(currentCtx));
          },
        },
        {
          key: "code",
          label: "代码块",
          icon: ICONS.code,
          run: (currentCtx) => {
            clearCurrentBlock(currentCtx);
            setBlock(currentCtx, codeBlockSchema.type(currentCtx));
          },
        },
        {
          key: "table",
          label: "表格",
          icon: ICONS.table,
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
      ],
    },
  ];

  if (options.referenceCandidates?.length) {
    groups.push({
      key: "project-references",
      label: "引用配置项",
      items: options.referenceCandidates.map((candidate) => ({
        key: `reference-${candidate.key}`,
        label: candidate.label,
        icon: ICONS.reference,
        run: () => options.actions.insertReference(candidate),
      })),
    });
  }

  if (options.enableProjectReferences && options.actions.openProjectReference) {
    groups.push({
      key: "entity-references",
      label: "插入项目引用",
      items: [
        {
          key: "insert-project-reference",
          label: "选择项目 / 页面 / 文档",
          icon: ICONS.reference,
          run: () => options.actions.openProjectReference?.(),
        },
      ],
    });
  }

  const moreItems = [...headingItems.slice(3)];
  if (options.enableUploads) {
    moreItems.push(
      {
        key: "upload-video",
        label: "上传视频",
        icon: ICONS.upload,
        run: () => options.actions.uploadVideo(),
      },
      {
        key: "upload-file",
        label: "上传附件",
        icon: ICONS.upload,
        run: () => options.actions.uploadFile(),
      },
    );
  }
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
        item.label.toLocaleLowerCase().includes(normalizedFilter),
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
  readonly #options: DocumentBlockMenuOptions;
  readonly #onHide: () => void;
  readonly #menuId = `document-block-menu-${++nextDocumentBlockMenuId}`;
  #groups: DocumentBlockMenuGroup[] = [];
  #filter = "";
  #selectedGroupIndex = 0;
  #selectedIndex = 0;
  #visible = false;

  constructor(
    ctx: Ctx,
    options: DocumentBlockMenuOptions,
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
      buildDocumentBlockMenuGroups(this.#ctx, this.#options, this.#filter);
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
        button.setAttribute("role", "menuitem");
        button.append(createIcon(this.#document, item.icon));
        const label = this.#document.createElement("span");
        label.textContent = item.label;
        button.append(label);
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
