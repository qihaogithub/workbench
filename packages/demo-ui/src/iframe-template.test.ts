import { describe, expect, it, vi } from "vitest";

import { positionEditScript, visualEditScript } from "./iframe-template";

describe("visualEditScript", () => {
  it("在选择模式注入专用鼠标，并排除编辑浮层", () => {
    expect(visualEditScript).toContain("visual-selection-cursor");
    expect(visualEditScript).toContain("data-visual-selection-mode");
    expect(visualEditScript).toContain(":not([data-visual-overlay])");
    expect(visualEditScript).toContain("%233b82f6");
  });

  it("批注模式不覆盖其专用鼠标", () => {
    expect(visualEditScript).toContain(
      "syncSelectionCursor(state.enabled && !state.annotationMode)",
    );
  });
});

describe("positionEditScript", () => {
  it("重复 data-pos-key 时只标记活动元素，切换迁移标记并保留原始属性", () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="first" data-pos-key="blank"></div>
        <div id="second" data-pos-key="blank"></div>
      </div>
    `;
    const first = document.getElementById("first") as HTMLDivElement;
    const second = document.getElementById("second") as HTMLDivElement;
    const root = document.getElementById("root") as HTMLDivElement;
    const rects = new Map<Element, DOMRect>([
      [root, { left: 0, top: 0, width: 1920, height: 1080 } as DOMRect],
      [first, { left: 100, top: 200, width: 100, height: 100 } as DOMRect],
      [second, { left: 300, top: 400, width: 100, height: 100 } as DOMRect],
    ]);
    for (const [element, rect] of rects) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect);
      Object.defineProperty(element, "offsetParent", { configurable: true, value: null });
      (element as HTMLDivElement & { setPointerCapture: () => void }).setPointerCapture = vi.fn();
    }
    const getComputedStyle = vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ position: "absolute", left: "0px", top: "0px" }) as CSSStyleDeclaration,
    );
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    document.elementsFromPoint = vi.fn(() => [second]);

    new Function(positionEditScript)();
    const send = (data: Record<string, unknown>) => {
      window.dispatchEvent(new MessageEvent("message", { data, source: window }));
    };

    send({
      type: "ENTER_POSITION_EDIT",
      target: {
        id: "blanks:blanks-sortable-0:position",
        domKey: "blank",
        domOccurrence: 0,
        position: { x: 100, y: 200 },
      },
    });
    expect(first.getAttribute("data-position-edit-id")).toBe(
      "blanks:blanks-sortable-0:position",
    );
    expect(second.hasAttribute("data-position-edit-id")).toBe(false);

    const beforeInactiveDrag = postMessage.mock.calls.length;
    document.dispatchEvent(Object.assign(new Event("pointerdown"), { clientX: 300, clientY: 400, pointerId: 1 }));
    document.dispatchEvent(Object.assign(new Event("pointerup"), { clientX: 300, clientY: 400, pointerId: 1 }));
    expect(postMessage.mock.calls.slice(beforeInactiveDrag).some(([message]) => (message as any)?.type === "POSITION_CHANGE")).toBe(false);

    send({
      type: "ENTER_POSITION_EDIT",
      target: {
        id: "blanks:blanks-sortable-1:position",
        domKey: "blank",
        domOccurrence: 1,
        position: { x: 300, y: 400 },
      },
    });
    expect(first.hasAttribute("data-position-edit-id")).toBe(false);
    expect(second.getAttribute("data-position-edit-id")).toBe(
      "blanks:blanks-sortable-1:position",
    );
    expect(
      postMessage.mock.calls.some(
        ([message]) => (message as { type?: string; active?: boolean }).type === "POSITION_EDIT_READY" &&
          (message as { active?: boolean }).active === false,
      ),
    ).toBe(false);
    expect(first.getAttribute("data-pos-key")).toBe("blank");
    expect(second.getAttribute("data-pos-key")).toBe("blank");

    send({ type: "EXIT_POSITION_EDIT" });
    expect(first.hasAttribute("data-position-edit-id")).toBe(false);
    expect(second.hasAttribute("data-position-edit-id")).toBe(false);
    expect(first.getAttribute("data-pos-key")).toBe("blank");
    expect(second.getAttribute("data-pos-key")).toBe("blank");

    postMessage.mockRestore();
    getComputedStyle.mockRestore();
  });
});
