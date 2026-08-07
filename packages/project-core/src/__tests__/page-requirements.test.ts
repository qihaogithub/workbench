import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectAdminService } from "../service.js";
import type { EditTransaction, PageDetail } from "../types.js";

let tempDir: string;
let service: ProjectAdminService;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-core-req-"));
  service = new ProjectAdminService({ dataDir: tempDir });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function setupPage(): { editId: string; pageId: string } {
  const created = service.createProject({ name: "页面配置要求测试" });
  const projectId = created.data?.id ?? "";
  const edit = service.beginEdit(projectId);
  const transaction = edit.data as EditTransaction;
  const page = service.createPage({
    editId: transaction.editId,
    name: "首页",
  });
  const pageId = (page.data as PageDetail).meta.id;
  return { editId: transaction.editId, pageId };
}

describe("页面配置要求读写", () => {
  it("无配置要求时返回空字符串", () => {
    const { editId, pageId } = setupPage();
    const result = service.getPageRequirements(editId, pageId);
    expect(result.ok).toBe(true);
    expect(result.data?.requirements).toBe("");
  });

  it("写入并读取配置要求", () => {
    const { editId, pageId } = setupPage();
    const content = "# 交互要求\n\n@[标题](title) 需突出显示。";
    const written = service.updatePageRequirements(editId, pageId, content);
    expect(written.ok).toBe(true);
    expect(written.data?.requirements).toBe(content);

    const read = service.getPageRequirements(editId, pageId);
    expect(read.ok).toBe(true);
    expect(read.data?.requirements).toBe(content);

    const files = service.getPage(editId, pageId).data as PageDetail;
    expect(files.files.requirements).toBe(content);
  });

  it("清空配置要求", () => {
    const { editId, pageId } = setupPage();
    service.updatePageRequirements(editId, pageId, "# 标题");
    const cleared = service.updatePageRequirements(editId, pageId, "");
    expect(cleared.ok).toBe(true);
    const read = service.getPageRequirements(editId, pageId);
    expect(read.data?.requirements).toBe("");
  });

  it("超出长度限制时拒绝写入", () => {
    const { editId, pageId } = setupPage();
    const result = service.updatePageRequirements(editId, pageId, "x".repeat(20001));
    expect(result.ok).toBe(false);
  });

  it("页面不存在时返回错误", () => {
    const { editId } = setupPage();
    const result = service.getPageRequirements(editId, "missing-page");
    expect(result.ok).toBe(false);
  });

  it("列出各页面配置要求中的引用（反向视图数据源）", () => {
    const { editId, pageId } = setupPage();
    service.updatePageRequirements(
      editId,
      pageId,
      "@[标题](title) @[按钮](cta)",
    );
    const list = service.listPageRequirements(editId);
    expect(list.ok).toBe(true);
    const entry = list.data?.find((p) => p.pageId === pageId);
    expect(entry?.refs).toEqual([
      { name: "标题", key: "title" },
      { name: "按钮", key: "cta" },
    ]);
  });

  it("配置要求随页面版本快照捕获", () => {
    const { editId, pageId } = setupPage();
    const content = "# 版本快照要求\n\n@[按钮](cta) 需可点击。";
    service.updatePageRequirements(editId, pageId, content);
    expect(service.commitEdit(editId, "记录要求").ok).toBe(true);

    const created = service.createProject({ name: "页面配置要求版本项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const transaction = edit.data as EditTransaction;
    const page = service.createPage({
      editId: transaction.editId,
      name: "首页",
    });
    const pageId2 = (page.data as PageDetail).meta.id;
    service.updatePageRequirements(transaction.editId, pageId2, content);
    expect(service.commitEdit(transaction.editId, "初始化").ok).toBe(true);

    const version = service.resourceVersionCreate({
      projectId,
      kind: "page",
      resourceId: pageId2,
      note: "记录要求版本",
    });
    expect(version.ok).toBe(true);

    const versionId = version.data?.id;
    expect(typeof versionId).toBe("string");
    const detail = service.resourceVersionGet({
      projectId,
      kind: "page",
      resourceId: pageId2,
      versionId: versionId ?? "",
    });
    expect(detail.ok).toBe(true);
  });
});