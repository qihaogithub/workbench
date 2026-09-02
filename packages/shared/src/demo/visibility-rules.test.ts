import { describe, expect, it } from "vitest";
import {
  resolveVisibility,
  validateVisibilityRules,
  visibilityRulesToJson,
  type VisibilityRulesDocument,
} from "./visibility-rules";

const schema = JSON.stringify({
  type: "object",
  properties: {
    membershipEnabled: {
      type: "boolean",
      default: false,
      "ui:options": { configType: "business" },
    },
  },
});

const document: VisibilityRulesDocument = {
  version: 1,
  generatedBy: "test",
  rules: [
    {
      id: "membership-page-hidden",
      source: { scope: "project", fieldKey: "membershipEnabled" },
      condition: { kind: "truthy" },
      target: { type: "page", pageId: "membership" },
      effect: "hidden",
    },
    {
      id: "membership-entry-hidden",
      source: { scope: "project", fieldKey: "membershipEnabled" },
      condition: { kind: "equals", value: false },
      target: { type: "region", pageId: "home", regionId: "membership-entry" },
      effect: "hidden",
    },
  ],
};

describe("configuration-driven visibility rules", () => {
  it("validates stable page and declared region references", () => {
    const result = validateVisibilityRules(document, {
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
      projectSchema: schema,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects page-scoped sources and missing targets", () => {
    const result = validateVisibilityRules({
      version: 1,
      rules: [{
        id: "bad",
        source: { scope: "page", fieldKey: "membershipEnabled" },
        condition: { kind: "truthy" },
        target: { type: "page", pageId: "missing" },
        effect: "hidden",
      }],
    }, {
      pageIds: ["home"],
      projectSchema: schema,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["SOURCE_SCOPE_UNSUPPORTED", "TARGET_PAGE_MISSING"]),
    );
  });

  it("rejects project/page configuration key collisions", () => {
    const result = validateVisibilityRules(document, {
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
      projectSchema: schema,
      pageSchemas: {
        home: JSON.stringify({ type: "object", properties: { membershipEnabled: { type: "boolean" } } }),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("PAGE_CONFIG_SCOPE_CONFLICT");
  });

  it("resolves published values and filters session overrides", () => {
    const published = resolveVisibility({
      rules: document,
      projectSchema: schema,
      projectConfigValues: { membershipEnabled: false },
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
    });
    expect(published.pages.membership.visible).toBe(true);
    expect(published.regions["home:membership-entry"].visible).toBe(false);

    const session = resolveVisibility({
      rules: document,
      projectSchema: schema,
      projectConfigValues: { membershipEnabled: false },
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
    }, { values: { membershipEnabled: true, ignored: true }, fieldKeys: ["membershipEnabled"] });
    expect(session.pages.membership.visible).toBe(false);
    expect(session.regions["home:membership-entry"].visible).toBe(true);
    expect(session.values.ignored).toBeUndefined();
  });

  it("uses project schema defaults when the published values file omits a field", () => {
    const enabledByDefault = resolveVisibility({
      rules: document,
      projectSchema: JSON.stringify({
        type: "object",
        properties: { membershipEnabled: { type: "boolean", default: true } },
      }),
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
    });
    expect(enabledByDefault.pages.membership.visible).toBe(false);
  });

  it("can restrict session overrides to regions in a viewer session", () => {
    const session = resolveVisibility({
      rules: document,
      projectSchema: schema,
      projectConfigValues: { membershipEnabled: false },
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
    }, {
      values: { membershipEnabled: true },
      fieldKeys: ["membershipEnabled"],
      allowPageTargets: false,
    });
    expect(session.pages.membership.visible).toBe(true);
    expect(session.regions["home:membership-entry"].visible).toBe(true);
  });

  it("accepts iterable field allow-lists for session overrides", () => {
    const session = resolveVisibility({
      rules: document,
      projectSchema: schema,
      projectConfigValues: { membershipEnabled: false },
      pageIds: ["home", "membership"],
      regionIds: { home: ["membership-entry"] },
    }, {
      values: { membershipEnabled: true, ignored: true },
      fieldKeys: new Set(["membershipEnabled"]),
    });
    expect(session.pages.membership.visible).toBe(false);
    expect(session.values.ignored).toBeUndefined();
  });

  it("materializes page and region iterables before resolving", () => {
    const pageIds = function* () {
      yield "home";
      yield "membership";
    };
    const regionIds = function* () {
      yield "membership-entry";
    };
    const resolved = resolveVisibility({
      rules: document,
      projectSchema: schema,
      projectConfigValues: { membershipEnabled: false },
      pageIds: pageIds(),
      regionIds: { home: regionIds() },
    });
    expect(Object.keys(resolved.pages)).toEqual(["home", "membership"]);
    expect(resolved.regions["home:membership-entry"].visible).toBe(false);
  });

  it("serializes an auditable newline-terminated asset", () => {
    expect(visibilityRulesToJson(document)).toContain('"version": 1');
    expect(visibilityRulesToJson(document).endsWith("\n")).toBe(true);
  });
});
