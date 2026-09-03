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

const oneOfSchema = {
  type: "object",
  properties: {
    modules: {
      type: "array",
      items: {
        oneOf: [
          {
            properties: {
              type: { const: "image" },
              image: { type: "string", format: "image" },
            },
            required: ["type", "image"],
          },
          {
            properties: {
              type: { const: "participant" },
              bgImage: { type: "string", format: "image" },
            },
            required: ["type"],
          },
        ],
      },
    },
  },
};

const nestedOneOfSchema = {
  type: "object",
  properties: {
    modules: {
      type: "array",
      items: {
        oneOf: [{
          properties: {
            type: { const: "level" },
            levels: {
              type: "array",
              items: {
                oneOf: [{
                  properties: {
                    type: { const: "levelCard" },
                    lockedImage: { type: "string", format: "image" },
                  },
                }],
              },
            },
          },
        }, {
          properties: { type: { const: "text" }, text: { type: "string" } },
        }],
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
    expect(values.blanks).toEqual([{ image: "/blank.png", gallery: ["/detail.png"] }]);
  });

  it("accepts Unicode page ids while rejecting unsafe path segments", () => {
    expect(isWhiteboardImageTargetInput({
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "background",
    })).toBe(true);
    expect(isWhiteboardImageTargetInput({
      scope: "page", pageId: "../other-page", fieldPath: "background",
    })).toBe(false);
    expect(isWhiteboardImageTargetInput({
      scope: "page", pageId: "page/other", fieldPath: "background",
    })).toBe(false);
  });

  it("resolves image fields inside oneOf object-array branches", () => {
    expect(supportsWhiteboardImageTarget(oneOfSchema, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].image",
    })).toBe(true);
    expect(supportsWhiteboardImageTarget(oneOfSchema, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].bgImage",
    })).toBe(true);
    expect(supportsWhiteboardImageTarget(oneOfSchema, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].missing",
    })).toBe(false);
    expect(supportsWhiteboardImageTarget(nestedOneOfSchema, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].levels[0].lockedImage",
    })).toBe(true);
  });

  it("selects the oneOf branch from the discriminator and hydrates missing parents", () => {
    const values: Record<string, unknown> = {
      modules: [{ type: "participant", bgImage: "/old.png" }],
    };
    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].bgImage", currentValue: "/old.png",
    }, "assets/whiteboards/participant.png", oneOfSchema)).toBeNull();
    expect(values).toEqual({ modules: [{ type: "participant", bgImage: "assets/whiteboards/participant.png" }] });

    const emptyValues: Record<string, unknown> = {};
    expect(updateWhiteboardImageTarget(emptyValues, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].image",
    }, "assets/whiteboards/image.png", oneOfSchema)).toBeNull();
    expect(emptyValues).toEqual({ modules: [{ type: "image", image: "assets/whiteboards/image.png" }] });

    const missingDiscriminator: Record<string, unknown> = { modules: [{}] };
    expect(updateWhiteboardImageTarget(missingDiscriminator, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].image",
    }, "assets/whiteboards/image-with-const.png", oneOfSchema)).toBeNull();
    expect(missingDiscriminator).toEqual({
      modules: [{ type: "image", image: "assets/whiteboards/image-with-const.png" }],
    });
  });

  it("does not write a target from a different oneOf discriminator branch", () => {
    const values: Record<string, unknown> = { modules: [{ type: "participant" }] };
    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].image",
    }, "assets/whiteboards/image.png", oneOfSchema)).toBe("图片字段路径已变化");
    expect(values).toEqual({ modules: [{ type: "participant" }] });
  });

  it("hydrates discriminators through nested oneOf arrays", () => {
    const values: Record<string, unknown> = {};
    expect(updateWhiteboardImageTarget(values, {
      scope: "page", pageId: "闯关活动页-进行中_ec853d", fieldPath: "modules[0].levels[0].lockedImage",
    }, "assets/whiteboards/locked.png", nestedOneOfSchema)).toBeNull();
    expect(values).toEqual({
      modules: [{ type: "level", levels: [{ type: "levelCard", lockedImage: "assets/whiteboards/locked.png" }] }],
    });
  });
});
