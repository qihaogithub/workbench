import { describe, expect, it } from "vitest";
import { decodeMarkdownReferenceUri, encodeMarkdownReferenceUri, serializeMarkdownReference } from "../uri";
import { parseMarkdownReferences } from "../parser";

describe("markdown reference URI codec", () => {
  it("round-trips typed IDs, including unicode and encoded slashes", () => {
    const target = { kind: "document" as const, projectId: "项目 1", docId: "doc:一" };
    const uri = encodeMarkdownReferenceUri(target);
    expect(uri).toBe("wb://document/%E9%A1%B9%E7%9B%AE%201/doc%3A%E4%B8%80");
    expect(decodeMarkdownReferenceUri(uri)).toEqual(target);
  });

  it("serializes canonical markdown", () => {
    expect(serializeMarkdownReference({ kind: "page", projectId: "p", pageId: "home" }, "首页"))
      .toBe("[首页](wb://page/p/home)");
    expect(serializeMarkdownReference({ kind: "project", projectId: "p" }, "A [B]"))
      .toBe("[A \\[B\\]](wb://project/p)");
  });

  it("rejects unknown, incomplete, and query-bearing URIs", () => {
    expect(decodeMarkdownReferenceUri("wb://folder/x")).toBeUndefined();
    expect(decodeMarkdownReferenceUri("wb://page/p")).toBeUndefined();
    expect(decodeMarkdownReferenceUri("wb://project/p?x=1")).toBeUndefined();
  });
});

describe("parseMarkdownReferences", () => {
  it("separates wb links, legacy config refs, and ordinary links", () => {
    const parsed = parseMarkdownReferences(
      "[项目](wb://project/p) @[颜色](color) [外部](https://example.com)",
    );
    expect(parsed.references[0]?.target).toEqual({ kind: "project", projectId: "p" });
    expect(parsed.legacyConfigRefs[0]?.key).toBe("color");
    expect(parsed.links[0]?.destination).toBe("https://example.com");
  });

  it("ignores fenced and inline code while retaining source positions", () => {
    const parsed = parseMarkdownReferences(
      "```md\n[x](wb://project/no)\n```\n`[y](wb://project/no)`\n[首页](wb://page/p/home)",
    );
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0]).toMatchObject({ line: 5, column: 1 });
  });

  it("reports malformed wb links and supports escaped labels / chinese text", () => {
    const parsed = parseMarkdownReferences("[中文\\]标签](wb://page/p/) [bad](wb://unknown/x)");
    expect(parsed.references).toHaveLength(0);
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(["missing-target-id", "unknown-target-kind"]);
  });

  it("does not treat links in HTML attributes as references", () => {
    const parsed = parseMarkdownReferences('<a href="[x](wb://project/p)">x</a>');
    expect(parsed.references).toHaveLength(0);
  });
});
