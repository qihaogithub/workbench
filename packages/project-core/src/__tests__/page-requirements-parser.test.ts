import { describe, expect, it } from "vitest";

import {
  findPageRequirementRefMatches,
  inferPageRequirementTitle,
  parsePageRequirementsRefs,
  resolvePageRequirementRefs,
} from "@workbench/shared";

describe("页面配置要求引用解析", () => {
  it("从正文提取行内引用", () => {
    const refs = parsePageRequirementsRefs(
      "@[标题](title) 需要突出；@[按钮](cta) 需可点击。",
    );
    expect(refs).toEqual([
      { name: "标题", key: "title" },
      { name: "按钮", key: "cta" },
    ]);
  });

  it("空文档返回空数组", () => {
    expect(parsePageRequirementsRefs("")).toEqual([]);
    expect(parsePageRequirementsRefs("   ")).toEqual([]);
  });

  it("普通 Markdown 链接不被误判为引用", () => {
    const refs = parsePageRequirementsRefs("[普通链接](https://example.com)");
    expect(refs).toEqual([]);
  });

  it("按 key 定位引用出现片段", () => {
    const matches = findPageRequirementRefMatches(
      "前文 @[标题](title) 中段 @[标题](title)",
      "title",
    );
    expect(matches).toHaveLength(2);
    expect(matches[0].name).toBe("标题");
  });

  it("按当前 schema 解析引用是否有效", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", title: "页面标题" },
      },
    });
    const resolved = resolvePageRequirementRefs(
      "@[标题](title) @[已删除](gone)",
      schema,
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({
      key: "title",
      resolved: true,
      currentName: "页面标题",
    });
    expect(resolved[1]).toMatchObject({ key: "gone", resolved: false });
  });

  it("schema 缺失时引用全部视为失效", () => {
    const resolved = resolvePageRequirementRefs("@[标题](title)");
    expect(resolved[0].resolved).toBe(false);
  });

  it("从一级标题推断文档标题", () => {
    expect(inferPageRequirementTitle("# 交互要求\n正文")).toBe("交互要求");
    expect(inferPageRequirementTitle("无标题正文")).toBeUndefined();
  });
});