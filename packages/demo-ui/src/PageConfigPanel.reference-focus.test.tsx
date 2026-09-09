import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageConfigPanel } from "./PageConfigPanel";

afterEach(cleanup);
const schema = JSON.stringify({ type: "object", properties: {
  cards: { type: "array", title: "卡片", items: { oneOf: [
    { properties: { kind: { const: "image" }, title: { type: "string", title: "图文标题" } } },
    { properties: { kind: { const: "text" }, title: { type: "string", title: "文字标题" } } },
  ] } },
} });

describe("配置定义引用 focus", () => {
  it("既有编辑器定位精确嵌套分支字段并只消费一次", async () => {
    const consumed = vi.fn();
    const props = { pages: [{ id: "page", name: "Page", schema, configData: {} }], detailPageId: "page",
      onPageConfigChange: vi.fn(), onPageDefinitionChange: vi.fn(),
      configDefinitionFocus: { scope: "page" as const, pageId: "page", fieldKey: "cards[kind=image].title" },
      onConfigDefinitionFocusConsumed: consumed };
    const view = render(<PageConfigPanel {...props} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByDisplayValue("图文标题")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("文字标题")).not.toBeInTheDocument();
    view.rerender(<PageConfigPanel {...props} pages={[...props.pages]} />);
    expect(consumed).toHaveBeenCalledTimes(1);
  });
  it.each(["cards[kind=image]", "cards[0].title"])("不将合成分支或实例键 %s 回退到父定义", (fieldKey) => {
    render(<PageConfigPanel pages={[{ id: "page", name: "Page", schema, configData: {} }]} detailPageId="page"
      onPageConfigChange={vi.fn()} onPageDefinitionChange={vi.fn()}
      configDefinitionFocus={{ scope: "page", pageId: "page", fieldKey }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("不绕过既有只读权限", () => {
    render(<PageConfigPanel pages={[{ id: "page", name: "Page", schema, configData: {} }]} detailPageId="page" readonly
      onPageConfigChange={vi.fn()} onPageDefinitionChange={vi.fn()}
      configDefinitionFocus={{ scope: "page", pageId: "page", fieldKey: "cards[kind=image].title" }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("不消费其他页面的字段 focus", () => {
    const consumed = vi.fn();
    render(<PageConfigPanel pages={[{ id: "page", name: "Page", schema, configData: {} }]} detailPageId="page"
      onPageConfigChange={vi.fn()} configDefinitionFocus={{ scope: "page", pageId: "other", fieldKey: "cards[kind=image].title" }}
      onConfigDefinitionFocusConsumed={consumed} />);
    expect(consumed).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
