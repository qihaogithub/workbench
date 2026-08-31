import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageConfigPanel } from "./PageConfigPanel";

const pageSchema = JSON.stringify({
  type: "object",
  properties: {
    cover: { type: "string", title: "封面", format: "image" },
  },
});

describe("PageConfigPanel design-spec bubble", () => {
  it("将规范气泡挂到文档根层，避免分栏容器裁切", async () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
        detailPageId="page-1"
        onPageConfigChange={vi.fn()}
        mediaBaseUrl="https://assets.example.test"
        designSpecEntries={[{
          docId: "doc-1",
          docTitle: "设计规范",
          entryId: "entry-1",
          entryTitle: "封面样式",
          markdown: "图片高度不超过 300px\n\n![效果图](/api/images/spec.png)",
          scope: "page",
          pageId: "page-1",
          fieldKey: "cover",
        }]}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "查看设计规范：封面" }));
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：封面" }));

    const bubble = await screen.findByRole("complementary", { name: "设计规范" });
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.querySelector("h3")).toHaveTextContent("封面");
    expect(screen.getByText("图片高度不超过 300px")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "效果图" })).toHaveAttribute(
      "src",
      "https://assets.example.test/api/images/spec.png",
    );
    expect(bubble.style.height).toBe("");
    expect(bubble.style.maxHeight).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "关闭设计规范" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "设计规范" })).not.toBeInTheDocument());
  });
});
