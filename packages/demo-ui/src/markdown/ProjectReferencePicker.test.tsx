import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  encodeMarkdownReferenceUri,
  type MarkdownReferenceCandidate,
} from "@workbench/shared/markdown-reference";
import {
  buildReferenceTree,
  ProjectReferencePicker,
} from "./ProjectReferencePicker";

const page: MarkdownReferenceCandidate = {
  target: { kind: "page", projectId: "p", pageId: "home" },
  label: "首页",
  displayPath: "项目 / 首页",
};
const pageId = encodeMarkdownReferenceUri(page.target);
const field: MarkdownReferenceCandidate = {
  target: {
    kind: "config",
    projectId: "p",
    pageId: "home",
    fieldPath: "slides[].image",
  },
  label: "图片",
  displayPath: "项目 / 首页 / 轮播 / 图片",
  hierarchy: [
    { id: pageId, label: "首页", kind: "page" },
    { id: "group:carousel", label: "轮播", kind: "folder" },
  ],
};
const doc: MarkdownReferenceCandidate = {
  target: { kind: "document", projectId: "p", docId: "d" },
  label: "交互说明",
  displayPath: "项目 / 交互说明",
  documentGroup: "知识文档",
};
const candidates = [field, page, doc];

describe("project reference picker", () => {
  it("merges a selectable parent arriving after children without duplicating it", () => {
    const tree = buildReferenceTree(candidates, "page");
    expect(tree).toHaveLength(1);
    expect(tree[0].candidate).toBe(page);
    expect(tree[0].children[0].candidate).toBeUndefined();
    expect(tree[0].children[0].children[0].candidate).toBe(field);
  });
  it("expanding, switching tabs and cancelling never inserts content", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ProjectReferencePicker
        candidates={candidates}
        status="ready"
        anchor={{ left: 10, top: 10 }}
        onSelect={onSelect}
        onClose={onClose}
        onRetry={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "收起首页" }));
    expect(screen.queryByRole("treeitem", { name: "图片" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "文档" }));
    expect(screen.getByRole("treeitem", { name: "交互说明" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("inserts the page itself independently of its expansion arrow", () => {
    const onSelect = vi.fn();
    render(
      <ProjectReferencePicker
        candidates={candidates}
        status="ready"
        anchor={{ left: 0, top: 0 }}
        onSelect={onSelect}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("treeitem", { name: "首页" }));
    expect(onSelect).toHaveBeenCalledWith(page);
  });
  it("does not truncate a large directory and excludes project targets", () => {
    const list: MarkdownReferenceCandidate[] = Array.from(
      { length: 120 },
      (_, i) => ({
        target: { kind: "page", projectId: "p", pageId: String(i) },
        displayPath: `页面${i}`,
      }),
    );
    list.push({
      target: { kind: "project", projectId: "p" },
      displayPath: "项目",
    });
    expect(buildReferenceTree(list, "page")).toHaveLength(120);
  });
  it("shows loading, retry and empty states", () => {
    const onRetry = vi.fn();
    const props = {
      candidates: [],
      anchor: { left: 0, top: 0 },
      onSelect: vi.fn(),
      onClose: vi.fn(),
      onRetry,
    };
    const { rerender } = render(
      <ProjectReferencePicker {...props} status="loading" />,
    );
    expect(screen.getByRole("status").textContent).toContain("正在加载");
    rerender(<ProjectReferencePicker {...props} status="error" />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ProjectReferencePicker {...props} status="ready" />);
    expect(screen.getByRole("status").textContent).toContain("暂无");
  });
});
