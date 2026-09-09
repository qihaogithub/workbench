import { describe, expect, it } from "vitest";

import { validateConfigResourceMutation } from "../../src/backends/pi-tools/config-mutation-validation";

const baseResources = {
  "workspace-tree.json": JSON.stringify({ folders: [], pages: [{ id: "home" }, { id: "member" }] }),
  "project.config.schema.json": JSON.stringify({ type: "object", properties: { enabled: { type: "boolean" } } }),
  "project.visibility-rules.json": JSON.stringify({ version: 1, rules: [{
    id: "hide-member",
    source: { scope: "project", fieldKey: "enabled" },
    condition: { kind: "truthy" },
    target: { type: "page", pageId: "member" },
    effect: "hidden",
  }] }),
  "demos/home/config.schema.json": JSON.stringify({ type: "object", properties: {} }),
  "demos/member/config.schema.json": JSON.stringify({ type: "object", properties: {} }),
  "demos/home/index.tsx": "export default function Home(){ return null; }",
  "demos/member/index.tsx": "export default function Member(){ return null; }",
};

describe("config mutation validation", () => {
  it("allows ordinary schema changes that preserve visibility references", () => {
    const issue = validateConfigResourceMutation({
      path: "project.config.schema.json",
      content: JSON.stringify({ type: "object", properties: { enabled: { type: "boolean" }, heroImage: { type: "string", format: "image" } } }),
      resources: baseResources,
    });
    expect(issue).toBeUndefined();
  });

  it("rejects a schema that removes a field referenced by current visibility rules", () => {
    const issue = validateConfigResourceMutation({
      path: "project.config.schema.json",
      content: JSON.stringify({ type: "object", properties: {} }),
      resources: baseResources,
    });
    expect(issue).toMatchObject({ category: "visibility_reference_conflict", code: "VISIBILITY_REFERENCE_CONFLICT" });
  });

  it("rejects config values that reference an unregistered asset", () => {
    const resources = {
      ...baseResources,
      "demos/home/config.schema.json": JSON.stringify({ type: "object", properties: { hero: { type: "string", format: "image" } } }),
      "assets/known.png": "",
    };
    expect(validateConfigResourceMutation({
      path: "demos/home/config.values.json",
      content: JSON.stringify({ hero: "assets/missing.png" }),
      resources,
    })).toMatchObject({ category: "resource_reference", code: "RESOURCE_NOT_REGISTERED" });
  });

  it("treats Authority resource hash paths as registered binary assets", () => {
    const resources = {
      ...baseResources,
      "demos/home/config.schema.json": JSON.stringify({ type: "object", properties: { hero: { type: "string", format: "image" } } }),
    };
    expect(validateConfigResourceMutation({
      path: "demos/home/config.values.json",
      content: JSON.stringify({ hero: "assets/known.png" }),
      resources,
      resourcePaths: ["assets/known.png"],
    })).toBeUndefined();
  });
});
