import { describe, expect, it, vi } from "vitest";
import { mountTopBarOverflow } from "./top-bar-overflow";

function setWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width }),
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: width,
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
  setWidth(topBar, width);
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
  bold.style.marginLeft = "3px";
  bold.style.marginRight = "3px";
  setWidth(bold, 32);
  const divider = document.createElement("div");
  divider.className = "top-bar-divider";
  divider.style.marginLeft = "5px";
  divider.style.marginRight = "5px";
  setWidth(divider, 10);
  const italic = document.createElement("button");
  italic.className = "top-bar-item";
  italic.textContent = "I";
  italic.style.marginLeft = "3px";
  italic.style.marginRight = "3px";
  setWidth(italic, 32);
  const onItalic = vi.fn();
  italic.addEventListener("pointerdown", onItalic);

  inner.append(heading, bold, divider, italic);
  topBar.append(inner);
  root.append(topBar);
  if (attach) document.body.append(root);
  return { root, topBar, inner, heading, bold, divider, italic, onItalic };
}

describe("Crepe TopBar 溢出菜单", () => {
  it("在宿主从隐藏模式变为可见时重新测量", async () => {
    const visibility: { notify?: () => void } = {};
    class IntersectionObserverStub {
      constructor(callback: IntersectionObserverCallback) {
        visibility.notify = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const fixture = createTopBar(240);
    const controller = mountTopBarOverflow({ root: fixture.root });

    setWidth(fixture.topBar, 110);
    setWidth(fixture.inner, 110);
    expect(visibility.notify).toBeTypeOf("function");
    visibility.notify?.();
    await Promise.resolve();

    expect(fixture.bold.hidden).toBe(true);
    controller.destroy();
    fixture.root.remove();
    vi.unstubAllGlobals();
  });

  it("持续等待隐藏宿主获得可用布局尺寸", () => {
    const callbacks: FrameRequestCallback[] = [];
    const retries: Array<() => void> = [];
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    const cancelFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const setTimer = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(((handler: TimerHandler) => {
        if (typeof handler === "function") retries.push(() => handler());
        return retries.length;
      }) as typeof window.setTimeout);
    const clearTimer = vi
      .spyOn(window, "clearTimeout")
      .mockImplementation(() => {});
    const fixture = createTopBar(0);
    const controller = mountTopBarOverflow({ root: fixture.root });

    callbacks.shift()?.(0);
    setWidth(fixture.topBar, 110);
    setWidth(fixture.inner, 110);
    retries.shift()?.();

    expect(fixture.bold.hidden).toBe(true);
    controller.destroy();
    fixture.root.remove();
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
    setTimer.mockRestore();
    clearTimer.mockRestore();
  });

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

  it("Crepe 替换 TopBar DOM 后改为绑定当前工具栏", async () => {
    const fixture = createTopBar(0);
    const replacement = createTopBar(110, false);
    const controller = mountTopBarOverflow({ root: fixture.root });

    fixture.root.replaceChildren(replacement.topBar);
    await Promise.resolve();
    await Promise.resolve();

    expect(replacement.bold.hidden).toBe(true);
    expect(fixture.root.querySelectorAll("[data-top-bar-overflow]")).toHaveLength(1);

    controller.destroy();
    fixture.root.remove();
  });

  it("按可用宽度收纳后续工具，并通过更多菜单转发原始操作", () => {
    const fixture = createTopBar(110);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.heading.hidden).toBe(true);
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

  it("宽度恢复后还原原生工具并保留更多入口", () => {
    const fixture = createTopBar(110);
    const controller = mountTopBarOverflow({ root: fixture.root });
    setWidth(fixture.topBar, 240);
    setWidth(fixture.inner, 240);
    controller.refresh();

    expect(fixture.heading.hidden).toBe(false);
    expect(fixture.bold.hidden).toBe(false);
    expect(fixture.divider.hidden).toBe(false);
    expect(fixture.italic.hidden).toBe(false);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("测量工具项外边距，为更多入口预留可见空间", () => {
    const fixture = createTopBar(155);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.heading.hidden).toBe(false);
    expect(fixture.bold.hidden).toBe(false);
    expect(fixture.italic.hidden).toBe(true);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("即使所有工具刚好放得下，也为更多入口保留安全宽度", () => {
    const fixture = createTopBar(200);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.italic.hidden).toBe(true);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("以工具栏父容器的宽度判断溢出，不受已撑宽的内部行误导", () => {
    const fixture = createTopBar(155);
    setWidth(fixture.inner, 480);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.italic.hidden).toBe(true);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("检测到原生滚动溢出时强制收纳，即使边界测量恰好相等", () => {
    const fixture = createTopBar(240);
    Object.defineProperty(fixture.topBar, "scrollWidth", {
      configurable: true,
      value: 320,
    });
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.italic.hidden).toBe(true);
    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );

    controller.destroy();
    fixture.root.remove();
  });

  it("更多入口挂在 React 编辑器宿主，逃离 .crepe 的滚动与裁切链", () => {
    const fixture = createTopBar(110, false);
    const editorHost = document.createElement("div");
    editorHost.dataset.documentEditor = "crepe";
    editorHost.append(fixture.root);
    document.body.append(editorHost);
    const controller = mountTopBarOverflow({ root: fixture.root });
    const overflow = editorHost.querySelector<HTMLElement>(
      "[data-top-bar-overflow]",
    )!;

    expect(overflow.parentElement).toBe(editorHost);
    expect(overflow.hidden).toBe(false);
    expect(fixture.root.querySelector("[data-top-bar-overflow]")).toBeNull();
    expect(editorHost.lastElementChild).toBe(overflow);

    controller.destroy();
    editorHost.remove();
  });

  it("没有溢出时仍显示更多入口，销毁后恢复受控节点", () => {
    const fixture = createTopBar(240);
    const controller = mountTopBarOverflow({ root: fixture.root });

    expect(fixture.root.querySelector<HTMLElement>("[data-top-bar-overflow]")?.hidden).toBe(
      false,
    );
    pointerDown(
      fixture.root.querySelector<HTMLButtonElement>(".top-bar-overflow-trigger")!,
    );
    expect(fixture.root.querySelectorAll("[role='menuitem']")).toHaveLength(3);
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
    expect(fixture.root.querySelectorAll("[role='menuitem']")).toHaveLength(3);

    controller.destroy();
    fixture.root.remove();
  });
});
