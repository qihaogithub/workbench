#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCodexInstallPrompt,
  createMcpClientConfigSnippet,
  ProjectAdminService,
} from "@opencode-workbench/project-core";

import {
  arrayArg,
  booleanArg,
  MinimalMcpServer,
  objectSchema,
  recordArg,
  stringArg,
} from "./protocol.js";

const service = new ProjectAdminService();
const actor = service.defaultActor();

export const server = new MinimalMcpServer({
  name: "opencode-project-admin",
  version: "0.1.0",
  instructions:
    "Use Project Admin MCP for opencode-workbench project administration. Start with admin_capabilities, project_list, then edit_begin before writing pages/config/folders.",
});

const stringSchema = { type: "string" };
const optionalStringSchema = { type: "string" };
const booleanSchema = { type: "boolean" };
const stringArraySchema = { type: "array", items: { type: "string" } };

function tool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  call: (args: Record<string, unknown>) => unknown,
): void {
  server.tool({ name, description, inputSchema, call });
}

tool("admin_capabilities", "查看当前用户可用工具和权限", objectSchema({}), () =>
  service.capabilities(actor),
);

tool("project_list", "列出项目，支持客户端自行过滤", objectSchema({}), () =>
  service.listProjects(),
);

tool(
  "project_get",
  "获取项目详情、页面树、配置摘要、版本摘要",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.getProject(stringArg(args, "projectId")),
);

tool(
  "project_create",
  "创建空白项目或从模板创建",
  objectSchema(
    {
      name: stringSchema,
      templateId: optionalStringSchema,
      description: optionalStringSchema,
      dryRun: booleanSchema,
    },
    ["name"],
  ),
  (args) =>
    service.createProject(
      {
        name: stringArg(args, "name"),
        templateId: stringArg(args, "templateId") || undefined,
        description: stringArg(args, "description") || undefined,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "project_rename",
  "修改项目名称",
  objectSchema({ projectId: stringSchema, name: stringSchema, dryRun: booleanSchema }, [
    "projectId",
    "name",
  ]),
  (args) =>
    service.updateProject(
      {
        projectId: stringArg(args, "projectId"),
        name: stringArg(args, "name"),
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "project_duplicate",
  "复制项目为独立项目",
  objectSchema({ projectId: stringSchema, name: optionalStringSchema }, ["projectId"]),
  (args) =>
    service.duplicateProject(
      stringArg(args, "projectId"),
      stringArg(args, "name") || undefined,
      actor,
    ),
);

tool(
  "project_delete_preview",
  "预览删除项目影响",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.deleteProjectPreview(stringArg(args, "projectId")),
);

tool(
  "project_delete_execute",
  "执行项目删除预览计划",
  objectSchema({ planId: stringSchema, confirmToken: stringSchema }, [
    "planId",
    "confirmToken",
  ]),
  (args) =>
    service.deleteProjectExecute(
      stringArg(args, "planId"),
      stringArg(args, "confirmToken"),
      actor,
    ),
);

tool(
  "project_set_cover",
  "设置项目封面路径",
  objectSchema({ projectId: stringSchema, thumbnail: stringSchema }, ["projectId", "thumbnail"]),
  (args) =>
    service.setProjectCover(stringArg(args, "projectId"), stringArg(args, "thumbnail"), actor),
);

tool(
  "project_delete_cover",
  "删除项目封面",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.setProjectCover(stringArg(args, "projectId"), undefined, actor),
);

tool("template_list", "列出模板，按更新时间排序", objectSchema({}), () =>
  service.listTemplates(),
);

tool(
  "template_get",
  "获取模板详情和页面摘要",
  objectSchema({ templateId: stringSchema }, ["templateId"]),
  (args) => service.getTemplate(stringArg(args, "templateId")),
);

tool(
  "template_create_from_project",
  "将项目保存为模板快照",
  objectSchema(
    {
      projectId: stringSchema,
      category: stringSchema,
      name: stringSchema,
      description: stringSchema,
      thumbnail: optionalStringSchema,
    },
    ["projectId", "category", "name", "description"],
  ),
  (args) =>
    service.createTemplateFromProject(
      stringArg(args, "projectId"),
      {
        category: stringArg(args, "category"),
        name: stringArg(args, "name"),
        description: stringArg(args, "description"),
        thumbnail: stringArg(args, "thumbnail") || undefined,
      },
      actor,
    ),
);

tool(
  "template_update_meta",
  "修改模板分类、名称、简介、封面",
  objectSchema(
    {
      templateId: stringSchema,
      category: optionalStringSchema,
      name: optionalStringSchema,
      description: optionalStringSchema,
      thumbnail: optionalStringSchema,
    },
    ["templateId"],
  ),
  (args) =>
    service.updateTemplateMeta(
      stringArg(args, "templateId"),
      {
        category: stringArg(args, "category") || undefined,
        name: stringArg(args, "name") || undefined,
        description: stringArg(args, "description") || undefined,
        thumbnail: stringArg(args, "thumbnail") || undefined,
      },
      actor,
    ),
);

tool(
  "template_delete_preview",
  "预览模板删除影响",
  objectSchema({ templateId: stringSchema }, ["templateId"]),
  (args) => service.deleteTemplatePreview(stringArg(args, "templateId")),
);

tool(
  "template_delete_execute",
  "删除模板",
  objectSchema({ planId: stringSchema, confirmToken: stringSchema }, [
    "planId",
    "confirmToken",
  ]),
  (args) =>
    service.deleteTemplateExecute(
      stringArg(args, "planId"),
      stringArg(args, "confirmToken"),
      actor,
    ),
);

tool(
  "template_recommend",
  "基于用户描述推荐模板",
  objectSchema({ description: stringSchema }, ["description"]),
  (args) => service.recommendTemplate(stringArg(args, "description")),
);

tool(
  "template_instantiate",
  "从模板创建项目",
  objectSchema({ templateId: stringSchema, name: stringSchema }, ["templateId", "name"]),
  (args) =>
    service.instantiateTemplate(
      stringArg(args, "templateId"),
      stringArg(args, "name"),
      actor,
    ),
);

tool(
  "edit_begin",
  "打开项目编辑事务",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.beginEdit(stringArg(args, "projectId"), actor),
);

tool(
  "edit_status",
  "查看事务状态、变更文件、过期时间",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.editStatus(stringArg(args, "editId")),
);

tool(
  "edit_diff",
  "查看当前事务相对基准的差异摘要",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.editDiff(stringArg(args, "editId")),
);

tool(
  "edit_validate",
  "校验页面、Schema、配置冲突和可编译性",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.editValidate(stringArg(args, "editId")),
);

tool(
  "edit_commit",
  "保存事务，生成版本记录",
  objectSchema({ editId: stringSchema, note: optionalStringSchema }, ["editId"]),
  (args) =>
    service.commitEdit(stringArg(args, "editId"), stringArg(args, "note") || undefined, actor),
);

tool(
  "edit_discard",
  "丢弃事务",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.discardEdit(stringArg(args, "editId"), actor),
);

tool(
  "edit_extend",
  "延长事务有效期",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.extendEdit(stringArg(args, "editId")),
);

tool(
  "page_list",
  "列出页面和文件夹树",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.listPages(stringArg(args, "editId")),
);

tool(
  "page_get",
  "获取单页代码、Schema、元信息",
  objectSchema({ editId: stringSchema, pageId: stringSchema }, ["editId", "pageId"]),
  (args) => service.getPage(stringArg(args, "editId"), stringArg(args, "pageId")),
);

tool(
  "page_create",
  "新建页面",
  objectSchema(
    {
      editId: stringSchema,
      name: stringSchema,
      parentId: optionalStringSchema,
      code: optionalStringSchema,
      schema: optionalStringSchema,
      dryRun: booleanSchema,
    },
    ["editId", "name"],
  ),
  (args) =>
    service.createPage(
      {
        editId: stringArg(args, "editId"),
        name: stringArg(args, "name"),
        parentId: stringArg(args, "parentId") || null,
        code: stringArg(args, "code") || undefined,
        schema: stringArg(args, "schema") || undefined,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "page_duplicate",
  "复制页面",
  objectSchema({ editId: stringSchema, pageId: stringSchema, name: optionalStringSchema }, [
    "editId",
    "pageId",
  ]),
  (args) =>
    service.duplicatePage(
      stringArg(args, "editId"),
      stringArg(args, "pageId"),
      stringArg(args, "name") || undefined,
    ),
);

function pageUpdateCall(args: Record<string, unknown>, mode: "code" | "schema" | "meta") {
  return service.updatePage(
    {
      editId: stringArg(args, "editId"),
      pageId: stringArg(args, "pageId"),
      code: mode === "code" ? stringArg(args, "code") : undefined,
      schema: mode === "schema" ? stringArg(args, "schema") : undefined,
      name: mode === "meta" ? stringArg(args, "name") || undefined : undefined,
      parentId: mode === "meta" && "parentId" in args ? stringArg(args, "parentId") || null : undefined,
      order: mode === "meta" && typeof args.order === "number" ? args.order : undefined,
      dryRun: booleanArg(args, "dryRun"),
    },
    actor,
  );
}

tool(
  "page_update_code",
  "更新页面代码",
  objectSchema({ editId: stringSchema, pageId: stringSchema, code: stringSchema, dryRun: booleanSchema }, [
    "editId",
    "pageId",
    "code",
  ]),
  (args) => pageUpdateCall(args, "code"),
);

tool(
  "page_update_schema",
  "更新页面 Schema",
  objectSchema({ editId: stringSchema, pageId: stringSchema, schema: stringSchema, dryRun: booleanSchema }, [
    "editId",
    "pageId",
    "schema",
  ]),
  (args) => pageUpdateCall(args, "schema"),
);

tool(
  "page_update_meta",
  "修改页面名称、父文件夹、排序",
  objectSchema(
    {
      editId: stringSchema,
      pageId: stringSchema,
      name: optionalStringSchema,
      parentId: optionalStringSchema,
      order: { type: "number" },
      dryRun: booleanSchema,
    },
    ["editId", "pageId"],
  ),
  (args) => pageUpdateCall(args, "meta"),
);

tool(
  "page_delete_preview",
  "预览单页或批量删除影响",
  objectSchema({ editId: stringSchema, pageIds: stringArraySchema }, ["editId", "pageIds"]),
  (args) =>
    service.deletePagePreview(
      stringArg(args, "editId"),
      arrayArg(args, "pageIds").filter((item): item is string => typeof item === "string"),
    ),
);

tool(
  "page_delete_execute",
  "执行页面删除计划",
  objectSchema({ planId: stringSchema, confirmToken: stringSchema }, [
    "planId",
    "confirmToken",
  ]),
  (args) =>
    service.deletePageExecute(
      stringArg(args, "planId"),
      stringArg(args, "confirmToken"),
      actor,
    ),
);

tool(
  "page_reorder",
  "页面和文件夹混合排序",
  objectSchema({ editId: stringSchema, pages: { type: "array" }, folders: { type: "array" } }, [
    "editId",
    "pages",
  ]),
  (args) =>
    service.reorderPages(
      stringArg(args, "editId"),
      {
        pages: arrayArg(args, "pages")
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
          .map((item) => ({
            id: stringArg(item, "id"),
            order: typeof item.order === "number" ? item.order : 0,
            parentId: stringArg(item, "parentId") || null,
          })),
        folders: arrayArg(args, "folders")
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
          .map((item) => ({
            id: stringArg(item, "id"),
            order: typeof item.order === "number" ? item.order : 0,
            parentId: stringArg(item, "parentId") || null,
          })),
      },
      actor,
    ),
);

tool(
  "page_restore_version",
  "恢复页面历史版本",
  objectSchema({ projectId: stringSchema, pageId: stringSchema, versionId: stringSchema }, [
    "projectId",
    "pageId",
    "versionId",
  ]),
  () => ({
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "页面版本恢复仍使用 Web API；MCP 已通过 edit_commit 生成项目级版本",
      recoverable: true,
    },
  }),
);

tool(
  "folder_create",
  "创建虚拟文件夹",
  objectSchema({ editId: stringSchema, name: stringSchema, parentId: optionalStringSchema }, [
    "editId",
    "name",
  ]),
  (args) =>
    service.createFolder(
      stringArg(args, "editId"),
      stringArg(args, "name"),
      stringArg(args, "parentId") || null,
      actor,
    ),
);

tool(
  "folder_update",
  "重命名、移动、调整排序",
  objectSchema(
    {
      editId: stringSchema,
      folderId: stringSchema,
      name: optionalStringSchema,
      parentId: optionalStringSchema,
      order: { type: "number" },
      dryRun: booleanSchema,
    },
    ["editId", "folderId"],
  ),
  (args) =>
    service.updateFolder(
      {
        editId: stringArg(args, "editId"),
        folderId: stringArg(args, "folderId"),
        name: stringArg(args, "name") || undefined,
        parentId: "parentId" in args ? stringArg(args, "parentId") || null : undefined,
        order: typeof args.order === "number" ? args.order : undefined,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "folder_delete_preview",
  "预览删除文件夹的页面影响",
  objectSchema({ editId: stringSchema, folderId: stringSchema }, ["editId", "folderId"]),
  (args) => service.deleteFolderPreview(stringArg(args, "editId"), stringArg(args, "folderId")),
);

tool(
  "folder_delete_execute",
  "删除文件夹，可选择保留或删除内容",
  objectSchema(
    { planId: stringSchema, confirmToken: stringSchema, strategy: stringSchema },
    ["planId", "confirmToken", "strategy"],
  ),
  (args) =>
    service.deleteFolderExecute(
      stringArg(args, "planId"),
      stringArg(args, "confirmToken"),
      stringArg(args, "strategy") === "delete_contents" ? "delete_contents" : "move_to_root",
      actor,
    ),
);

tool(
  "config_get_project_schema",
  "读取项目级配置 Schema",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.getProjectConfig(stringArg(args, "editId")),
);

tool(
  "config_set_project_schema",
  "创建或更新项目级配置 Schema",
  objectSchema({ editId: stringSchema, schema: stringSchema, dryRun: booleanSchema }, [
    "editId",
    "schema",
  ]),
  (args) =>
    service.setProjectConfig(
      {
        editId: stringArg(args, "editId"),
        schema: stringArg(args, "schema"),
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "config_delete_project_schema",
  "删除项目级配置 Schema",
  objectSchema({ editId: stringSchema, dryRun: booleanSchema }, ["editId"]),
  (args) =>
    service.deleteProjectConfig(stringArg(args, "editId"), booleanArg(args, "dryRun"), actor),
);

tool(
  "config_validate_page_schema",
  "校验页面 Schema",
  objectSchema({ editId: stringSchema, pageId: stringSchema }, ["editId", "pageId"]),
  (args) => service.validatePageSchema(stringArg(args, "editId"), stringArg(args, "pageId")),
);

tool(
  "config_validate_merged_schema",
  "校验项目级和页面级 Schema 合并结果",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.validateMergedSchema(stringArg(args, "editId")),
);

tool(
  "config_generate_from_code",
  "从页面代码生成候选 Schema",
  objectSchema({ editId: stringSchema, pageId: stringSchema }, ["editId", "pageId"]),
  (args) => service.generateSchemaFromCode(stringArg(args, "editId"), stringArg(args, "pageId")),
);

tool(
  "config_apply_visual_patch",
  "应用可视化配置补丁候选",
  objectSchema({ editId: stringSchema, pageId: stringSchema, patch: { type: "object" } }, [
    "editId",
    "pageId",
    "patch",
  ]),
  (args) =>
    service.applyVisualPatch(
      stringArg(args, "editId"),
      stringArg(args, "pageId"),
      recordArg(args, "patch", {}),
    ),
);

tool(
  "asset_list",
  "列出项目图片和引用摘要",
  objectSchema({ editId: stringSchema }, ["editId"]),
  (args) => service.listAssets(stringArg(args, "editId")),
);

tool(
  "asset_upload",
  "上传图片资产到编辑事务工作区",
  objectSchema(
    {
      editId: stringSchema,
      filename: stringSchema,
      dataBase64: stringSchema,
      mimeType: optionalStringSchema,
      dryRun: booleanSchema,
    },
    ["editId", "filename", "dataBase64"],
  ),
  (args) =>
    service.uploadAsset(
      {
        editId: stringArg(args, "editId"),
        filename: stringArg(args, "filename"),
        dataBase64: stringArg(args, "dataBase64"),
        mimeType: stringArg(args, "mimeType") || undefined,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "asset_delete_preview",
  "预览删除图片影响",
  objectSchema({ editId: stringSchema, assetPath: stringSchema }, ["editId", "assetPath"]),
  (args) =>
    service.deleteAssetPreview(
      stringArg(args, "editId"),
      stringArg(args, "assetPath"),
    ),
);

tool(
  "asset_delete_execute",
  "执行图片删除计划",
  objectSchema({ planId: stringSchema, confirmToken: stringSchema }, [
    "planId",
    "confirmToken",
  ]),
  (args) =>
    service.deleteAssetExecute(
      stringArg(args, "planId"),
      stringArg(args, "confirmToken"),
      actor,
    ),
);

tool(
  "asset_replace",
  "替换图片并更新文本引用",
  objectSchema(
    {
      editId: stringSchema,
      oldPath: stringSchema,
      filename: stringSchema,
      dataBase64: stringSchema,
      mimeType: optionalStringSchema,
      dryRun: booleanSchema,
    },
    ["editId", "oldPath", "filename", "dataBase64"],
  ),
  (args) =>
    service.replaceAsset(
      {
        editId: stringArg(args, "editId"),
        oldPath: stringArg(args, "oldPath"),
        filename: stringArg(args, "filename"),
        dataBase64: stringArg(args, "dataBase64"),
        mimeType: stringArg(args, "mimeType") || undefined,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    ),
);

tool(
  "preview_compile",
  "编译指定页面或全项目的静态预检",
  objectSchema({ editId: stringSchema, pageId: optionalStringSchema }, ["editId"]),
  (args) =>
    service.previewCompile(
      stringArg(args, "editId"),
      stringArg(args, "pageId") || undefined,
    ),
);

tool(
  "preview_render",
  "获取可访问预览 URL",
  objectSchema({ editId: stringSchema, pageId: stringSchema }, ["editId", "pageId"]),
  (args) => service.previewRender(stringArg(args, "editId"), stringArg(args, "pageId")),
);

tool("preview_screenshot", "捕获页面截图状态", objectSchema({}), () =>
  service.previewScreenshot(),
);
tool("preview_console_logs", "读取页面控制台日志", objectSchema({}), () => service.previewLogs());
tool("preview_runtime_errors", "读取运行时错误", objectSchema({}), () => service.previewLogs());
tool("preview_healthcheck", "检查编译服务、截图服务和依赖状态", objectSchema({}), () =>
  service.previewHealthcheck(),
);

tool(
  "publish_check",
  "发布前检查页面、配置、图片和目标环境",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.publishCheck(stringArg(args, "projectId")),
);

tool(
  "publish_project",
  "发布项目状态",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.publishProject(stringArg(args, "projectId"), actor),
);

tool(
  "publish_status",
  "查询发布状态",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.publishStatus(stringArg(args, "projectId")),
);

tool(
  "publish_rollback",
  "回滚到上一发布版本",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.publishRollback(stringArg(args, "projectId")),
);

tool(
  "publish_artifacts",
  "查看发布产物摘要",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.publishStatus(stringArg(args, "projectId")),
);

tool(
  "ai_session_list",
  "列出项目相关 AI 会话摘要",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.aiSessionList(stringArg(args, "projectId")),
);

tool(
  "ai_session_get",
  "读取 AI 会话摘要",
  objectSchema({ sessionId: stringSchema }, ["sessionId"]),
  (args) => service.aiSessionGet(stringArg(args, "sessionId")),
);

tool(
  "ai_run_logs",
  "读取 AI 会话关联运行日志",
  objectSchema({ sessionId: stringSchema }, ["sessionId"]),
  (args) => service.aiRunLogs(stringArg(args, "sessionId")),
);

tool(
  "ai_workspace_context",
  "读取 AI 会话关联工作区文件列表",
  objectSchema({ sessionId: stringSchema }, ["sessionId"]),
  (args) => service.aiWorkspaceContext(stringArg(args, "sessionId")),
);

tool("ai_send_message", "AI 会话发消息占位；确定性项目操作优先使用 page/config/edit 工具", objectSchema({}), () => ({
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "AI 发消息仍由 author-site 与 agent-service 的在线会话链路管理",
      recoverable: true,
    },
  }),
);

tool(
  "audit_list",
  "查询 MCP 项目操作记录",
  objectSchema({ projectId: optionalStringSchema }),
  (args) => service.auditList(stringArg(args, "projectId") || undefined),
);

tool(
  "audit_get",
  "查看单次操作详情、操作者和差异摘要",
  objectSchema({ auditId: stringSchema }, ["auditId"]),
  (args) => service.auditGet(stringArg(args, "auditId")),
);

tool(
  "admin_lock_project",
  "临时锁定项目",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.lockProject(stringArg(args, "projectId"), actor),
);

tool(
  "admin_unlock_project",
  "解除项目锁",
  objectSchema({ projectId: stringSchema }, ["projectId"]),
  (args) => service.unlockProject(stringArg(args, "projectId"), actor),
);

server.resource({
  uri: "template://list",
  name: "Template List",
  description: "模板分类和摘要",
  mimeType: "application/json",
  read: () => service.listTemplates(),
});

server.resource({
  uri: "project-admin://capabilities",
  name: "Project Admin Capabilities",
  description: "当前 MCP 操作者权限和工具摘要",
  mimeType: "application/json",
  read: () => service.capabilities(actor),
});

server.prompt({
  name: "create_project_from_brief",
  description: "从用户需求选择模板、创建项目并进入编辑事务",
  arguments: [{ name: "brief", required: true }],
  get: (args) =>
    [
      `用户需求：${stringArg(args, "brief")}`,
      "请先调用 template_recommend 或 template_list 选择起点，再用 project_create/template_instantiate 创建项目。",
      "创建后调用 edit_begin，所有页面与配置写入必须在事务内完成，提交前运行 edit_validate 和 edit_diff。",
    ].join("\n"),
});

server.prompt({
  name: "refactor_project_pages",
  description: "批量整理页面结构、文件夹和命名",
  arguments: [{ name: "projectId", required: true }],
  get: (args) =>
    [
      `项目：${stringArg(args, "projectId")}`,
      "先 project_get 理解页面树，再 edit_begin。结构调整使用 folder_*、page_update_meta、page_reorder。",
      "删除页面或文件夹必须先调用对应 preview 工具，再携带 confirmToken 执行。",
    ].join("\n"),
});

server.prompt({
  name: "fix_preview_failure",
  description: "根据校验、日志和页面内容修复预览错误",
  arguments: [
    { name: "editId", required: true },
    { name: "pageId", required: false },
  ],
  get: (args) =>
    [
      `事务：${stringArg(args, "editId")}`,
      `页面：${stringArg(args, "pageId") || "全项目"}`,
      "先 preview_compile，再 page_get 和 config_validate_merged_schema。修复后重复校验，最后 edit_diff 与 edit_commit。",
    ].join("\n"),
});

server.prompt({
  name: "prepare_template",
  description: "将项目校验、截图、补充元信息并保存为模板",
  arguments: [{ name: "projectId", required: true }],
  get: (args) =>
    [
      `项目：${stringArg(args, "projectId")}`,
      "先 project_get 和 publish_check，必要时 edit_begin 修复页面/配置。",
      "确认后调用 template_create_from_project，并用 template_get 验证模板快照。",
    ].join("\n"),
});

server.prompt({
  name: "publish_with_checklist",
  description: "发布前检查、发布、确认使用端状态",
  arguments: [{ name: "projectId", required: true }],
  get: (args) =>
    [
      `项目：${stringArg(args, "projectId")}`,
      "先 publish_check，阻塞项清零后调用 publish_project，再 publish_status 查看结果。",
      "发布是外部可见操作，执行前必须向用户确认。",
    ].join("\n"),
});

server.prompt({
  name: "install_project_admin_mcp",
  description: "生成 Codex 安装提示词和 MCP 客户端配置片段",
  get: () =>
    [
      createCodexInstallPrompt(),
      "",
      "本地 stdio 配置片段：",
      createMcpClientConfigSnippet({ mode: "stdio" }),
      "",
      "远程 HTTP 配置片段：",
      createMcpClientConfigSnippet({ mode: "remote" }),
    ].join("\n"),
});

const isCliEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
  server.listen();
}
