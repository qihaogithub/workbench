import { describe, expect, it } from "vitest";

import {
  buildVisibilityWorkspaceFacts,
  summarizeVisibilityDraftImpact,
} from "../../src/backends/pi-tools/visibility-tools";

const projectSchema = JSON.stringify({
  type: "object",
  properties: {
    membershipEnabled: { type: "boolean", default: false, "ui:options": { configType: "business" } },
    logo: { type: "string", format: "image", "ui:options": { configType: "resource" } },
  },
});

describe("visibility tools workspace facts", () => {
  it("returns stable page ids, config keys and explicit region declarations", () => {
    const facts = buildVisibilityWorkspaceFacts({
      "workspace-tree.json": JSON.stringify({
        folders: [],
        pages: [
          { id: "home", name: "首页", order: 1, parentId: null, routeKey: "home", runtimeType: "prototype-html-css" },
          { id: "member", name: "会员", order: 0, parentId: null, routeKey: "member", runtimeType: "high-fidelity-react" },
        ],
      }),
      "project.config.schema.json": projectSchema,
      "demos/home/config.schema.json": JSON.stringify({ type: "object", properties: { headline: { type: "string" } } }),
      "demos/home/prototype.html": '<section data-region-id="membership-entry"></section><p>not a region</p>',
      "demos/member/config.schema.json": JSON.stringify({ type: "object", properties: {} }),
      "demos/member/index.tsx": 'const region = { regionId: "member-body" }; export default function Page(){ return <main /> }',
      "project.visibility-rules.json": JSON.stringify({ version: 1, rules: [{ id: "membership-hidden", source: { scope: "project", fieldKey: "membershipEnabled" }, condition: { kind: "truthy" }, target: { type: "page", pageId: "member" }, effect: "hidden" }] }),
    }, { revision: 4, rootHash: "root" });

    expect(facts.pages.map((page) => page.id)).toEqual(["member", "home"]);
    expect(facts.projectConfigKeys).toEqual(["membershipEnabled", "logo"]);
    expect(facts.projectConfigFields).toEqual([
      { key: "membershipEnabled", type: "business" },
      { key: "logo", type: "resource" },
    ]);
    expect(facts.pages.find((page) => page.id === "home")?.regionIds).toEqual(["membership-entry"]);
    expect(facts.pages.find((page) => page.id === "member")?.regionIds).toEqual(["member-body"]);
    expect(facts.rules?.rules[0].target).toEqual({ type: "page", pageId: "member" });
  });

  it("summarizes rule targets and published default states", () => {
    const facts = buildVisibilityWorkspaceFacts({
      "workspace-tree.json": JSON.stringify({ folders: [], pages: [{ id: "member", name: "会员", order: 0, parentId: null }] }),
      "project.config.schema.json": JSON.stringify({ type: "object", properties: { enabled: { type: "boolean", default: true } } }),
      "demos/member/config.schema.json": JSON.stringify({ type: "object", properties: {} }),
      "demos/member/index.tsx": '<div data-region-id="entry" />',
    });
    const rules = { version: 1 as const, rules: [
      { id: "page-disabled", source: { scope: "project" as const, fieldKey: "enabled" }, condition: { kind: "truthy" as const }, target: { type: "page" as const, pageId: "member" }, effect: "disabled" as const },
      { id: "region-hidden", source: { scope: "project" as const, fieldKey: "enabled" }, condition: { kind: "truthy" as const }, target: { type: "region" as const, pageId: "member", regionId: "entry" }, effect: "hidden" as const },
    ] };
    const report = summarizeVisibilityDraftImpact(facts, rules, ["project.visibility-rules.json"]);
    expect(report.affectedPages).toEqual(["member"]);
    expect(report.affectedRegions).toEqual(["member:entry"]);
    expect(report.disabledPagesAtPublishedDefaults).toEqual(["member"]);
    expect(report.hiddenPagesAtPublishedDefaults).toEqual([]);
    expect(report.validationIssues).toEqual([]);
  });
});
