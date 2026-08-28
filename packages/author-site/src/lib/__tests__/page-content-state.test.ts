import { getPersistablePageContent } from "../page-content-state";

describe("getPersistablePageContent", () => {
  it("uses the requested page's cached content instead of a different active page", () => {
    expect(
      getPersistablePageContent({
        pageId: "page-b",
        pageCodes: { "page-a": "A code", "page-b": "B code" },
        pageSchemaMap: { "page-a": "A schema", "page-b": "B schema" },
      }),
    ).toEqual({ code: "B code", schema: "B schema" });
  });

  it("refuses to persist a page whose complete content has not loaded", () => {
    expect(
      getPersistablePageContent({
        pageId: "page-b",
        pageCodes: { "page-a": "A code" },
        pageSchemaMap: { "page-a": "A schema" },
      }),
    ).toBeNull();
  });
});
