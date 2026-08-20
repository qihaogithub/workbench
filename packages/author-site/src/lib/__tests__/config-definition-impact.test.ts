import { analyzeConfigDefinitionImpact } from "../config-definition-impact";

describe("analyzeConfigDefinitionImpact", () => {
  it("requires AI when a bound field is deleted and reports requirements references", () => {
    const report = analyzeConfigDefinitionImpact({
      scope: "page", pageId: "welcome",
      mutation: { schema: "{}", valuePlan: { setDefaults: {}, removeKeys: ["headline"] }, diff: { added: [], updated: [], deleted: ["headline"], typeChanged: [] } },
      pages: [{ pageId: "welcome", pageName: "欢迎页", code: "const { headline } = props;", requirements: "使用 @[标题](headline)" }],
    });
    expect(report.risk).toBe("ai_required");
    expect(report.boundPages).toEqual([{ pageId: "welcome", pageName: "欢迎页", keys: ["headline"] }]);
    expect(report.requirementRefs).toEqual([{ pageId: "welcome", pageName: "欢迎页", key: "headline" }]);
  });
});
