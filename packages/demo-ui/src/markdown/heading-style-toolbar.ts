export interface HeadingStyleOption {
  label: string;
  level: number | null;
}

export const HEADING_STYLE_OPTIONS: HeadingStyleOption[] = [
  { label: "正文", level: null },
  { label: "H1", level: 1 },
  { label: "H2", level: 2 },
  { label: "H3", level: 3 },
  { label: "H4", level: 4 },
  { label: "H5", level: 5 },
  { label: "H6", level: 6 },
];

interface HeadingStyleToolbarOptions {
  root: HTMLElement;
  getActiveLevel: () => number | null;
  onSelect: (level: number | null) => void;
}

function labelFor(level: number | null): string {
  return (
    HEADING_STYLE_OPTIONS.find((option) => option.level === level)?.label ??
    HEADING_STYLE_OPTIONS[0].label
  );
}

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " ";
}

/**
 * Crepe's native selection toolbar accepts icon buttons only. This small DOM
 * adapter adds a semantic heading selector before those buttons, while the
 * caller continues to run the official Milkdown block-type command.
 */
export function mountHeadingStyleToolbar({
  root,
  getActiveLevel,
  onSelect,
}: HeadingStyleToolbarOptions) {
  let open = false;
  let destroyed = false;

  const close = () => {
    open = false;
    root.querySelector<HTMLElement>("[data-heading-style-menu]")?.remove();
    root
      .querySelector<HTMLButtonElement>("[data-heading-style-trigger]")
      ?.setAttribute("aria-expanded", "false");
  };

  const refresh = () => {
    const trigger = root.querySelector<HTMLButtonElement>(
      "[data-heading-style-trigger]",
    );
    if (!trigger) return;
    const label = document.createElement("span");
    label.className = "heading-style-label";
    label.textContent = labelFor(getActiveLevel());
    const chevron = document.createElement("span");
    chevron.className = "heading-style-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    trigger.replaceChildren(label, chevron);
  };

  const show = (selector: HTMLElement) => {
    close();
    open = true;
    const trigger = selector.querySelector<HTMLButtonElement>(
      "[data-heading-style-trigger]",
    )!;
    trigger.setAttribute("aria-expanded", "true");
    const menu = document.createElement("div");
    menu.className = "heading-style-menu";
    menu.dataset.headingStyleMenu = "";
    menu.setAttribute("role", "menu");

    HEADING_STYLE_OPTIONS.forEach((option) => {
      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "heading-style-option";
      optionButton.dataset.headingStyleOption = "";
      optionButton.textContent = option.label;
      optionButton.setAttribute("role", "menuitemradio");
      optionButton.setAttribute(
        "aria-checked",
        String(option.level === getActiveLevel()),
      );
      const select = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(option.level);
        close();
        queueMicrotask(refresh);
      };
      optionButton.addEventListener("pointerdown", select);
      optionButton.addEventListener("keydown", (event) => {
        if (isActivationKey(event)) select(event);
        if (event.key === "Escape") close();
      });
      menu.append(optionButton);
    });
    selector.append(menu);
  };

  const ensureControl = () => {
    if (destroyed) return;
    const toolbar = root.querySelector<HTMLElement>(".milkdown-toolbar");
    if (!toolbar || toolbar.querySelector("[data-heading-style-selector]")) return;

    const selector = document.createElement("div");
    selector.className = "heading-style-selector";
    selector.dataset.headingStyleSelector = "";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "heading-style-trigger";
    trigger.dataset.headingStyleTrigger = "";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "标题样式");
    trigger.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (open) close();
      else show(selector);
    });
    trigger.addEventListener("keydown", (event) => {
      if (isActivationKey(event)) {
        event.preventDefault();
        if (open) close();
        else show(selector);
      }
      if (event.key === "Escape") close();
    });
    selector.append(trigger);
    toolbar.prepend(selector);
    refresh();
  };

  const observer = new MutationObserver(ensureControl);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("keyup", refresh);
  root.addEventListener("pointerup", () => queueMicrotask(refresh));
  const closeWhenOutside = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) close();
  };
  document.addEventListener("pointerdown", closeWhenOutside);
  ensureControl();

  return {
    refresh,
    destroy() {
      destroyed = true;
      observer.disconnect();
      root.querySelector("[data-heading-style-selector]")?.remove();
      document.removeEventListener("pointerdown", closeWhenOutside);
    },
  };
}
