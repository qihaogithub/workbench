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

function measureOuterWidth(element: HTMLElement, fallback = 0): number {
  const styles = window.getComputedStyle(element);
  const marginStart = Number.parseFloat(styles.marginLeft) || 0;
  const marginEnd = Number.parseFloat(styles.marginRight) || 0;
  return measureWidth(element, fallback) + marginStart + marginEnd;
}

function measureContentWidth(element: HTMLElement, fallback = 0): number {
  const styles = window.getComputedStyle(element);
  const paddingStart = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingEnd = Number.parseFloat(styles.paddingRight) || 0;
  const clientWidth = element.clientWidth;
  const boxWidth = clientWidth || measureWidth(element, fallback);
  return Math.max(0, boxWidth - paddingStart - paddingEnd);
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
  const editorHost =
    root.closest<HTMLElement>('[data-document-editor="crepe"]') ?? root;

  let open = false;
  let destroyed = false;
  let syncing = false;
  let refreshQueued = false;
  let layoutFrame: number | null = null;
  let layoutRetry: number | null = null;

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
  // The native TopBar, its inner row, and `root` itself all live in Crepe's
  // scrolling/clipping subtree. Mount the recovery control in the React-owned
  // editor host so it cannot be removed by Vue or clipped with the controls it
  // is responsible for exposing.
  editorHost.append(more);

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
    const allSources = sources();
    const hiddenSources = allSources.filter(
      (source) => source.hidden && !isDivider(source),
    );
    (hiddenSources.length > 0 ? hiddenSources : allSources.filter((source) => !isDivider(source)))
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
    if (destroyed) return false;
    syncing = true;
    const items = sources();
    items.forEach((item) => {
      item.hidden = false;
    });
    more.hidden = false;

    // The inner flex row may already have been widened by the unhidden controls.
    // Measure its stable parent instead, otherwise an overflowing row reports its
    // own expanded width and can never decide to move items into the menu.
    const availableWidth = measureContentWidth(topBar);
    // Flex layout includes margins in each item's consumed inline space. Measuring
    // only border boxes can incorrectly conclude that every control fits, leaving
    // the appended overflow trigger just outside the clipped TopBar.
    const allItemsWidth = items.reduce(
      (total, item) => total + measureOuterWidth(item),
      0,
    );
    // Keep a conservative slot for the trigger even while it is hidden. The
    // control's rendered width varies by host CSS and a tight measurement is
    // enough to clip it at the right edge before a user can open the menu.
    const overflowTriggerWidth = Math.max(measureOuterWidth(more, 36), 48);
    const hasVisualOverflow = topBar.scrollWidth > topBar.clientWidth;
    const hasMeasurableLayout =
      availableWidth > 0 && (items.length === 0 || allItemsWidth > 0);
    if (!hasMeasurableLayout) {
      syncing = false;
      return false;
    }
    if (
      availableWidth > 0 &&
      !hasVisualOverflow &&
      allItemsWidth + overflowTriggerWidth <= availableWidth
    ) {
      // Keep the entry visible as a stable affordance. When nothing is hidden,
      // opening it shows the complete tool set instead of an empty menu.
      more.hidden = false;
      close();
      syncing = false;
      return true;
    }

    const spaceForItems = Math.max(0, availableWidth - overflowTriggerWidth);
    let usedWidth = 0;
    let overflowed = false;
    items.forEach((item) => {
      if (overflowed || usedWidth + measureOuterWidth(item) > spaceForItems) {
        overflowed = true;
        item.hidden = true;
        return;
      }
      usedWidth += measureOuterWidth(item);
    });

    // A rendered scroll overflow is authoritative. It can include intrinsic
    // widths not reflected by individual control measurements, so ensure at
    // least one actionable item moves into the menu in that case.
    if (hasVisualOverflow && !items.some((item) => item.hidden)) {
      const lastActionableItem = [...items]
        .reverse()
        .find((item) => !isDivider(item));
      if (lastActionableItem) lastActionableItem.hidden = true;
    }

    const lastVisible = [...items].reverse().find((item) => !item.hidden);
    if (lastVisible && isDivider(lastVisible)) lastVisible.hidden = true;
    more.hidden = false;
    if (open) refreshMenu();
    syncing = false;
    return true;
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
  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) scheduleRefresh();
        });
  intersectionObserver?.observe(editorHost);
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
  // Crepe can resolve `create()` while the document-mode pane still has zero
  // layout width. Retry only while dimensions are unusable so a hidden pane can
  // become visible later without leaving the full row permanently overflowing.
  const refreshAfterLayout = () => {
    layoutFrame = null;
    const measured = refresh();
    if (!measured && !destroyed && editorHost.dataset.readonly !== "true") {
      layoutRetry = window.setTimeout(() => {
        layoutRetry = null;
        refreshAfterLayout();
      }, 100);
    }
  };
  layoutFrame = window.requestAnimationFrame(refreshAfterLayout);

  return {
    refresh,
    destroy() {
      destroyed = true;
      observer.disconnect();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
      if (layoutRetry !== null) window.clearTimeout(layoutRetry);
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
  let boundInner: HTMLElement | null = null;
  let destroyed = false;

  const attach = () => {
    if (destroyed) return;
    const currentInner = options.root.querySelector<HTMLElement>(
      ".milkdown-top-bar .top-bar-inner",
    );
    if (currentInner === boundInner) return;
    controller?.destroy();
    controller = null;
    boundInner = null;
    if (!currentInner) return;
    controller = mountTopBarOverflowWhenReady(options);
    boundInner = currentInner;
  };
  const rootObserver = new MutationObserver(attach);

  rootObserver.observe(options.root, { childList: true, subtree: true });
  attach();

  return {
    refresh() {
      attach();
      controller?.refresh();
    },
    destroy() {
      destroyed = true;
      rootObserver.disconnect();
      controller?.destroy();
    },
  };
}
