import {
  isWhiteboardImageTargetInput,
  mergeConfigWithSchemaDefaults,
  supportsWhiteboardImageTarget,
  updateWhiteboardImageTarget,
} from "../whiteboard-image-target";

const schema = {
  type: "object",
  properties: {
    background: { type: "string", format: "image", default: "/background.png" },
    blanks: {
      type: "array",
      default: [{ image: "/blank.png", gallery: ["/detail.png"] }],
      items: {
        type: "object",
        properties: {
          image: { type: "string", format: "image" },
          gallery: { type: "array", items: { type: "string", format: "image" } },
        },
      },
    },
  },
};

describe("whiteboard image targets", () => {
  it("accepts only canonical nested image paths and resolves their image semantics", () => {
    expect(isWhiteboardImageTargetInput({ scope: "page", pageId: "page_1", fieldPath: "blanks[0].image" })).toBe(true);
    expect(isWhiteboardImageTargetInput({ scope: "page", pageId: "page_1", fieldPath: "blanks[00].image" })).toBe(false);
    expect(isWhiteboardImageTargetInput({ scope: "page", pageId: "page_1", fieldPath: "__proto__.image" })).toBe(false);
    expect(supportsWhiteboardImageTarget(schema, { scope: "page", pageId: "page_1", fieldPath: "blanks[0].image" })).toBe(true);
    expect(supportsWhiteboardImageTarget(schema, { scope: "page", pageId: "page_1", fieldPath: "blanks[0].gallery", listItem: { index: 0, url: "/detail.png" } })).toBe(true);
  });

  it("hydrates schema defaults before updating nested single and list targets", () => {
    const values = mergeConfigWithSchemaDefaults(schema, {});
    expect(values).toEqual({ background: "/background.png", blanks: [{ image: "/blank.png", gallery: ["/detail.png"] }] });

    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "page_1", fieldPath: "blanks[0].image", currentValue: "/blank.png",
    }, "assets/whiteboards/blank.png")).toBeNull();
    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "page_1", fieldPath: "blanks[0].gallery", listItem: { index: 0, url: "/detail.png" },
    }, "assets/whiteboards/detail.png")).toBeNull();
    expect(values.blanks).toEqual([{ image: "assets/whiteboards/blank.png", gallery: ["assets/whiteboards/detail.png"] }]);
  });

  it("hydrates only the target branch when a nested target is absent", () => {
    const values: Record<string, unknown> = {};

    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "page_1", fieldPath: "blanks[0].image", currentValue: "/blank.png",
    }, "assets/whiteboards/blank.png", schema)).toBeNull();

    expect(values).toEqual({
      blanks: [{ image: "assets/whiteboards/blank.png", gallery: ["/detail.png"] }],
    });
  });

  it("rejects a stale nested image before changing the value", () => {
    const values = mergeConfigWithSchemaDefaults(schema, {});
    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "page_1", fieldPath: "blanks[0].image", currentValue: "/other.png",
    }, "assets/whiteboards/blank.png")).toContain("其他编辑者");
  });
});
