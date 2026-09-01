import { describe, expect, it } from "vitest";

import { classifyManagedDocumentPath, resolveManagedDocumentPath } from "../document-proposal";

describe("managed document proposal policy", () => {
  it("accepts only DocumentView markdown paths", () => {
    expect(classifyManagedDocumentPath("knowledge/rules.md")).toEqual({ kind: "knowledge", resourcePath: "knowledge/rules.md" });
    expect(classifyManagedDocumentPath("./memory.md")).toEqual({ kind: "memory", resourcePath: "memory.md" });
    expect(classifyManagedDocumentPath("demos/home/convention.md")).toEqual({ kind: "page-convention", resourcePath: "demos/home/convention.md" });
    expect(classifyManagedDocumentPath("knowledge/manifest.json")).toBeNull();
    expect(classifyManagedDocumentPath("../.env")).toBeNull();
  });

  it("derives knowledge resource ids from the frozen manifest", () => {
    expect(resolveManagedDocumentPath("knowledge/rules.md", {
      items: [{
        id: "doc-rules", title: "Rules", fileName: "rules.md", source: "user",
        description: "", addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    })).toEqual({ kind: "knowledge", resourcePath: "knowledge/rules.md", resourceId: "doc-rules" });
  });
});
