import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  hasViewerDocumentContent,
  ViewerDocumentView,
} from "../src/components/ViewerDocumentView";

vi.mock("@workbench/demo-ui", () => ({
  DocumentEditor: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
    <div data-read-only={String(readOnly)}>{value}</div>
  ),
  PageRequirements: ({
    markdown,
    allowExternalMedia,
  }: {
    markdown: string;
    allowExternalMedia?: boolean;
  }) => (
    <div data-external-media={String(allowExternalMedia)}>{markdown}</div>
  ),
  parseSchemaToFields: (schema: string) => [{
    fields: Object.entries(JSON.parse(schema).properties || {}).map(([key, field]) => ({ key, ...(field as object) })),
  }],
}));

vi.mock("../src/lib/api", () => ({
  DATA_BASE: "/data",
  getKnowledgeDocContent: vi.fn(),
  getDataUrl: (value: string) => value,
  getDesignSpecDoc: vi.fn().mockResolvedValue({
    id: "spec-1",
    title: "首页规范",
    entries: [{
      id: "entry-1",
      title: "品牌图片",
      markdown: "图片应使用 16:9。",
      refs: [{ scope: "page", pageId: "page-1", fieldKey: "heroImage" }],
    }],
  }),
}));

describe("ViewerDocumentView", () => {
  it("only exposes document content for user documents or design specifications", () => {
    expect(hasViewerDocumentContent([], [])).toBe(false);
    expect(hasViewerDocumentContent([
      {
        id: "system",
        title: "项目公约",
        fileName: "system.md",
        source: "system",
        description: "",
        addedAt: "",
        updatedAt: "",
      },
    ], [])).toBe(false);
    expect(hasViewerDocumentContent([
      {
        id: "user",
        title: "使用说明",
        fileName: "guide.md",
        source: "user",
        description: "",
        addedAt: "",
        updatedAt: "",
      },
    ], [])).toBe(true);
    expect(hasViewerDocumentContent([], [{ id: "spec-1", title: "首页规范", createdAt: "", updatedAt: "" }])).toBe(true);
  });

  it("renders design-spec configuration entries with the author-side card structure", async () => {
    render(
      <ViewerDocumentView
        projectId="project-1"
        items={[]}
        designSpecs={[{ id: "spec-1", title: "首页规范", createdAt: "", updatedAt: "" }]}
        projectConfigSchema="{}"
        pages={[{
          id: "page-1",
          name: "首页",
          schema: JSON.stringify({
            type: "object",
            properties: {
              heroImage: { type: "string", title: "头图", format: "image", default: "/hero.png" },
            },
          }),
        }]}
      />,
    );

    expect(await screen.findByText("品牌图片")).toBeTruthy();
    expect(screen.getByText("1 项配置")).toBeTruthy();
    expect(screen.getByText("头图")).toBeTruthy();
    expect(screen.getByRole("table").parentElement?.className).toContain(
      "max-w-[760px]",
    );
    expect(screen.getByText("图片应使用 16:9。").getAttribute("data-external-media")).toBe("true");
    expect(screen.getByText("图片应使用 16:9。").getAttribute("data-read-only")).toBeNull();
  });
});
