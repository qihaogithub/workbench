import { resolveConfigApplicationPlan } from "../config-application-plan";

describe("resolveConfigApplicationPlan", () => {
  it("keeps a default-only field edit schema-only", () => {
    expect(resolveConfigApplicationPlan({ source: "panel-edit", scope: "page" })).toMatchObject({
      mode: "direct", effect: "schema_only", primaryLabel: "保存字段",
    });
  });

  it("requires AI for a bound type migration", () => {
    expect(resolveConfigApplicationPlan({ source: "panel-edit", scope: "page", isBound: true, typeChanged: true })).toMatchObject({
      mode: "ai_required", primaryLabel: "交给 AI 应用",
    });
  });

  it("allows a verified React visual patch to apply directly", () => {
    expect(resolveConfigApplicationPlan({ source: "visual-bind", scope: "page", runtimeType: "high-fidelity-react", hasVisualTarget: true, hasDirectPatch: true })).toMatchObject({
      mode: "direct", effect: "bind_and_apply", primaryLabel: "保存并应用",
    });
  });

  it("blocks sketch visual binding without creating a field", () => {
    expect(resolveConfigApplicationPlan({ source: "visual-bind", scope: "page", runtimeType: "sketch-scene", hasVisualTarget: true })).toMatchObject({
      mode: "unsupported", primaryLabel: "请求实现支持",
    });
  });
});
