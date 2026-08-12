interface TopBarOverflowOptions {
  root: HTMLElement;
}

function dispatchPointerDown(element: HTMLElement) {
  const EventConstructor =
    typeof PointerEvent === "undefined" ? MouseEvent : PointerEvent;
  element.dispatchEvent(
    new EventConstructor("pointerdown", { bubbles: true, cancelable: true }),
  );
}

function measureWidth(element: HTMLElement, fallback = 0): number {
  return element.getBoundingClientRect().width || element.offsetWidth || fallback;
}

function isDivider(element: HTMLElement): boolean {
  return element.classList.contains("top-bar-divider");
}

function isHeadingSelector(element: HTMLElement): boolean {
  return element.classList.contains("top-bar-heading-selector");
}

function labelFor(element: HTMLElement, index: number): string {
  return (
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    `格式工具 ${index + 1}`
  );
}

/**
 * Crepe renders its TopBar through Vue, so moving the original controls into a
 * different DOM subtree would make future Vue updates unstable. This adapter
 * keeps those controls in place, hides overflowed originals, and forwards
 * interactions from lightweight menu copies back to the original controls.
 */
function mountTopBarOverflowWhenReady({ root }: TopBarOverflowOptions) {
  const topBar = root.querySelector<HTMLElement>(".milkdown-top-bar");
  const inner = topBar?.querySelector<HTMLElement>(".top-bar-inner");
  if (!topBar || !inner) return { refresh() {}, destroy() {} };

  let open = false;
  let destroyed = false;
  let syncing = false;
  let refreshQueued = false;

  const more = document.createElement("div");
  more.className = "top-bar-overflow";
  more.dataset.topBarOverflow = "";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "top-bar-overflow-trigger";
  trigger.setAttribute("aria-label", "更多格式工具");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.textContent = "…";
  more.append(trigger);
  inner.append(more);

  const menu = () => more.querySelector<HTMLElement>("[data-top-bar-overflow-menu]");
  const focusEditor = () =>
    root.querySelector<HTMLElement>(".ProseMirror")?.focus();

  const close = () => {
    open = false;
    menu()?.remove();
    trigger.setAttribute("aria-expanded", "false");
  };

  const renderHeadingOptions = (source: HTMLElement) => {
    const sourceTrigger = source.querySelector<HTMLElement>(".top-bar-heading-button");
    sourceTrigger && dispatchPointerDown(sourceTrigger);
    queueMicrotask(() => {
      const overflowMenu = menu();
      if (!overflowMenu) return;
      const options = [...source.querySelectorAll<HTMLElement>(".top-bar-heading-option")];
      if (options.length === 0) return;
      overflowMenu.replaceChildren();
      const back = document.createElement("button");
      back.type = "button";
      back.className = "top-bar-overflow-back";
      back.textContent = "‹ 返回";
      back.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        refreshMenu();
      });
      overflowMenu.append(back);
      options.forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "top-bar-overflow-heading-option";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("aria-checked", String(option.classList.contains("active")));
        item.textContent = option.textContent;
        item.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dispatchPointerDown(option);
          close();
          focusEditor();
        });
        overflowMenu.append(item);
      });
    });
  };

  const refreshMenu = () => {
    const overflowMenu = menu();
    if (!overflowMenu) return;
    overflowMenu.replaceChildren();
    sources()
      .filter((source) => source.hidden && !isDivider(source))
      .forEach((source, index) => {
        if (isHeadingSelector(source)) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "top-bar-overflow-heading";
          item.setAttribute("role", "menuitem");
          item.textContent =
            source.querySelector(".top-bar-heading-label")?.textContent ?? "标题样式";
          item.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            renderHeadingOptions(source);
          });
          overflowMenu.append(item);
          return;
        }

        const item = source.cloneNode(true) as HTMLButtonElement;
        item.classList.add("top-bar-overflow-item");
        item.removeAttribute("hidden");
        item.setAttribute("role", "menuitem");
        item.setAttribute("aria-label", labelFor(source, index));
        item.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dispatchPointerDown(source);
          close();
          focusEditor();
        });
        overflowMenu.append(item);
      });
  };

  const openMenu = () => {
    if (open) {
      close();
      return;
    }
    open = true;
    trigger.setAttribute("aria-expanded", "true");
    const overflowMenu = document.createElement("div");
    overflowMenu.className = "top-bar-overflow-menu";
    overflowMenu.dataset.topBarOverflowMenu = "";
    overflowMenu.setAttribute("role", "menu");
    more.append(overflowMenu);
    refreshMenu();
  };

  const sources = () =>
    [...inner.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== more,
    );

  const refresh = () => {
    if (destroyed) return;
    syncing = true;
    const items = sources();
    items.forEach((item) => {
      item.hidden = false;
    });
    more.hidden = false;

    const availableWidth = measureWidth(inner);
    const allItemsWidth = items.reduce((total, item) => total + measureWidth(item), 0);
    if (availableWidth === 0 || allItemsWidth <= availableWidth) {
      more.hidden = true;
      close();
      syncing = false;
      return;
    }

    const spaceForItems = Math.max(0, availableWidth - measureWidth(more, 36));
    let usedWidth = 0;
    let overflowed = false;
    items.forEach((item) => {
      if (overflowed || usedWidth + measureWidth(item) > spaceForItems) {
        overflowed = true;
        item.hidden = true;
        return;
      }
      usedWidth += measureWidth(item);
    });

    const lastVisible = [...items].reverse().find((item) => !item.hidden);
    if (lastVisible && isDivider(lastVisible)) lastVisible.hidden = true;
    more.hidden = !items.some((item) => item.hidden && !isDivider(item));
    if (more.hidden) close();
    else if (open) refreshMenu();
    syncing = false;
  };

  const scheduleRefresh = () => {
    if (refreshQueued || destroyed) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  };

  const observer = new MutationObserver((records) => {
    if (!syncing && records.some((record) => !more.contains(record.target))) {
      scheduleRefresh();
    }
  });
  observer.observe(inner, { childList: true, subtree: true });

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => scheduleRefresh());
  resizeObserver?.observe(inner);
  window.addEventListener("resize", scheduleRefresh);

  trigger.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
    if (event.key === "Escape") close();
  });
  const closeWhenOutside = (event: PointerEvent) => {
    if (!more.contains(event.target as Node)) close();
  };
  document.addEventListener("pointerdown", closeWhenOutside);

  refresh();

  return {
    refresh,
    destroy() {
      destroyed = true;
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleRefresh);
      document.removeEventListener("pointerdown", closeWhenOutside);
      sources().forEach((item) => {
        item.hidden = false;
      });
      more.remove();
    },
  };
}

/**
 * Crepe mounts the TopBar from its internal Vue tree after `create()` resolves
 * in some render paths. Wait for that asynchronous insertion instead of
 * treating the first missing query as a permanent absence.
 */
export function mountTopBarOverflow(options: TopBarOverflowOptions) {
  let controller: ReturnType<typeof mountTopBarOverflowWhenReady> | null = null;
  let destroyed = false;

  const attach = () => {
    if (destroyed || controller) return;
    if (!options.root.querySelector(".milkdown-top-bar .top-bar-inner")) return;
    controller = mountTopBarOverflowWhenReady(options);
    rootObserver.disconnect();
  };
  const rootObserver = new MutationObserver(attach);

  attach();
  if (!controller) {
    rootObserver.observe(options.root, { childList: true, subtree: true });
  }

  return {
    refresh() {
      controller?.refresh();
    },
    destroy() {
      destroyed = true;
      rootObserver.disconnect();
      controller?.destroy();
    },
  };
}
