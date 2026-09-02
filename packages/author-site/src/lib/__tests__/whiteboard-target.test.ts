import { updateWhiteboardImageTarget, type WhiteboardTargetInput } from "../whiteboard-target";

function singleTarget(currentValue?: string): WhiteboardTargetInput {
  return {
    scope: "page",
    pageId: "page-1",
    fieldPath: "heroImage",
    ...(currentValue === undefined ? {} : { currentValue }),
  };
}

function listTarget(index: number, url: string): WhiteboardTargetInput {
  return {
    scope: "page",
    pageId: "page-1",
    fieldPath: "gallery",
    listItem: { index, url },
  };
}

describe("whiteboard image target updates", () => {
  it("uses the schema default when the persisted single-image value is absent", () => {
    const values: Record<string, unknown> = {};

    const conflict = updateWhiteboardImageTarget(
      values,
      singleTarget("/api/images/original"),
      "assets/whiteboards/new.png",
      "/api/images/original",
    );

    expect(conflict).toBeNull();
    expect(values).toEqual({ heroImage: "assets/whiteboards/new.png" });
  });

  it("rejects a changed schema default when the persisted value is absent", () => {
    const values: Record<string, unknown> = {};

    const conflict = updateWhiteboardImageTarget(
      values,
      singleTarget("/api/images/original"),
      "assets/whiteboards/new.png",
      "/api/images/changed",
    );

    expect(conflict).toBe("图片字段已被其他编辑者替换，请刷新后重试");
    expect(values).toEqual({});
  });

  it("keeps the persisted single-image concurrency guard", () => {
    const values: Record<string, unknown> = { heroImage: "/api/images/original" };

    expect(
      updateWhiteboardImageTarget(
        values,
        singleTarget("/api/images/original"),
        "assets/whiteboards/new.png",
      ),
    ).toBeNull();
    expect(values.heroImage).toBe("assets/whiteboards/new.png");

    const staleValues: Record<string, unknown> = { heroImage: "/api/images/changed" };
    expect(
      updateWhiteboardImageTarget(
        staleValues,
        singleTarget("/api/images/original"),
        "assets/whiteboards/new.png",
      ),
    ).toBe("图片字段已被其他编辑者替换，请刷新后重试");
    expect(staleValues.heroImage).toBe("/api/images/changed");
  });

  it("uses and clones a schema-default image list when the persisted list is absent", () => {
    const values: Record<string, unknown> = {};
    const defaultList = ["/api/images/one", "/api/images/two"];

    const conflict = updateWhiteboardImageTarget(
      values,
      listTarget(1, "/api/images/two"),
      "assets/whiteboards/new.png",
      defaultList,
    );

    expect(conflict).toBeNull();
    expect(values).toEqual({ gallery: ["/api/images/one", "assets/whiteboards/new.png"] });
    expect(defaultList).toEqual(["/api/images/one", "/api/images/two"]);
  });

  it("rejects a stale image-list item without mutating the persisted list", () => {
    const values: Record<string, unknown> = { gallery: ["/api/images/one", "/api/images/changed"] };

    const conflict = updateWhiteboardImageTarget(
      values,
      listTarget(1, "/api/images/two"),
      "assets/whiteboards/new.png",
    );

    expect(conflict).toBe("图片列表已被排序、删除或替换，请刷新后重试");
    expect(values).toEqual({ gallery: ["/api/images/one", "/api/images/changed"] });
  });
});
