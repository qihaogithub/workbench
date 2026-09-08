import { describe, it, expect } from "vitest";
import {
  decodeMarkdownReferenceUri as decode,
  encodeMarkdownReferenceUri as encode,
  serializeMarkdownReference,
} from "../uri";
import { parseMarkdownReferences } from "../parser";
import type { MarkdownReferenceTarget } from "../types";
describe("extended URI contracts", () => {
  const targets: MarkdownReferenceTarget[] = [
    {
      kind: "config",
      projectId: "项目",
      pageId: "页",
      fieldPath: "list[kind=a/b].标题(",
    },
    ...(
      [
        "memory",
        "project-convention",
        "page-convention",
        "design-spec",
      ] as const
    ).map((documentKind) => ({
      kind: "document" as const,
      projectId: "p",
      documentKind,
      docId:
        documentKind === "memory"
          ? "memory"
          : documentKind === "project-convention"
            ? "convention"
            : "中文/ID",
    })),
  ];
  it.each(targets)("round trips $kind $documentKind", (target) => {
    expect(decode(encode(target))).toEqual(target);
    expect(
      parseMarkdownReferences(serializeMarkdownReference(target, "Label"))
        .references[0]?.target,
    ).toEqual(target);
  });
  it("keeps knowledge URI and validates fixed document IDs", () => {
    expect(
      encode({
        kind: "document",
        projectId: "p",
        docId: "d",
        documentKind: "knowledge",
      }),
    ).toBe("wb://document/p/d");
    expect(decode("wb://document/p/memory/other")).toBeUndefined();
    expect(decode("wb://document/p/project-convention/other")).toBeUndefined();
    expect(decode("wb://document/p/arbitrary/path")).toBeUndefined();
    expect(decode("wb://config/p/page")).toBeUndefined();
  });
});
