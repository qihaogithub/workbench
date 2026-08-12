import { describe, expect, it, vi } from "vitest";
import { mountTopBarOverflow } from "./top-bar-overflow";

function setWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width }),
  });
}

function pointerDown(element: HTMLElement) {
  const EventConstructor =
    typeof PointerEvent === "undefined" ? MouseEvent : PointerEvent;
  element.dispatchEvent(
    new EventConstructor("pointerdown", { bubbles: true, cancelable: true }),
  );
}

function createTopBar(width: number, attach = true) {
  const root = document.createElement("div");
  const topBar = document.createElement("div");
  topBar.className = "milkdown-top-bar";
  const inner = document.createElement("div");
  inner.className = "top-bar-inner";
  setWidth(inner, width);

  const heading = document.createElement("div");
  heading.className = "top-bar-heading-selector";
  heading.innerHTML = '<button class="top-bar-heading-button"><span class="top-bar-heading-label">正文</span></button>';
  setWidth(heading, 64);
  const bold = document.createElement("button");
  bold.className = "top-bar-item";
  bold.textContent = "B";
  setWidth(bold, 32);
  const divider = document.createElement("div");
  divider.className = "top-bar-divider";
  setWidth(divider, 10);
  const italic = document.createElement("button");
  italic.className = "top-bar-item";
  italic.textContent = "I";
  setWidth(italic, 32);
  const onItalic = vi.fn();
  italic.addEventListener("pointerdown", onItalic);

  inner.append(heading, bold, divider, italic);
  topBar.append(inner);
  root.append(topBar);
  if (attach) document.body.append(root);
  return { root, inner, heading, bold, divider, italic, onItalic };
}

describe("Crepe TopBar 溢出菜单", () => {
  it("等待 Crepe 异步插入 TopBar 后再开始测量", async () => {
    const fixture = createTopBar(110, false);
    const controller = mountTopBarOverflow({ root: fixture.root });

    document.body.append(fixture.root);
    await Promise.resolve();

    expect(fixture.root.querySelector("[data-top-bar-overflow]")).toBeTruthy();
    expect(fixture.bold.hidden).toBe(true);
    controller.destroy();
    fixture.root.remove();
  });

  it("按可用宽度收纳后续工具，并通过更多菜单转发原始操作", () => {
    const fixture = createTopBar(110);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.heading.hidden).toBe(false);
    expect(fixture.bold.hidden).toBe(true);
    expect(fixture.divider.hidden).toBe(true);
    expect(fixture.italic.hidden).toBe(true);

    const trigger = fixture.root.querySelector<HTMLButtonElement>(
      ".top-bar-overflow-trigger",
    )!;
    expect(trigger.parentElement?.hidden).toBe(false);
    pointerDown(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const items = fixture.root.querySelectorAll<HTMLButtonElement>(
      ".top-bar-overflow-item",
    );
    pointerDown(items[1]!);
    expect(fixture.onItalic).toHaveBeenCalledTimes(1);
    expect(fixture.root.querySelector("[data-top-bar-overflow-menu]")).toBeNull();

    controller.destroy();
    fixture.root.remove();
  });

  it("宽度恢复后还原原生工具并隐藏更多入口", () => {
    const fixture = createTopBar(110);
    const controller = mountTopBarOverflow({ root: fixture.root });
    setWidth(fixture.inner, 240);
    controller.refresh();

    expect(fixture.heading.hidden).toBe(false);
    expect(fixture.bold.hidden).toBe(false);
    expect(fixture.divider.hidden).toBe(false);
    expect(fixture.italic.hidden).toBe(false);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      true,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("没有溢出时不会显示更多入口，销毁后恢复受控节点", () => {
    const fixture = createTopBar(240);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      true,
    );
    controller.destroy();
    expect(fixture.heading.hidden).toBe(false);
    expect(fixture.bold.hidden).toBe(false);
    expect(fixture.italic.hidden).toBe(false);
    expect(fixture.root.querySelector("[data-top-bar-overflow]")).toBeNull();
    fixture.root.remove();
  });

  it("通过键盘打开更多菜单，并暴露语义化状态", () => {
    const fixture = createTopBar(110);
    const controller = mountTopBarOverflow({ root: fixture.root });
    const trigger = fixture.root.querySelector<HTMLButtonElement>(
      ".top-bar-overflow-trigger",
    )!;

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(fixture.root.querySelector("[role='menu']")).toBeTruthy();
    expect(fixture.root.querySelectorAll("[role='menuitem']")).toHaveLength(2);

    controller.destroy();
    fixture.root.remove();
  });
});
