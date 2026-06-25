import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectAdminService } from "../service.js";
import type { EditTransaction, PageDetail, PreviewPlan } from "../types.js";

let tempDir: string;
let service: ProjectAdminService;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-core-"));
  service = new ProjectAdminService({ dataDir: tempDir });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ProjectAdminService", () => {
  it("创建项目并读取详情", () => {
    const created = service.createProject({ name: "测试项目" });

    expect(created.ok).toBe(true);
    expect(created.data?.name).toBe("测试项目");

    const detail = service.getProject(created.data?.id ?? "");
    expect(detail.ok).toBe(true);
    expect(detail.data?.project.name).toBe("测试项目");
    expect(detail.data?.pages).toEqual([]);
  });

  it("在编辑事务中创建页面并提交版本", () => {
    const created = service.createProject({ name: "页面项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const page = service.createPage({ editId, name: "首页" });
    expect(page.ok).toBe(true);
    expect((page.data as PageDetail).meta.name).toBe("首页");

    const validation = service.editValidate(editId);
    expect(validation.data?.ok).toBe(true);

    const committed = service.commitEdit(editId, "新增首页");
    expect(committed.ok).toBe(true);
    expect(committed.data?.version.versionId).toBe("v1");

    const detail = service.getProject(created.data?.id ?? "");
    expect(detail.data?.pages).toHaveLength(1);
    expect(detail.data?.versions).toHaveLength(1);
  });

  it("阻止项目级 Schema 与页面 Schema 字段冲突", () => {
    const created = service.createProject({ name: "配置项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({ editId, name: "首页" });
    const pageId = (page.data as PageDetail).meta.id;

    const projectSchema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });
    const setConfig = service.setProjectConfig({ editId, schema: projectSchema });
    expect(setConfig.ok).toBe(false);
    expect(setConfig.error?.code).toBe("VALIDATION_BLOCKED");

    const pageValidation = service.validatePageSchema(editId, pageId);
    expect(pageValidation.ok).toBe(true);
  });

  it("删除项目必须先生成预览计划并携带确认 token", () => {
    const created = service.createProject({ name: "删除项目" });
    const projectId = created.data?.id ?? "";
    const preview = service.deleteProjectPreview(projectId);
    const plan = preview.data as PreviewPlan;

    expect(preview.ok).toBe(true);
    expect(plan.confirmToken).toMatch(/^confirm_/);

    const denied = service.deleteProjectExecute(plan.planId, "wrong-token");
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("CONFIRMATION_REQUIRED");

    const executed = service.deleteProjectExecute(plan.planId, plan.confirmToken);
    expect(executed.ok).toBe(true);
    expect(service.getProject(projectId).ok).toBe(false);
  });

  it("上传、替换并删除事务内图片资产", () => {
    const created = service.createProject({ name: "资产项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({ editId, name: "首页" });
    const pageId = (page.data as PageDetail).meta.id;

    const uploaded = service.uploadAsset({
      editId,
      filename: "hero.png",
      mimeType: "image/png",
      dataBase64: Buffer.from("fake-image").toString("base64"),
    });
    expect(uploaded.ok).toBe(true);
    expect(uploaded.data?.path).toMatch(/^assets\/images\/hero_/);

    const withReference = service.updatePage({
      editId,
      pageId,
      code: `export default function Demo(){ return <img src="${uploaded.data?.path}" /> }`,
    });
    expect(withReference.ok).toBe(true);

    const replaced = service.replaceAsset({
      editId,
      oldPath: uploaded.data?.path ?? "",
      filename: "hero-new.png",
      mimeType: "image/png",
      dataBase64: Buffer.from("new-image").toString("base64"),
    });
    expect(replaced.ok).toBe(true);
    expect(replaced.data?.updatedReferences).toContain(`demos/${pageId}/index.tsx`);

    const preview = service.deleteAssetPreview(editId, replaced.data?.newAsset.path ?? "");
    expect(preview.ok).toBe(true);
    const executed = service.deleteAssetExecute(
      preview.data?.planId ?? "",
      preview.data?.confirmToken ?? "",
    );
    expect(executed.ok).toBe(true);
  });

  it("项目锁会阻止非管理员打开编辑事务", () => {
    const created = service.createProject({ name: "锁定项目" });
    const projectId = created.data?.id ?? "";

    const locked = service.lockProject(projectId, {
      id: "admin",
      name: "Admin",
      role: "admin",
    });
    expect(locked.ok).toBe(true);

    const list = service.listProjects();
    expect(list.data?.find((project) => project.id === projectId)?.locked).toBe(true);

    const denied = service.beginEdit(projectId, {
      id: "creator",
      name: "Creator",
      role: "creator",
    });
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("PROJECT_LOCKED");

    const adminEdit = service.beginEdit(projectId, {
      id: "admin",
      name: "Admin",
      role: "admin",
    });
    expect(adminEdit.ok).toBe(true);
  });
});
