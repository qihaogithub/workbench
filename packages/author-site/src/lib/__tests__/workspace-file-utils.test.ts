import {
  isEmptyConfigSchemaContent,
  isFileEditable,
  isVisiblePageRuntimeFile,
} from "../workspace-file-utils";

describe("workspace-file-utils", () => {
  it("hides non-current runtime files for prototype pages", () => {
    expect(isVisiblePageRuntimeFile({
      fileName: "prototype.html",
      runtimeType: "prototype-html-css",
    })).toBe(true);
    expect(isVisiblePageRuntimeFile({
      fileName: "prototype.css",
      runtimeType: "prototype-html-css",
    })).toBe(true);
    expect(isVisiblePageRuntimeFile({
      fileName: "index.tsx",
      runtimeType: "prototype-html-css",
    })).toBe(false);
    expect(isVisiblePageRuntimeFile({
      fileName: "prototype.meta.json",
      runtimeType: "prototype-html-css",
    })).toBe(false);
  });

  it("hides prototype files for high-fidelity pages", () => {
    expect(isVisiblePageRuntimeFile({
      fileName: "index.tsx",
      runtimeType: "high-fidelity-react",
    })).toBe(true);
    expect(isVisiblePageRuntimeFile({
      fileName: "prototype.html",
      runtimeType: "high-fidelity-react",
    })).toBe(false);
    expect(isVisiblePageRuntimeFile({
      fileName: "prototype.css",
      runtimeType: "high-fidelity-react",
    })).toBe(false);
  });

  it("hides empty page schemas but keeps populated schemas", () => {
    const emptySchema = JSON.stringify({
      type: "object",
      properties: {},
    });
    const populatedSchema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    expect(isEmptyConfigSchemaContent(emptySchema)).toBe(true);
    expect(isVisiblePageRuntimeFile({
      fileName: "config.schema.json",
      runtimeType: "prototype-html-css",
      schemaContent: emptySchema,
    })).toBe(false);
    expect(isVisiblePageRuntimeFile({
      fileName: "config.schema.json",
      runtimeType: "prototype-html-css",
      schemaContent: populatedSchema,
    })).toBe(true);
  });

  it("allows editing current runtime source files", () => {
    expect(isFileEditable("demos/home/prototype.html")).toBe(true);
    expect(isFileEditable("demos/home/prototype.css")).toBe(true);
    expect(isFileEditable("demos/home/prototype.meta.json")).toBe(false);
  });
});
