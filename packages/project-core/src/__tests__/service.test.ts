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
    const created = service.createProject({ name: "测试项目", category: "活动" });

    expect(created.ok).toBe(true);
    expect(created.data?.name).toBe("测试项目");
    expect(created.data?.category).toBe("活动");

    const detail = service.getProject(created.data?.id ?? "");
    expect(detail.ok).toBe(true);
    expect(detail.data?.project.name).toBe("测试项目");
    expect(detail.data?.project.category).toBe("活动");
    expect(detail.data?.pages).toEqual([]);
  });

  it("历史项目缺少分类时默认归入未分类", () => {
    const created = service.createProject({ name: "旧项目" });
    const projectId = created.data?.id ?? "";
    const projectPath = path.join(tempDir, "projects", projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    delete project.category;
    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), "utf-8");

    const detail = service.getProject(projectId);
    const list = service.listProjects();

    expect(detail.data?.project.category).toBe("未分类");
    expect(list.data?.find((item) => item.id === projectId)?.category).toBe("未分类");
  });

  it("项目列表忽略缺少 project.json 的残留目录", () => {
    const created = service.createProject({ name: "有效项目" });
    const orphanDir = path.join(tempDir, "projects", "demo_page_only");
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(
      path.join(orphanDir, "images.json"),
      JSON.stringify({ images: [] }),
      "utf-8",
    );

    const list = service.listProjects();

    expect(list.data?.map((project) => project.id)).toEqual([created.data?.id]);
  });

  it("保存并返回项目级手绘编辑引擎偏好", () => {
    const created = service.createProject({ name: "手绘偏好项目" });
    const projectId = created.data?.id ?? "";

    const updated = service.updateProject({
      projectId,
      authoringPreferences: { sketchEditorEngine: "native" },
    });

    expect(updated.ok).toBe(true);
    expect(updated.data?.authoringPreferences?.sketchEditorEngine).toBe("native");
    expect(service.getProject(projectId).data?.project.authoringPreferences).toEqual({
      sketchEditorEngine: "native",
    });
    expect(service.listProjects().data?.find((item) => item.id === projectId))
      .toMatchObject({
        authoringPreferences: { sketchEditorEngine: "native" },
      });
  });

  it("在编辑事务中创建页面并提交版本", () => {
    const created = service.createProject({ name: "页面项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const transaction = edit.data as EditTransaction;
    const workspaceMeta = JSON.parse(
      fs.readFileSync(path.join(transaction.workspacePath, ".workspace.json"), "utf-8"),
    );

    expect(transaction.workspaceScope).toBe("branch");
    expect(workspaceMeta.scope).toBe("branch");
    expect(workspaceMeta.projectId).toBe(created.data?.id);

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

  it("提交分支事务后清空项目 active workspace 指针并剥离工作区元数据", () => {
    const created = service.createProject({ name: "分支提交项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const transaction = edit.data as EditTransaction;
    const editId = transaction.editId;

    const projectPath = path.join(tempDir, "projects", projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    fs.writeFileSync(
      projectPath,
      JSON.stringify(
        {
          ...project,
          activeWorkspaceId: "live-stale",
          activeWorkspaceUpdatedAt: Date.now(),
          canonicalSyncedWorkspaceId: "live-stale",
          canonicalSyncedAt: Date.now(),
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(transaction.workspacePath, ".session.json"),
      JSON.stringify({ sessionId: "session-stale" }),
      "utf-8",
    );

    const page = service.createPage({ editId, name: "首页" });
    expect(page.ok).toBe(true);

    const committed = service.commitEdit(editId, "提交分支事务");
    expect(committed.ok).toBe(true);
    expect(committed.diffSummary?.updated).not.toContain(".workspace.json");

    const updatedProject = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(updatedProject.activeWorkspaceId).toBeUndefined();
    expect(updatedProject.activeWorkspaceUpdatedAt).toBeUndefined();
    expect(updatedProject.canonicalSyncedWorkspaceId).toBeUndefined();
    expect(typeof updatedProject.canonicalSyncedAt).toBe("number");

    const workspacePath = path.join(tempDir, "projects", projectId, "workspace");
    expect(fs.existsSync(path.join(workspacePath, ".workspace.json"))).toBe(false);
    expect(fs.existsSync(path.join(workspacePath, ".session.json"))).toBe(false);
    expect(fs.existsSync(path.join(committed.data!.version.snapshotPath, ".workspace.json"))).toBe(false);
    expect(fs.existsSync(path.join(committed.data!.version.snapshotPath, ".session.json"))).toBe(false);
  });

  it("创建页面资源版本时保留项目 active workspace 指针", () => {
    const created = service.createProject({ name: "共享工作区页面版本项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const transaction = edit.data as EditTransaction;
    const page = service.createPage({ editId: transaction.editId, name: "手机" });
    const pageId = (page.data as PageDetail).meta.id;
    expect(service.commitEdit(transaction.editId, "初始化页面").ok).toBe(true);

    const projectPath = path.join(tempDir, "projects", projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    fs.writeFileSync(
      projectPath,
      JSON.stringify(
        {
          ...project,
          activeWorkspaceId: "live-current",
          activeWorkspaceUpdatedAt: 1234,
          canonicalSyncedWorkspaceId: "live-current",
          canonicalSyncedAt: 1235,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const version = service.resourceVersionCreate({
      projectId,
      kind: "page",
      resourceId: pageId,
      note: "停止编辑后自动记录手机",
    });

    expect(version.ok).toBe(true);
    const updatedProject = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(updatedProject.activeWorkspaceId).toBe("live-current");
    expect(updatedProject.activeWorkspaceUpdatedAt).toBe(1234);
    expect(updatedProject.canonicalSyncedWorkspaceId).toBe("live-current");
    expect(updatedProject.canonicalSyncedAt).toBe(1235);
  });

  it("阻止本事务新增或修改的不合规运行时页面", () => {
    const created = service.createProject({ name: "运行时契约项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const page = service.createPage({
      editId,
      name: "首页",
      code: "import { jsx } from 'react/jsx-runtime';\nexport default function Demo(){ return jsx('div', {}); }",
    });
    expect(page.ok).toBe(true);
    expect(page.runtimeValidation?.ok).toBe(false);
    const pageId = (page.data as PageDetail).meta.id;

    const pageValidation = service.validatePageRuntime(editId, pageId);
    expect(pageValidation.data?.ok).toBe(false);
    expect(pageValidation.data?.issues[0]).toMatchObject({
      pageId,
      severity: "error",
      stage: "source_contract",
      code: "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED",
    });

    const validation = service.editValidate(editId);
    expect(validation.data?.ok).toBe(false);
    expect(validation.data?.issues).toContainEqual(expect.objectContaining({
      pageId,
      severity: "blocking",
      code: "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED",
    }));
    expect(service.commitEdit(editId, "不合规页面").ok).toBe(false);
  });

  it("识别重复拼接导致的模块解析失败并保留落盘内容", () => {
    const created = service.createProject({ name: "模块预检项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const duplicatedCode = [
      "const accentMap = { primary: 'red' };",
      "export default function Demo(){ return <div />; }",
      "const accentMap = { primary: 'blue' };",
    ].join("\n");

    const page = service.createPage({
      editId,
      name: "重复页",
      code: duplicatedCode,
    });
    expect(page.ok).toBe(true);
    expect(page.runtimeValidation).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          stage: "module_parse",
          code: "DUPLICATE_TOP_LEVEL_DECLARATION",
        }),
      ],
    });

    const pageId = (page.data as PageDetail).meta.id;
    const saved = service.getPage(editId, pageId);
    expect(saved.data?.files.code).toBe(duplicatedCode);
    expect(service.commitEdit(editId, "重复拼接页").ok).toBe(false);
  });

  it("允许多个页面各自使用 page 作为普通顶层变量", () => {
    const created = service.createProject({ name: "多页面预览项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const first = service.createPage({
      editId,
      name: "首页",
      code: "const page = { title: '首页' };\nexport default function Demo(){ return <div>{page.title}</div>; }",
    });
    const second = service.createPage({
      editId,
      name: "详情",
      code: "const page = { title: '详情' };\nexport default function Demo(){ return <section>{page.title}</section>; }",
    });

    expect(first.runtimeValidation?.ok).toBe(true);
    expect(second.runtimeValidation?.ok).toBe(true);

    const validation = service.editValidate(editId);
    expect(validation.data?.ok).toBe(true);
    expect(validation.data?.issues).not.toContainEqual(expect.objectContaining({
      code: "DUPLICATE_TOP_LEVEL_DECLARATION",
    }));
  });

  it("创建并校验 HTML/CSS 原型页", () => {
    const created = service.createProject({ name: "原型页项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const page = service.createPage({
      editId,
      name: "原型首页",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main><h1>原型首页</h1><button>开始</button></main>",
      prototypeCss: "main { padding: 24px; }",
      prototypeMeta: { width: 390, height: 844 },
    });
    const pageId = (page.data as PageDetail).meta.id;

    expect(page.ok).toBe(true);
    expect(page.data?.meta.runtimeType).toBe("prototype-html-css");
    expect(page.data?.files.prototypeHtml).toContain("原型首页");
    expect(page.runtimeValidation?.ok).toBe(true);
    expect(page.runtimeValidation?.prototypeGate).toMatchObject({
      decision: "accept_prototype",
      reasonCodes: [],
    });
    const workspacePath = (edit.data as EditTransaction).workspacePath;
    expect(fs.existsSync(path.join(workspacePath, "demos", pageId, "prototype.html"))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, "demos", pageId, "index.tsx"))).toBe(false);
    expect(service.editValidate(editId).data?.ok).toBe(true);
  });

  it("阻止包含脚本的 HTML/CSS 原型页", () => {
    const created = service.createProject({ name: "危险原型页项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const page = service.createPage({
      editId,
      name: "危险页",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main onclick=\"alert(1)\"><script>alert(1)</script></main>",
      prototypeCss: "a { background: url('javascript:alert(1)'); }",
    });

    expect(page.runtimeValidation?.ok).toBe(false);
    expect(page.runtimeValidation?.prototypeGate).toMatchObject({
      decision: "upgrade_to_high_fidelity",
      reasonCodes: expect.arrayContaining([
        "PROTOTYPE_SCRIPT_FORBIDDEN",
        "PROTOTYPE_INLINE_EVENT_FORBIDDEN",
        "PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN",
      ]),
    });
    expect(page.runtimeValidation?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PROTOTYPE_SCRIPT_FORBIDDEN" }),
        expect.objectContaining({ code: "PROTOTYPE_INLINE_EVENT_FORBIDDEN" }),
        expect.objectContaining({ code: "PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN" }),
      ]),
    );
    expect(service.editValidate(editId).data?.ok).toBe(false);
  });

  it("原型页闸门区分可修复问题和高保真升级红线", () => {
    const created = service.createProject({ name: "原型页闸门项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;

    const repairable = service.createPage({
      editId,
      name: "可修复页",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main><h1>可修复</h1></main>",
      prototypeCss: "@import url('https://example.com/base.css'); body { margin: 0; }",
    });
    expect(repairable.runtimeValidation?.ok).toBe(false);
    expect(repairable.runtimeValidation?.prototypeGate).toMatchObject({
      decision: "repair_prototype",
      reasonCodes: expect.arrayContaining([
        "PROTOTYPE_CSS_IMPORT_FORBIDDEN",
        "PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN",
      ]),
    });

    const upgrade = service.createPage({
      editId,
      name: "升级页",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main><iframe src=\"https://example.com\"></iframe></main>",
      prototypeCss: ".toolbar { position: fixed; inset: 0; }",
    });
    expect(upgrade.runtimeValidation?.ok).toBe(false);
    expect(upgrade.runtimeValidation?.prototypeGate).toMatchObject({
      decision: "upgrade_to_high_fidelity",
      reasonCodes: expect.arrayContaining([
        "PROTOTYPE_EMBED_FORBIDDEN",
        "PROTOTYPE_FIXED_POSITION_REQUIRES_ISOLATION",
      ]),
    });
  });

  it("支持在保留旧文件的前提下切换页面运行时类型", () => {
    const created = service.createProject({ name: "运行时切换项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "切换页",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main><h1>原型切换页</h1></main>",
      prototypeCss: "main { padding: 24px; }",
    });
    const pageId = (page.data as PageDetail).meta.id;
    const workspacePath = (edit.data as EditTransaction).workspacePath;

    const switched = service.switchPageRuntime({
      editId,
      pageId,
      targetRuntimeType: "high-fidelity-react",
      code: "export default function Demo(){ return <main>高保真页</main>; }",
      reason: "用户手动设为高保真页",
    });

    expect(switched.ok).toBe(true);
    expect(switched.data?.meta.runtimeType).toBeUndefined();
    expect(switched.runtimeValidation?.ok).toBe(true);
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "index.tsx"), "utf-8")).toContain("高保真页");
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "prototype.html"), "utf-8")).toContain("原型切换页");

    const reverted = service.switchPageRuntime({
      editId,
      pageId,
      targetRuntimeType: "prototype-html-css",
      prototypeHtml: "<main><h1>恢复原型页</h1></main>",
      prototypeCss: "main { padding: 16px; }",
    });

    expect(reverted.ok).toBe(true);
    expect(reverted.data?.meta.runtimeType).toBe("prototype-html-css");
    expect(reverted.runtimeValidation?.prototypeGate?.decision).toBe("accept_prototype");
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "prototype.html"), "utf-8")).toContain("恢复原型页");
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "index.tsx"), "utf-8")).toContain("高保真页");
  });

  it("运行时切换校验失败时保留原页面类型和内容", () => {
    const created = service.createProject({ name: "切换失败保留项目" });
    const edit = service.beginEdit(created.data?.id ?? "");
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "高保真页",
      code: "export default function Demo(){ return <main>保持高保真</main>; }",
    });
    const pageId = (page.data as PageDetail).meta.id;
    const workspacePath = (edit.data as EditTransaction).workspacePath;

    const failed = service.switchPageRuntime({
      editId,
      pageId,
      targetRuntimeType: "prototype-html-css",
      prototypeHtml: "<main onclick=\"alert(1)\">危险原型</main>",
      prototypeCss: "main { padding: 24px; }",
    });

    expect(failed.ok).toBe(false);
    expect(failed.error?.code).toBe("VALIDATION_BLOCKED");
    expect(service.getPage(editId, pageId).data?.meta.runtimeType).toBeUndefined();
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "index.tsx"), "utf-8")).toContain("保持高保真");
    expect(fs.existsSync(path.join(workspacePath, "demos", pageId, "prototype.html"))).toBe(false);
  });

  it("旧项目未改页面的运行时契约问题只作为 warning", () => {
    const created = service.createProject({ name: "旧页面兼容项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>ok</div>; }",
    });
    const pageId = (page.data as PageDetail).meta.id;
    expect(service.commitEdit(editId, "初始页面").ok).toBe(true);

    fs.writeFileSync(
      path.join(tempDir, "projects", projectId, "workspace", "demos", pageId, "index.tsx"),
      "export default function Demo(){ return null; }\n",
      "utf-8",
    );
    const followupEdit = service.beginEdit(projectId);
    const followupEditId = (followupEdit.data as EditTransaction).editId;
    const configUpdate = service.setProjectConfig({
      editId: followupEditId,
      schema: JSON.stringify({ type: "object", properties: {}, required: [] }),
    });
    expect(configUpdate.ok).toBe(true);

    const validation = service.editValidate(followupEditId);
    expect(validation.data?.ok).toBe(true);
    expect(validation.data?.issues).toContainEqual(expect.objectContaining({
      pageId,
      severity: "warning",
      code: "EMPTY_RENDER_RISK",
    }));
    expect(service.commitEdit(followupEditId, "无关配置改动").ok).toBe(true);
  });

  it("恢复页面资源版本并生成新的项目版本", () => {
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

    const pageVersion = service.createPageVersion({ projectId, pageId, note: "页面资源版本" });
    expect(pageVersion.ok).toBe(true);
    const followupEdit = service.beginEdit(projectId);
    const followupEditId = (followupEdit.data as EditTransaction).editId;
    expect(service.updatePage({
      editId: followupEditId,
      pageId,
      code: "export default function Demo(){ return <div>changed</div>; }",
    }).ok).toBe(true);
    expect(service.commitEdit(followupEditId, "修改当前页面").ok).toBe(true);

    const restored = service.restorePageVersion(projectId, pageId, pageVersion.data?.versionId ?? "", {
      id: "admin",
      name: "Admin",
      role: "admin",
    });
    expect(restored.ok).toBe(true);
    expect(restored.data?.newVersionId).toBe("v3");
    expect(restored.data?.files.code).toContain("current");

    const workspaceCode = fs.readFileSync(
      path.join(tempDir, "projects", projectId, "workspace", "demos", pageId, "index.tsx"),
      "utf-8",
    );
    expect(workspaceCode).toContain("current");

    const detail = service.getProject(projectId);
    expect(detail.data?.versions[0]?.versionId).toBe("v3");
    expect(detail.data?.versions).toHaveLength(3);
  });

  it("创建并读取页面资源历史版本，项目版本号独立递增", () => {
    const created = service.createProject({ name: "页面版本项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>page-version</div>; }",
    });
    const pageId = (page.data as PageDetail).meta.id;

    const committed = service.commitEdit(editId, "初始版本");
    expect(committed.ok).toBe(true);
    expect(committed.data?.version.versionId).toBe("v1");

    const pageVersion = service.createPageVersion({
      projectId,
      pageId,
      note: "命名页面版本",
    });
    expect(pageVersion.ok).toBe(true);
    expect(pageVersion.data?.versionId).toMatch(/^prv_/);

    const listed = service.pageVersionList(projectId, pageId);
    expect(listed.ok).toBe(true);
    expect(listed.data?.totalVersions).toBe(1);
    expect(listed.data?.versions[0]?.versionId).toBe(pageVersion.data?.versionId);

    const loaded = service.pageVersionGet(projectId, pageId, pageVersion.data?.versionId ?? "");
    expect(loaded.ok).toBe(true);
    expect(loaded.data?.version.note).toBe("命名页面版本");
    expect(loaded.data?.files.code).toContain("page-version");

    const followupEdit = service.beginEdit(projectId);
    const followupEditId = (followupEdit.data as EditTransaction).editId;
    const updated = service.updatePage({
      editId: followupEditId,
      pageId,
      code: "export default function Demo(){ return <div>page-version-updated</div>; }",
    });
    expect(updated.ok).toBe(true);
    const recommitted = service.commitEdit(followupEditId, "再次提交");
    expect(recommitted.ok).toBe(true);
    expect(recommitted.data?.version.versionId).toBe("v2");
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

  it("删除项目时同步清理已发布产物和发布索引", () => {
    const keep = service.createProject({ name: "保留项目" });
    const deleted = service.createProject({ name: "已发布后删除项目" });
    const keepId = keep.data?.id ?? "";
    const projectId = deleted.data?.id ?? "";
    const publishedRoot = path.join(tempDir, "published");
    const keepPublishedDir = path.join(publishedRoot, keepId);
    const deletePublishedDir = path.join(publishedRoot, projectId);

    fs.mkdirSync(keepPublishedDir, { recursive: true });
    fs.mkdirSync(deletePublishedDir, { recursive: true });
    fs.writeFileSync(
      path.join(keepPublishedDir, "project.json"),
      JSON.stringify({
        id: keepId,
        name: "保留项目",
        publishedAt: 20,
        publishedVersion: "v1",
        demoPages: [{ id: "home" }],
      }),
    );
    fs.writeFileSync(
      path.join(deletePublishedDir, "project.json"),
      JSON.stringify({
        id: projectId,
        name: "已发布后删除项目",
        publishedAt: 30,
        publishedVersion: "v1",
        demoPages: [{ id: "home" }],
      }),
    );
    fs.writeFileSync(
      path.join(publishedRoot, "projects-index.json"),
      JSON.stringify({
        projects: [
          { id: keepId, name: "保留项目", publishedAt: 20, publishedVersion: "v1", demoCount: 1 },
          { id: projectId, name: "已发布后删除项目", publishedAt: 30, publishedVersion: "v1", demoCount: 1 },
        ],
        generatedAt: 1,
      }),
    );

    const preview = service.deleteProjectPreview(projectId);
    const plan = preview.data as PreviewPlan;
    const executed = service.deleteProjectExecute(plan.planId, plan.confirmToken);

    expect(executed.ok).toBe(true);
    expect(executed.diffSummary?.deleted).toContain(`published:${projectId}`);
    expect(fs.existsSync(deletePublishedDir)).toBe(false);
    expect(fs.existsSync(keepPublishedDir)).toBe(true);

    const index = JSON.parse(
      fs.readFileSync(path.join(publishedRoot, "projects-index.json"), "utf-8"),
    ) as { projects: Array<{ id: string }> };
    expect(index.projects.map((project) => project.id)).toEqual([keepId]);
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
    expect(uploaded.data?.path).toMatch(/^assets\/images\/[a-f0-9]{12}-hero\.png$/);
    expect(uploaded.data?.assetId).toMatch(/^asset_[a-f0-9]{12}$/);
    expect(uploaded.data?.contentHash).toHaveLength(64);

    const imageManifestPath = path.join(tempDir, "projects", created.data?.id ?? "", "images.json");
    const imageManifest = JSON.parse(fs.readFileSync(imageManifestPath, "utf-8")) as {
      images: Array<{ url: string; contentHash?: string; sourceType?: string }>;
    };
    expect(imageManifest.images[0]?.url).toBe(uploaded.data?.path);
    expect(imageManifest.images[0]?.contentHash).toBe(uploaded.data?.contentHash);
    expect(imageManifest.images[0]?.sourceType).toBe("upload");

    const withReference = service.updatePage({
      editId,
      pageId,
      code: `export default function Demo(){ return <img src="${uploaded.data?.path}" /> }`,
    });
    expect(withReference.ok).toBe(true);

    const listed = service.listAssets(editId);
    expect(listed.data?.assets.find((asset) => asset.path === uploaded.data?.path)?.references).toContain(`demos/${pageId}/index.tsx`);

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
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          "knowledge",
          "templates",
          template.data?.id ?? "",
          "reading-map.json",
        ),
      ),
    ).toBe(true);

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

  it("复制项目时可指定新项目分类", () => {
    const source = service.createProject({ name: "复制源", category: "活动" });
    const duplicated = service.duplicateProject(
      source.data?.id ?? "",
      "复制结果",
      "复用项目",
    );

    expect(duplicated.ok).toBe(true);
    expect(duplicated.data?.name).toBe("复制结果");
    expect(duplicated.data?.category).toBe("复用项目");

    const detail = service.getProject(duplicated.data?.id ?? "");
    expect(detail.data?.project.category).toBe("复用项目");
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

    const project = service.instantiateTemplate(
      template.data?.id ?? "",
      "从官方模板创建",
      "模板生成",
    );
    const projectId = project.data?.id ?? "";
    expect(project.data?.category).toBe("模板生成");
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
    expect(published.data?.publishedVersion).toBe("v2");
    expect(published.data?.artifactSummary?.demoCount).toBe(3);
    expect(published.data?.artifactSummary?.entryPaths).toContain("project-admin-status.json");
    expect(published.data?.accessUrls?.viewerUrl).toBe(`/projects/${projectId}`);
    expect(published.data?.accessUrls?.embedUrls?.map((item) => item.pageId)).toContain(extraPageId);

    const secondEdit = service.beginEdit(projectId);
    const secondEditId = (secondEdit.data as EditTransaction).editId;
    service.createPage({ editId: secondEditId, name: "二次调整页" });
    expect(service.commitEdit(secondEditId, "发布后调整").ok).toBe(true);

    const republished = service.publishProject(projectId);
    expect(republished.data?.publishedVersion).toBe("v4");

    const rolledBack = service.publishRollback(projectId);
    expect(rolledBack.ok).toBe(true);
    expect(rolledBack.data?.publishedVersion).toBe("v3");
  });

  it("支持将模板快照转为普通项目并移除模板", () => {
    const source = service.createProject({ name: "模板源项目", category: "活动" });
    const projectId = source.data?.id ?? "";
    const projectWorkspacePath = path.join(tempDir, "projects", projectId, "workspace");
    const treePath = path.join(projectWorkspacePath, "workspace-tree.json");
    fs.writeFileSync(
      treePath,
      JSON.stringify(
        {
          pages: [{ id: "page-home", name: "首页", order: 0, parentId: null }],
          folders: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    const pageDir = path.join(projectWorkspacePath, "demos", "page-home");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(
      path.join(pageDir, "index.tsx"),
      "export default function Demo(){ return <div>home</div>; }",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pageDir, "config.schema.json"),
      JSON.stringify({ type: "object", properties: {} }, null, 2),
      "utf-8",
    );

    const template = service.createTemplateFromProject(projectId, {
      category: "营销模板",
      name: "可转换模板",
      description: "用于转换为普通项目",
    });

    const converted = service.convertTemplateToProject(template.data?.id ?? "");

    expect(converted.ok).toBe(true);
    expect(converted.data?.name).toBe("可转换模板");
    expect(converted.data?.category).toBe("营销模板");
    expect(service.getTemplate(template.data?.id ?? "").ok).toBe(false);

    const detail = service.getProject(converted.data?.id ?? "");
    expect(detail.data?.pages.map((page) => page.name)).toEqual(["首页"]);
  });
});
