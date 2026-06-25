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
  delete process.env.AGENT_SERVICE_URL;
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

  it("恢复页面历史版本并生成新的项目版本", () => {
    const created = service.createProject({ name: "页面恢复项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>current</div>; }",
    });
    const pageId = (page.data as PageDetail).meta.id;
    const committed = service.commitEdit(editId, "当前版本");
    expect(committed.ok).toBe(true);

    const snapshotPath = path.join(tempDir, "snapshots", projectId, "pages", pageId, "pv1");
    fs.mkdirSync(snapshotPath, { recursive: true });
    fs.writeFileSync(
      path.join(snapshotPath, "index.tsx"),
      "export default function Demo(){ return <div>restored</div>; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(snapshotPath, "config.schema.json"),
      JSON.stringify({ type: "object", properties: {} }, null, 2),
      "utf-8",
    );
    const projectPath = path.join(tempDir, "projects", projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    project.pageVersions = {
      [pageId]: [
        {
          versionId: "pv1",
          demoId: pageId,
          demoName: "首页",
          savedAt: Date.now(),
          savedBy: "tester",
          sessionId: "page-test",
          snapshotPath,
          fileCount: 2,
          note: "页面旧版本",
        },
      ],
    };
    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), "utf-8");

    const restored = service.restorePageVersion(projectId, pageId, "pv1", {
      id: "admin",
      name: "Admin",
      role: "admin",
    });
    expect(restored.ok).toBe(true);
    expect(restored.data?.newVersionId).toBe("v2");
    expect(restored.data?.files.code).toContain("restored");

    const workspaceCode = fs.readFileSync(
      path.join(tempDir, "projects", projectId, "workspace", "demos", pageId, "index.tsx"),
      "utf-8",
    );
    expect(workspaceCode).toContain("restored");

    const detail = service.getProject(projectId);
    expect(detail.data?.versions[0]?.versionId).toBe("v2");
    expect(detail.data?.versions).toHaveLength(2);
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

  it("按操作者项目白名单过滤列表并拒绝越权读取", () => {
    const first = service.createProject({ name: "可访问项目" });
    const second = service.createProject({ name: "不可访问项目" });
    const allowedProjectId = first.data?.id ?? "";
    const deniedProjectId = second.data?.id ?? "";
    const actor = {
      id: "svc",
      name: "Service Account",
      role: "creator" as const,
      allowedProjectIds: [allowedProjectId],
    };

    const list = service.listProjects(actor);
    expect(list.data?.map((project) => project.id)).toEqual([allowedProjectId]);

    const allowed = service.getProject(allowedProjectId, actor);
    expect(allowed.ok).toBe(true);

    const denied = service.getProject(deniedProjectId, actor);
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("FORBIDDEN");
  });

  it("通过 agent-service HTTP API 发送 AI 会话消息", async () => {
    const created = service.createProject({ name: "AI 项目" });
    const projectId = created.data?.id ?? "";
    const sessionId = "session_ai_test";
    const sessionDir = path.join(tempDir, "sessions", projectId, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, ".session.json"),
      JSON.stringify(
        {
          sessionId,
          demoId: projectId,
          status: "editing",
          createdAt: Date.now(),
        },
        null,
        2,
      ),
      "utf-8",
    );

    const originalFetch = globalThis.fetch;
    let receivedUrl = "";
    let receivedBody: Record<string, unknown> | undefined;
    process.env.AGENT_SERVICE_URL = "http://agent-service.test";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      receivedUrl = input.toString();
      receivedBody = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            sessionId,
            content: "收到",
            files: [],
            metadata: { ok: true },
          },
        }),
      } as Response;
    }) as typeof fetch;
    try {
      const result = await service.sendAiMessage({ sessionId, content: "请更新首页" });

      expect(result.ok).toBe(true);
      expect(result.data?.content).toBe("收到");
      expect(receivedUrl).toBe(`http://agent-service.test/api/agent/${sessionId}/message`);
      expect(receivedBody).toMatchObject({
        content: "请更新首页",
        demoId: projectId,
        customWorkspace: false,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("支持团队模板分层、官方标记和健康检查报告", () => {
    const created = service.createProject({ name: "模板源项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    service.createPage({ editId, name: "首页" });
    service.commitEdit(editId, "模板页面");

    const template = service.createTemplateFromProject(created.data?.id ?? "", {
      category: "营销活动",
      name: "官方模板",
      description: "用于团队复用",
      scope: "official",
      official: true,
    });
    expect(template.ok).toBe(true);
    expect(template.data?.scope).toBe("official");
    expect(template.data?.official).toBe(true);

    const officialList = service.listTemplates({ scope: "official", official: true });
    expect(officialList.data?.map((item) => item.id)).toEqual([template.data?.id]);

    const updated = service.updateTemplateMeta(template.data?.id ?? "", {
      scope: "team",
      official: false,
    });
    expect(updated.data?.scope).toBe("team");
    expect(updated.data?.official).toBe(false);

    const report = service.checkTemplateHealth(template.data?.id);
    expect(report.ok).toBe(true);
    expect(report.data?.ok).toBe(true);
    expect(report.data?.items[0]?.templateId).toBe(template.data?.id);
    expect(
      fs.existsSync(path.join(tempDir, ".project-admin", "template-health", "latest.json")),
    ).toBe(true);
  });

  it("演练管理员预设模板、批量页面维护、发布和回滚", () => {
    const source = service.createProject({ name: "官方模板源" });
    const sourceEdit = service.beginEdit(source.data?.id ?? "");
    const sourceEditId = (sourceEdit.data as EditTransaction).editId;
    service.createPage({ editId: sourceEditId, name: "首页" });
    service.createPage({ editId: sourceEditId, name: "规则页" });
    service.commitEdit(sourceEditId, "模板基础页面");

    const template = service.createTemplateFromProject(source.data?.id ?? "", {
      category: "活动模板",
      name: "官方活动模板",
      description: "官方模板演练",
      scope: "official",
      official: true,
    });
    expect(template.ok).toBe(true);

    const project = service.instantiateTemplate(template.data?.id ?? "", "从官方模板创建");
    const projectId = project.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const pageList = service.listPages(editId);
    const pages = pageList.data?.pages ?? [];
    expect(pages).toHaveLength(2);

    const extra = service.createPage({ editId, name: "领奖页" });
    const extraPageId = (extra.data as PageDetail).meta.id;
    const reordered = service.reorderPages(
      editId,
      {
        pages: [
          ...pages.map((page, index) => ({ id: page.id, order: index + 1, parentId: page.parentId })),
          { id: extraPageId, order: 0, parentId: null },
        ],
      },
    );
    expect(reordered.ok).toBe(true);

    const firstCommit = service.commitEdit(editId, "批量维护页面");
    expect(firstCommit.ok).toBe(true);
    const published = service.publishProject(projectId);
    expect(published.ok).toBe(true);
    expect(published.data?.publishedVersion).toBe("v1");
    expect(published.data?.artifactSummary?.demoCount).toBe(3);
    expect(published.data?.artifactSummary?.entryPaths).toContain("project-admin-status.json");
    expect(published.data?.accessUrls?.viewerUrl).toBe(`/projects/${projectId}`);
    expect(published.data?.accessUrls?.embedUrls?.map((item) => item.pageId)).toContain(extraPageId);

    const secondEdit = service.beginEdit(projectId);
    const secondEditId = (secondEdit.data as EditTransaction).editId;
    service.createPage({ editId: secondEditId, name: "二次调整页" });
    expect(service.commitEdit(secondEditId, "发布后调整").ok).toBe(true);

    const republished = service.publishProject(projectId);
    expect(republished.data?.publishedVersion).toBe("v2");

    const rolledBack = service.publishRollback(projectId);
    expect(rolledBack.ok).toBe(true);
    expect(rolledBack.data?.publishedVersion).toBe("v1");
  });
});
