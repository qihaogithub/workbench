import { applyCollabTextPatches, type CollabTextLike } from "../prototype-collab-patches";

function createCollabText(initial: string) {
  let value = initial;
  const origins: unknown[] = [];
  const ytext: CollabTextLike = {
    toString: () => value,
    delete: (index, length) => {
      value = `${value.slice(0, index)}${value.slice(index + length)}`;
    },
    insert: (index, text) => {
      value = `${value.slice(0, index)}${text}${value.slice(index)}`;
    },
    doc: {
      transact: (apply, origin) => {
        origins.push(origin);
        apply();
      },
    },
  };
  return { ytext, origins };
}

describe("applyCollabTextPatches", () => {
  it("在一个语义 transaction 中应用多个最小区间 patch", () => {
    const { ytext, origins } = createCollabText("<p>旧文</p>");

    expect(
      applyCollabTextPatches(
        ytext,
        "<p>旧文</p>",
        '<p data-ow-id="ow_a">新文</p>',
        [
          { start: 2, end: 2, text: ' data-ow-id="ow_a"' },
          { start: 3, end: 5, text: "新文" },
        ],
      ),
    ).toBe(true);
    expect(ytext.toString()).toBe('<p data-ow-id="ow_a">新文</p>');
    expect(origins).toEqual(["prototype-visual-editor"]);
  });

  it("协同源码已变化时拒绝覆盖", () => {
    const { ytext, origins } = createCollabText("<p>远端修改</p>");

    expect(
      applyCollabTextPatches(
        ytext,
        "<p>旧文</p>",
        "<p>新文</p>",
        [{ start: 3, end: 5, text: "新文" }],
      ),
    ).toBe(false);
    expect(ytext.toString()).toBe("<p>远端修改</p>");
    expect(origins).toEqual([]);
  });
});
