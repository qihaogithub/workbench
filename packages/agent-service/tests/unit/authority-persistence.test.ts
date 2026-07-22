import { describe, expect, it } from "vitest";

import { deduplicateContent } from "../../src/collab/extensions/authority-persistence";

describe("AuthorityPersistenceExtension 重复内容守卫", () => {
  const moduleSource = [
    "interface DemoProps {}",
    "const subjects = [];",
    "export default function PhoneSquare() {",
    "  return null;",
    "}",
    "",
  ].join("\n");

  it("去除两个带尾部换行的完整模块副本", () => {
    expect(deduplicateContent(moduleSource + moduleSource)).toBe(moduleSource);
  });

  it.each([4, 8])("把 %i 次重复收敛为单份模块", (copies) => {
    expect(deduplicateContent(moduleSource.repeat(copies))).toBe(moduleSource);
  });

  it("不处理仅包含相似代码段的正常源码", () => {
    const source = [
      "const first = () => {",
      "  return null;",
      "};",
      "const second = () => {",
      "  return null;",
      "};",
      "",
    ].join("\n");

    expect(deduplicateContent(source)).toBeNull();
  });
});
