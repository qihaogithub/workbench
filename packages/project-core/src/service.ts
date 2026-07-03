import fs from "node:fs";
import path from "node:path";

import {
  KnowledgeFileStore,
  indexTemplateSnapshot,
} from "@opencode-workbench/knowledge-service";
import {
  PreviewRuntimeContractError,
  type RuntimeContractIssue,
} from "@opencode-workbench/preview-contract/runtime";
import { compilePreviewPageSource } from "@opencode-workbench/preview-contract/compiler";
import type {
  DemoFiles,
  DemoFolderMeta,
  DemoMeta,
  DemoPageRuntimeType,
  DemoPageMeta,
  AppGraph,
  PageVersionInfo,
  Project,
  PrototypePageMeta,
  ProjectTemplateMeta,
  VersionInfo,
  VersionHistoryEntryType,
  WorkspaceTree,
} from "@opencode-workbench/shared/contracts";

import type {
  AuditEvent,
  AuditLevel,
  AiSendMessageInput,
  AiSendMessageResult,
  AiSessionSummary,
  AssetReplaceInput,
  AssetSummary,
  AssetUploadInput,
  CapabilitySummary,
  ConfigUpdateInput,
  CreateProjectInput,
  DiffSummary,
  EditStatus,
  EditTransaction,
  FolderUpdateInput,
  PageCreateInput,
  PageDetail,
  PageVersionCreateInput,
  PageVersionDetail,
  PageVersionHistory,
  PageRestoreResult,
  PageSwitchRuntimeInput,
  PageUpdatePrototypeInput,
  ProjectPackageExport,
  PageUpdateInput,
  PreviewPlan,
  ProjectAdminActor,
  ProjectAdminConfig,
  ProjectAdminError,
  ProjectAdminResult,
  ProjectDetail,
  ProjectSummary,
  PublishStatus,
  PrototypeGateDecision,
  RuntimeValidationIssue,
  RuntimeValidationResult,
  TemplateHealthReport,
  TemplateListFilter,
  TemplateMetaInput,
  ValidationResult,
} from "./types.js";
import {
  getAgentServiceUrl,
  getProjectAdminActorEnv,
  getProjectAdminAuditDir,
  getProjectAdminDataDir,
  getProjectAdminMaxBatchSize,
  getProjectAdminMode,
  getScreenshotServiceUrl,
  getViewerBaseUrl,
} from "./config.js";

const DEFAULT_DEMO_CODE = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
`;

const DEFAULT_DEMO_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Demo 配置",
    type: "object",
    properties: {
      title: { type: "string", title: "标题", default: "Hello World" },
      description: {
        type: "string",
        title: "描述",
        default: "This is a demo",
      },
    },
    required: ["title"],
  },
  null,
  2,
);

const DEFAULT_PROTOTYPE_HTML = `<main class="prototype-page">
  <section class="prototype-hero">
    <p class="eyebrow">Prototype</p>
    <h1>HTML/CSS 原型页</h1>
    <p>用于快速表达页面结构和信息层级。</p>
  </section>
</main>`;

const DEFAULT_PROTOTYPE_CSS = `.prototype-page {
  min-height: 100%;
  padding: 32px;
  background: #f8fafc;
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.prototype-hero {
  border: 1px solid #d1d5db;
  background: #ffffff;
  padding: 28px;
}
.eyebrow {
  color: #2563eb;
  font-size: 12px;
  text-transform: uppercase;
}`;

const DEFAULT_PROTOTYPE_META: PrototypePageMeta = {
  width: 390,
  height: 844,
  generatedBy: "project-core",
};

const MAX_PROTOTYPE_HTML_LENGTH = 120_000;
const MAX_PROTOTYPE_CSS_LENGTH = 80_000;
const PROTOTYPE_GLOBAL_SELECTOR_RE = /(^|[,{;]\s*)(html|body|:root)\b/i;

const WORKSPACE_TREE_FILENAME = "workspace-tree.json";
const APP_GRAPH_FILENAME = "app.graph.json";
const PROJECT_CONFIG_FILENAME = "project.config.schema.json";
const EDIT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_VERSIONS_KEEP = 50;
const MAX_ASSET_SIZE = 10 * 1024 * 1024;
const ALLOWED_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const DEFAULT_PROJECT_CATEGORY = "未分类";

function normalizeProjectCategory(category?: string): string {
  const normalized = category?.trim();
  return normalized || DEFAULT_PROJECT_CATEGORY;
}

function nowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeId(id: string, label: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new Error(`INVALID_${label.toUpperCase()}_ID`);
  }
  return id;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function resolvePageRuntimeType(page?: Pick<DemoPageMeta, "runtimeType"> | null): DemoPageRuntimeType {
  return page?.runtimeType === "prototype-html-css"
    ? "prototype-html-css"
    : "high-fidelity-react";
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function copyWorkspace(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      return !segments.some((segment) =>
        ["node_modules", ".next", ".opencode", ".git"].includes(segment),
      );
    },
  });
}

function isWorkspaceMetadataPath(filePath: string): boolean {
  return [".workspace.json", ".session.json"].includes(path.basename(filePath));
}

function copyWorkspaceWithoutRuntimeMetadata(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      if (segments.some((segment) =>
        ["node_modules", ".next", ".opencode", ".git"].includes(segment),
      )) {
        return false;
      }
      return !isWorkspaceMetadataPath(relative);
    },
  });
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFiles(entryPath) : 1;
  }
  return count;
}

function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
    .replace(/-$/, "");
  return slug || "page";
}

function isValidRouteKey(routeKey: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}

function makeUniqueRouteKey(base: string, used: Set<string>): string {
  const normalizedBase = isValidRouteKey(base) ? base : generatePageSlug(base);
  let candidate = normalizedBase || "page";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalizedBase || "page"}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizePagesRouteKeys(pages: DemoPageMeta[]): DemoPageMeta[] {
  const used = new Set<string>();
  return pages.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used),
    };
  });
}

function sortPages(pages: DemoPageMeta[]): DemoPageMeta[] {
  return [...pages].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function ok<T>(
  data: T,
  extras: Omit<ProjectAdminResult<T>, "ok" | "data"> = {},
): ProjectAdminResult<T> {
  return { ok: true, data, ...extras };
}

function fail<T>(
  code: string,
  message: string,
  extras: Omit<ProjectAdminResult<T>, "ok" | "error"> = {},
): ProjectAdminResult<T> {
  return {
    ok: false,
    error: { code, message, recoverable: true },
    ...extras,
  };
}

export class ProjectAdminService {
  readonly dataDir: string;
  readonly projectsDir: string;
  readonly templatesDir: string;
  readonly workspacesDir: string;
  readonly snapshotsDir: string;
  readonly publishedDir: string;
  readonly sessionsDir: string;
  readonly agentRunLogsDir: string;
  readonly auditDir: string;
  readonly internalDir: string;
  readonly editsDir: string;
  readonly plansDir: string;
  readonly maxBatchSize: number;

  constructor(private readonly config: ProjectAdminConfig = {}) {
    this.dataDir = config.dataDir ?? getProjectAdminDataDir();
    this.projectsDir = path.join(this.dataDir, "projects");
    this.templatesDir = path.join(this.dataDir, "templates");
    this.workspacesDir = path.join(this.dataDir, "workspaces");
    this.snapshotsDir = path.join(this.dataDir, "snapshots");
    this.publishedDir = path.join(this.dataDir, "published");
    this.sessionsDir = path.join(this.dataDir, "sessions");
    this.agentRunLogsDir = path.join(this.dataDir, "agent-run-logs");
    this.auditDir = config.auditDir ?? getProjectAdminAuditDir(this.dataDir);
    this.internalDir = path.join(this.dataDir, ".project-admin");
    this.editsDir = path.join(this.internalDir, "edits");
    this.plansDir = path.join(this.internalDir, "plans");
    this.maxBatchSize = config.maxBatchSize ?? getProjectAdminMaxBatchSize();
  }

  ensureDirs(): void {
    [
      this.dataDir,
      this.projectsDir,
      this.templatesDir,
      this.workspacesDir,
      this.snapshotsDir,
      this.sessionsDir,
      this.agentRunLogsDir,
      this.auditDir,
      this.editsDir,
      this.plansDir,
    ].forEach(ensureDir);
  }

  capabilities(actor = this.defaultActor()): ProjectAdminResult<CapabilitySummary> {
    const writable = actor.role !== "readonly";
    return ok({
      actor,
      mode: getProjectAdminMode(writable),
      writable,
      maxBatchSize: this.maxBatchSize,
      tools: [
        "project_*",
        "template_*",
        "edit_*",
        "page_*",
        "folder_*",
        "config_*",
        "asset_*",
        "preview_*",
        "publish_*",
        "ai_*",
        "audit_*",
        "admin_*",
      ],
    });
  }

  defaultActor(): ProjectAdminActor {
    const actor = getProjectAdminActorEnv();
    return {
      ...actor,
      allowedProjectIds:
        actor.allowedProjectIds && actor.allowedProjectIds.length > 0
          ? actor.allowedProjectIds
          : undefined,
    };
  }

  listProjects(actor = this.defaultActor()): ProjectAdminResult<ProjectSummary[]> {
    this.ensureDirs();
    const projects: ProjectSummary[] = [];
    for (const entry of fs.readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!this.canAccessProject(entry.name, actor)) continue;
      const projectPath = this.getProjectPath(entry.name);
      const stats = fs.statSync(projectPath);
      const project = this.readProject(entry.name);
      projects.push({
        id: entry.name,
        name: project?.name ?? entry.name,
        category: normalizeProjectCategory(project?.category),
        description: project?.description,
        createdAt: project?.createdAt ?? stats.birthtimeMs,
        updatedAt: project?.updatedAt ?? stats.mtimeMs,
        thumbnail: project?.thumbnail,
        demoCount: project?.demoPages?.length ?? 0,
        demoPages: project?.demoPages,
        publishedVersion: project?.publishedVersion,
        publishedAt: project?.publishedAt,
        locked: this.isProjectLocked(entry.name),
      });
    }
    return ok(projects.sort((a, b) => b.updatedAt - a.updatedAt));
  }

  getProject(projectId: string, actor = this.defaultActor()): ProjectAdminResult<ProjectDetail> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const workspacePath = this.projectWorkspacePath(projectId);
    const tree = this.readWorkspaceTree(workspacePath);
    return ok({
      project: {
        ...project,
        demoPages: sortPages(tree.pages),
        demoFolders: tree.folders,
      },
      pages: sortPages(tree.pages),
      folders: tree.folders,
      versions: [...project.versions].reverse(),
      projectConfigSchema: this.readProjectConfig(workspacePath) ?? undefined,
      locked: this.isProjectLocked(projectId),
    });
  }

  exportProjectPackage(
    projectId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<ProjectPackageExport> {
    const detail = this.getProject(projectId, actor);
    if (!detail.ok || !detail.data) {
      return fail(detail.error?.code ?? "PROJECT_NOT_FOUND", detail.error?.message ?? "项目不存在");
    }
    const workspacePath = this.projectWorkspacePath(projectId);
    const runtimeValidation = this.validateWorkspaceRuntime(workspacePath);
    if (!runtimeValidation.ok) {
      return fail("VALIDATION_BLOCKED", "项目运行契约校验失败，不能导出项目包", {
        validation: this.runtimeToValidationResult(runtimeValidation),
        runtimeValidation,
      });
    }
    const pages: PageDetail[] = [];
    for (const page of detail.data.pages) {
      const files = this.readPageFiles(workspacePath, page.id);
      if (!files) {
        return fail("FILE_READ_ERROR", `页面文件不存在: ${page.id}`);
      }
      pages.push({ meta: page, files });
    }
    const assets = this.walkFiles(path.join(workspacePath, "assets"))
      .filter((file) => fs.statSync(file).isFile())
      .map((file) => {
        const relativePath = ["assets", path.relative(path.join(workspacePath, "assets"), file)]
          .join("/")
          .split(path.sep)
          .join("/");
        const buffer = fs.readFileSync(file);
        return {
          path: relativePath,
          dataBase64: buffer.toString("base64"),
          size: buffer.length,
        };
      });
    const knowledgeFiles = this.walkFiles(path.join(workspacePath, "knowledge"))
      .filter((file) => fs.statSync(file).isFile())
      .map((file) => {
        const relativePath = ["knowledge", path.relative(path.join(workspacePath, "knowledge"), file)]
          .join("/")
          .split(path.sep)
          .join("/");
        const buffer = fs.readFileSync(file);
        return {
          path: relativePath,
          dataBase64: buffer.toString("base64"),
          size: buffer.length,
        };
      });
    const baseVersion = detail.data.versions[0]?.versionId ?? "v0";
    return ok({
      project: detail.data.project,
      pages,
      folders: detail.data.folders,
      versions: detail.data.versions,
      projectConfigSchema: detail.data.projectConfigSchema,
      appGraph: this.readAppGraph(workspacePath),
      assets,
      knowledgeFiles,
      baseVersion,
    });
  }

  createProject(
    input: CreateProjectInput,
    actor = this.defaultActor(),
  ): ProjectAdminResult<DemoMeta> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const name = input.name.trim();
    if (!name) return fail("INVALID_REQUEST", "项目名称不能为空");
    const category = normalizeProjectCategory(input.category);
    if (input.dryRun) {
      return ok(
        {
          id: "dry-run",
          name,
          category,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          demoCount: 0,
        },
        {
          diffSummary: { created: [`project:${name}`] },
          nextActions: ["project_create", "edit_begin"],
        },
      );
    }

    this.ensureDirs();
    const projectId = nowId("proj");
    const projectPath = this.getProjectPath(projectId);
    const workspacePath = path.join(projectPath, "workspace");
    ensureDir(projectPath);

    if (input.templateId) {
      const templateWorkspace = path.join(this.getTemplatePath(input.templateId), "workspace");
      if (!fs.existsSync(templateWorkspace)) {
        return fail("TEMPLATE_NOT_FOUND", "模板不存在");
      }
      copyWorkspace(templateWorkspace, workspacePath);
    } else {
      ensureDir(path.join(workspacePath, "demos"));
      this.writeWorkspaceTree(workspacePath, { pages: [], folders: [] });
    }

    const tree = this.readWorkspaceTree(workspacePath);
    const now = Date.now();
    const project: Project = {
      id: projectId,
      name,
      category,
      description: input.description,
      workspacePath,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: [],
      pageVersions: {},
      createdAt: now,
      updatedAt: now,
    };
    this.writeProject(projectId, project);
    const stats = fs.statSync(projectPath);
    const result: DemoMeta = {
      id: projectId,
      name,
      category,
      createdAt: stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
      demoCount: project.demoPages.length,
      demoPages: project.demoPages,
    };
    const auditId = this.audit("project_create", actor, "L1", true, {
      projectId,
      inputSummary: { name, category, templateId: input.templateId },
      diffSummary: { created: [`project:${projectId}`] },
    });
    return ok(result, {
      auditId,
      diffSummary: { created: [`project:${projectId}`] },
      nextActions: ["edit_begin", "project_get"],
    });
  }

  updateProject(
    input: { projectId: string; name?: string; category?: string; description?: string; dryRun?: boolean },
    actor = this.defaultActor(),
  ): ProjectAdminResult<Project> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const access = this.requireProjectAccess(input.projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(input.projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const diff: DiffSummary = { updated: [] };
    const next = { ...project };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) return fail("INVALID_REQUEST", "项目名称不能为空");
      next.name = name;
      diff.updated?.push("project.name");
    }
    if (input.category !== undefined) {
      next.category = normalizeProjectCategory(input.category);
      diff.updated?.push("project.category");
    }
    if (input.description !== undefined) {
      next.description = input.description;
      diff.updated?.push("project.description");
    }
    next.updatedAt = Date.now();
    if (!input.dryRun) this.writeProject(project.id, next);
    const auditId = input.dryRun
      ? undefined
      : this.audit("project_rename", actor, "L1", true, {
          projectId: project.id,
          diffSummary: diff,
        });
    return ok(next, { auditId, diffSummary: diff });
  }

  duplicateProject(
    projectId: string,
    name?: string,
    category?: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<DemoMeta> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const source = this.readProject(projectId);
    if (!source) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const templateId = this.createTemplateSnapshot(projectId, {
      category: "临时复制",
      name: `${source.name} copy source`,
      description: "项目复制临时快照",
    });
    const created = this.createProject(
      { name: name ?? `${source.name} 副本`, category: normalizeProjectCategory(category ?? source.category), templateId },
      actor,
    );
    fs.rmSync(this.getTemplatePath(templateId), { recursive: true, force: true });
    return created;
  }

  deleteProjectPreview(projectId: string, actor = this.defaultActor()): ProjectAdminResult<PreviewPlan> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const plan = this.createPlan("project_delete", projectId, [
      `删除项目 ${project.name}`,
      `删除 ${project.demoPages.length} 个页面`,
      "删除项目工作空间和元数据",
    ]);
    return ok(plan, {
      diffSummary: { deleted: [`project:${projectId}`] },
      nextActions: ["project_delete_execute"],
    });
  }

  deleteProjectExecute(
    planId: string,
    confirmToken: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ deleted: boolean; projectId: string }> {
    if (actor.role !== "admin") return fail("FORBIDDEN", "只有管理员可以删除项目");
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "project_delete") {
      return fail("PLAN_NOT_FOUND", "删除预览计划不存在");
    }
    if (plan.confirmToken !== confirmToken) {
      return fail("CONFIRMATION_REQUIRED", "确认 token 不匹配");
    }
    const access = this.requireProjectAccess(plan.resourceId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    fs.rmSync(this.getProjectPath(plan.resourceId), { recursive: true, force: true });
    const auditId = this.audit("project_delete_execute", actor, "L3", true, {
      projectId: plan.resourceId,
      resourceId: plan.resourceId,
      diffSummary: { deleted: [`project:${plan.resourceId}`] },
    });
    return ok(
      { deleted: true, projectId: plan.resourceId },
      { auditId, diffSummary: { deleted: [`project:${plan.resourceId}`] } },
    );
  }

  setProjectCover(
    projectId: string,
    thumbnail: string | undefined,
    actor = this.defaultActor(),
  ): ProjectAdminResult<Project> {
    return this.updateProject({ projectId, description: undefined }, actor).ok
      ? this.patchProjectCover(projectId, thumbnail, actor)
      : fail("PROJECT_NOT_FOUND", "项目不存在");
  }

  listTemplates(filter: TemplateListFilter = {}): ProjectAdminResult<ProjectTemplateMeta[]> {
    this.ensureDirs();
    const templates: ProjectTemplateMeta[] = [];
    for (const entry of fs.readdirSync(this.templatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const meta = this.readTemplate(entry.name);
      if (meta) templates.push(meta);
    }
    const filtered = templates.filter((template) => {
      if (filter.scope && template.scope !== filter.scope) return false;
      if (filter.official !== undefined && Boolean(template.official) !== filter.official) {
        return false;
      }
      return true;
    });
    return ok(
      filtered.sort((a, b) => {
        if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
    );
  }

  getTemplate(templateId: string): ProjectAdminResult<ProjectTemplateMeta> {
    const template = this.readTemplate(templateId);
    if (!template) return fail("TEMPLATE_NOT_FOUND", "模板不存在");
    return ok(template);
  }

  createTemplateFromProject(
    projectId: string,
    input: TemplateMetaInput,
    actor = this.defaultActor(),
  ): ProjectAdminResult<ProjectTemplateMeta> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    if (this.isProjectLocked(projectId) && actor.role !== "admin") {
      return fail("PROJECT_LOCKED", "项目已被管理员锁定，当前不能打开编辑事务");
    }
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const runtimeValidation = this.validateWorkspaceRuntime(this.projectWorkspacePath(projectId));
    if (!runtimeValidation.ok) {
      return fail("VALIDATION_BLOCKED", "项目运行契约校验失败，不能保存为模板", {
        validation: this.runtimeToValidationResult(runtimeValidation),
        runtimeValidation,
      });
    }
    const templateId = this.createTemplateSnapshot(projectId, input);
    const template = this.readTemplate(templateId);
    if (!template) return fail("FILE_WRITE_ERROR", "模板写入失败");
    const auditId = this.audit("template_create_from_project", actor, "L2", true, {
      projectId,
      resourceId: templateId,
      diffSummary: { created: [`template:${templateId}`] },
    });
    return ok(template, {
      auditId,
      diffSummary: { created: [`template:${templateId}`] },
    });
  }

  updateTemplateMeta(
    templateId: string,
    input: Partial<TemplateMetaInput>,
    actor = this.defaultActor(),
  ): ProjectAdminResult<ProjectTemplateMeta> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const template = this.readTemplate(templateId);
    if (!template) return fail("TEMPLATE_NOT_FOUND", "模板不存在");
    const updated: ProjectTemplateMeta = {
      ...template,
      category: input.category?.trim() || template.category,
      name: input.name?.trim() || template.name,
      description: input.description?.trim() || template.description,
      thumbnail: Object.prototype.hasOwnProperty.call(input, "thumbnail")
        ? input.thumbnail
        : template.thumbnail,
      scope: input.scope ?? template.scope,
      official: input.official ?? template.official,
      updatedAt: Date.now(),
    };
    this.writeTemplate(templateId, updated);
    const auditId = this.audit("template_update_meta", actor, "L1", true, {
      resourceId: templateId,
      diffSummary: { updated: [`template:${templateId}`] },
    });
    return ok(updated, { auditId, diffSummary: { updated: [`template:${templateId}`] } });
  }

  checkTemplateHealth(templateId?: string): ProjectAdminResult<TemplateHealthReport> {
    this.ensureDirs();
    const templateIds = templateId
      ? [templateId]
      : fs.readdirSync(this.templatesDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
    const items = templateIds.map((id) => {
      const template = this.readTemplate(id);
      const issues: ValidationResult["issues"] = [];
      const workspacePath = path.join(this.getTemplatePath(id), "workspace");
      if (!template) {
        issues.push({
          code: "TEMPLATE_META_INVALID",
          message: "模板元数据缺失或不完整",
          resourceId: id,
          severity: "blocking",
        });
      }
      if (!fs.existsSync(workspacePath)) {
        issues.push({
          code: "TEMPLATE_WORKSPACE_MISSING",
          message: "模板 workspace 不存在",
          resourceId: id,
          severity: "blocking",
        });
      } else {
        const validation = this.validateWorkspace(workspacePath);
        issues.push(...validation.issues);
        if (template && template.demoCount !== this.readWorkspaceTree(workspacePath).pages.length) {
          issues.push({
            code: "TEMPLATE_DEMO_COUNT_MISMATCH",
            message: "模板页面数量与 workspace-tree 不一致",
            resourceId: id,
            severity: "warning",
          });
        }
      }
      return {
        templateId: id,
        name: template?.name,
        scope: template?.scope,
        official: template?.official,
        ok: issues.every((issue) => issue.severity !== "blocking"),
        issues,
      };
    });
    const report: TemplateHealthReport = {
      checkedAt: Date.now(),
      total: items.length,
      ok: items.every((item) => item.ok),
      items,
    };
    writeJsonFile(path.join(this.internalDir, "template-health", "latest.json"), report);
    return ok(report, {
      validation: {
        ok: report.ok,
        issues: items.flatMap((item) => item.issues),
      },
      nextActions: ["template_list", "template_get"],
    });
  }

  deleteTemplatePreview(templateId: string): ProjectAdminResult<PreviewPlan> {
    const template = this.readTemplate(templateId);
    if (!template) return fail("TEMPLATE_NOT_FOUND", "模板不存在");
    return ok(
      this.createPlan("template_delete", templateId, [
        `删除模板 ${template.name}`,
        "不会删除已从该模板创建的项目",
      ]),
      { diffSummary: { deleted: [`template:${templateId}`] } },
    );
  }

  deleteTemplateExecute(
    planId: string,
    confirmToken: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ deleted: boolean; templateId: string }> {
    if (actor.role !== "admin") return fail("FORBIDDEN", "只有管理员可以删除模板");
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "template_delete") {
      return fail("PLAN_NOT_FOUND", "模板删除预览计划不存在");
    }
    if (plan.confirmToken !== confirmToken) {
      return fail("CONFIRMATION_REQUIRED", "确认 token 不匹配");
    }
    fs.rmSync(this.getTemplatePath(plan.resourceId), { recursive: true, force: true });
    const auditId = this.audit("template_delete_execute", actor, "L3", true, {
      resourceId: plan.resourceId,
      diffSummary: { deleted: [`template:${plan.resourceId}`] },
    });
    return ok(
      { deleted: true, templateId: plan.resourceId },
      { auditId, diffSummary: { deleted: [`template:${plan.resourceId}`] } },
    );
  }

  convertTemplateToProject(
    templateId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<DemoMeta> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const template = this.readTemplate(templateId);
    if (!template) return fail("TEMPLATE_NOT_FOUND", "模板不存在");

    const created = this.createProject(
      {
        name: template.name,
        category: template.category,
        description: template.description,
        templateId,
      },
      actor,
    );
    if (!created.ok || !created.data) return created;

    fs.rmSync(this.getTemplatePath(templateId), { recursive: true, force: true });
    const auditId = this.audit("template_convert_to_project", actor, "L2", true, {
      projectId: created.data.id,
      resourceId: templateId,
      diffSummary: {
        created: [`project:${created.data.id}`],
        deleted: [`template:${templateId}`],
      },
    });
    return ok(created.data, {
      auditId,
      diffSummary: {
        created: [`project:${created.data.id}`],
        deleted: [`template:${templateId}`],
      },
      nextActions: ["project_get", "template_list"],
    });
  }

  recommendTemplate(description: string): ProjectAdminResult<{
    templateId: string | null;
    reason: string;
    confidence: number;
    template?: ProjectTemplateMeta;
  }> {
    const templates = this.listTemplates().data ?? [];
    const query = description.toLowerCase();
    const scored = templates
      .map((template) => {
        const haystack = `${template.category} ${template.name} ${template.description}`.toLowerCase();
        const score = query
          .split(/\s+/)
          .filter(Boolean)
          .reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
        return { template, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
      return ok({ templateId: null, reason: "模板库为空", confidence: 0 });
    }
    return ok({
      templateId: best.template.id,
      reason: best.score > 0 ? "模板元信息与描述存在关键词匹配" : "未命中关键词，返回最近更新模板",
      confidence: best.score > 0 ? Math.min(0.95, 0.45 + best.score * 0.15) : 0.25,
      template: best.template,
    });
  }

  instantiateTemplate(
    templateId: string,
    name: string,
    categoryOrActor?: string | ProjectAdminActor,
    actor = this.defaultActor(),
  ): ProjectAdminResult<DemoMeta> {
    const category =
      typeof categoryOrActor === "string" ? categoryOrActor : undefined;
    const effectiveActor =
      typeof categoryOrActor === "object" && categoryOrActor
        ? categoryOrActor
        : actor;
    return this.createProject({ name, category, templateId }, effectiveActor);
  }

  beginEdit(
    projectId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<EditTransaction> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    if (this.isProjectLocked(projectId) && actor.role !== "admin") {
      return fail("PROJECT_LOCKED", "项目已被管理员锁定，当前不能打开编辑事务");
    }
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const source = this.projectWorkspacePath(projectId);
    if (!fs.existsSync(source)) return fail("WORKSPACE_NOT_FOUND", "项目工作空间不存在");

    const editId = nowId("edit");
    const workspacePrefix = actor.source === "project-admin-cli" ? "cli" : "core";
    const workspaceId = `${workspacePrefix}_${editId}`;
    const workspacePath = path.join(this.workspacesDir, actor.id, projectId, workspaceId);
    ensureDir(path.dirname(workspacePath));
    copyWorkspace(source, workspacePath);
    writeJsonFile(path.join(workspacePath, ".workspace.json"), {
      workspaceId,
      demoId: projectId,
      projectId,
      ownerUserId: actor.id,
      scope: "branch",
      status: "active",
      baseVersion: project.versions.at(-1)?.versionId ?? "v0",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const transaction: EditTransaction = {
      editId,
      projectId,
      workspaceId,
      workspacePath,
      workspaceScope: "branch",
      baseVersion: project.versions.at(-1)?.versionId ?? "v0",
      actor,
      createdAt: Date.now(),
      expiresAt: Date.now() + EDIT_TTL_MS,
      status: "editing",
    };
    this.writeEdit(transaction);
    const auditId = this.audit("edit_begin", actor, "L1", true, {
      projectId,
      resourceId: editId,
    });
    return ok(transaction, { auditId, nextActions: ["page_list", "edit_validate"] });
  }

  editStatus(editId: string): ProjectAdminResult<EditStatus> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    return ok({
      transaction: this.refreshEditStatus(transaction),
      changedFiles: this.diffWorkspaceFiles(
        this.projectWorkspacePath(transaction.projectId),
        transaction.workspacePath,
      ),
    });
  }

  editDiff(editId: string): ProjectAdminResult<DiffSummary> {
    const status = this.editStatus(editId);
    if (!status.ok || !status.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    return ok({
      updated: status.data.changedFiles,
      notes:
        status.data.changedFiles.length === 0
          ? ["当前事务没有文件差异"]
          : [`当前事务包含 ${status.data.changedFiles.length} 个变更文件`],
    });
  }

  editValidate(editId: string): ProjectAdminResult<ValidationResult> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const validation = this.validateEditTransaction(transaction);
    return ok(validation, { validation });
  }

  commitEdit(
    editId: string,
    note?: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ version: VersionInfo; project: Project }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    if (transaction.status !== "editing") {
      return fail("EDIT_NOT_EDITING", "编辑事务不在可提交状态");
    }
    if (Date.now() > transaction.expiresAt) {
      transaction.status = "expired";
      this.writeEdit(transaction);
      return fail("EDIT_EXPIRED", "编辑事务已过期");
    }
    const project = this.readProject(transaction.projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const currentVersion = project.versions.at(-1)?.versionId ?? "v0";
    if (currentVersion !== transaction.baseVersion) {
      return fail("EDIT_CONFLICT", "项目已被其他事务保存，请重新打开编辑事务", {
        validation: {
          ok: false,
          issues: [
            {
              code: "EDIT_CONFLICT",
              message: `当前版本 ${currentVersion} 与事务基准 ${transaction.baseVersion} 不一致`,
              severity: "blocking",
            },
          ],
        },
      });
    }
    const validation = this.validateEditTransaction(transaction);
    if (!validation.ok) {
      return fail("VALIDATION_BLOCKED", "校验未通过，不能提交", { validation });
    }

    const projectWorkspace = this.projectWorkspacePath(transaction.projectId);
    const changedFiles = this.diffWorkspaceFiles(projectWorkspace, transaction.workspacePath)
      .filter((file) => !isWorkspaceMetadataPath(file));
    fs.rmSync(projectWorkspace, { recursive: true, force: true });
    copyWorkspaceWithoutRuntimeMetadata(transaction.workspacePath, projectWorkspace);
    const version = this.createProjectVersion(project, projectWorkspace, actor.name, editId, note, "named_version");
    const tree = this.readWorkspaceTree(projectWorkspace);
    const committedAt = Date.now();
    const updatedProject: Project = {
      ...project,
      workspacePath: projectWorkspace,
      activeWorkspaceId: undefined,
      activeWorkspaceUpdatedAt: undefined,
      canonicalSyncedWorkspaceId: undefined,
      canonicalSyncedAt: committedAt,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: this.compactProjectVersions([...project.versions, version]),
      updatedAt: committedAt,
    };
    this.writeProject(project.id, updatedProject);
    transaction.status = "committed";
    this.writeEdit(transaction);
    const diffSummary: DiffSummary = {
      updated: changedFiles,
      notes: [`生成版本 ${version.versionId}`],
    };
    const auditId = this.audit("edit_commit", actor, "L2", true, {
      projectId: project.id,
      resourceId: editId,
      diffSummary,
      validation,
    });
    return ok(
      { version, project: updatedProject },
      { auditId, diffSummary, validation, nextActions: ["project_get"] },
    );
  }

  discardEdit(editId: string, actor = this.defaultActor()): ProjectAdminResult<{ discarded: boolean }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    transaction.status = "discarded";
    this.writeEdit(transaction);
    fs.rmSync(transaction.workspacePath, { recursive: true, force: true });
    const auditId = this.audit("edit_discard", actor, "L1", true, {
      projectId: transaction.projectId,
      resourceId: editId,
    });
    return ok({ discarded: true }, { auditId });
  }

  extendEdit(editId: string): ProjectAdminResult<EditTransaction> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    transaction.expiresAt = Date.now() + EDIT_TTL_MS;
    this.writeEdit(transaction);
    return ok(transaction);
  }

  listPages(editId: string): ProjectAdminResult<{ pages: DemoPageMeta[]; folders: DemoFolderMeta[] }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    return ok({ pages: sortPages(tree.pages), folders: tree.folders });
  }

  getPage(editId: string, pageId: string): ProjectAdminResult<PageDetail> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const page = this.findPage(transaction.workspacePath, pageId);
    if (!page) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    const files = this.readPageFiles(transaction.workspacePath, pageId);
    if (!files) return fail("FILE_READ_ERROR", "页面文件不存在");
    return ok({ meta: page, files });
  }

  pageVersionList(
    projectId: string,
    pageId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageVersionHistory> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const versions = [...(project.pageVersions?.[pageId] ?? [])].reverse();
    return ok({
      projectId,
      pageId,
      currentVersion: versions[0]?.versionId ?? "v0",
      versions,
      totalVersions: versions.length,
    });
  }

  pageVersionGet(
    projectId: string,
    pageId: string,
    versionId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageVersionDetail> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const version = project.pageVersions?.[pageId]?.find((item) => item.versionId === versionId);
    if (!version) return fail("VERSION_NOT_FOUND", `页面版本 ${versionId} 不存在`);
    const files = this.readPageVersionFiles(project, pageId, versionId);
    if (!files) return fail("VERSION_SNAPSHOT_MISSING", `页面版本快照已丢失: ${versionId}`);
    return ok({ projectId, pageId, version, files });
  }

  createPage(input: PageCreateInput, actor = this.defaultActor()): ProjectAdminResult<PageDetail> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const parentId = input.parentId ?? null;
    if (parentId && !tree.folders.some((folder) => folder.id === parentId)) {
      return fail("FOLDER_NOT_FOUND", "父文件夹不存在");
    }
    const pageId = input.pageId
      ? safeId(input.pageId, "page")
      : `${generatePageSlug(input.name)}_${Math.random().toString(36).slice(2, 6)}`;
    if (tree.pages.some((page) => page.id === pageId)) {
      return fail("PAGE_ID_CONFLICT", `页面 id 已存在: ${pageId}`);
    }
    const runtimeType = input.runtimeType === "prototype-html-css"
      ? "prototype-html-css"
      : "high-fidelity-react";
    const meta: DemoPageMeta = {
      id: pageId,
      name: input.name.trim() || "Untitled",
      routeKey: makeUniqueRouteKey(
        input.routeKey ?? input.name,
        new Set(tree.pages.map((page) => page.routeKey).filter(Boolean) as string[]),
      ),
      runtimeType: runtimeType === "prototype-html-css" ? runtimeType : undefined,
      order: input.order ?? tree.pages.length,
      parentId,
    };
    if (input.dryRun) {
      const files: DemoFiles = runtimeType === "prototype-html-css"
        ? {
            code: "",
            schema: input.schema ?? DEFAULT_DEMO_SCHEMA,
            prototypeHtml: input.prototypeHtml ?? DEFAULT_PROTOTYPE_HTML,
            prototypeCss: input.prototypeCss ?? DEFAULT_PROTOTYPE_CSS,
            prototypeMeta: input.prototypeMeta ?? DEFAULT_PROTOTYPE_META,
          }
        : { code: input.code ?? DEFAULT_DEMO_CODE, schema: input.schema ?? DEFAULT_DEMO_SCHEMA };
      const runtimeValidation = this.validatePageFilesRuntime(pageId, runtimeType, files);
      return ok(
        { meta, files },
        {
          diffSummary: { created: [`page:${pageId}`] },
          runtimeValidation,
        },
      );
    }
    const demoDir = this.pageDir(workspacePath, pageId);
    ensureDir(demoDir);
    if (runtimeType === "prototype-html-css") {
      fs.writeFileSync(path.join(demoDir, "prototype.html"), input.prototypeHtml ?? DEFAULT_PROTOTYPE_HTML, "utf-8");
      fs.writeFileSync(path.join(demoDir, "prototype.css"), input.prototypeCss ?? DEFAULT_PROTOTYPE_CSS, "utf-8");
      writeJsonFile(path.join(demoDir, "prototype.meta.json"), input.prototypeMeta ?? DEFAULT_PROTOTYPE_META);
    } else {
      fs.writeFileSync(path.join(demoDir, "index.tsx"), input.code ?? DEFAULT_DEMO_CODE, "utf-8");
    }
    fs.writeFileSync(
      path.join(demoDir, "config.schema.json"),
      input.schema ?? DEFAULT_DEMO_SCHEMA,
      "utf-8",
    );
    this.writeWorkspaceTree(workspacePath, { ...tree, pages: [...tree.pages, meta] });
    const auditId = this.audit("page_create", actor, "L1", true, {
      projectId: transaction.data.projectId,
      resourceId: pageId,
      diffSummary: { created: [`page:${pageId}`] },
    });
    const runtimeValidation = this.validateWorkspaceRuntime(workspacePath, pageId);
    return ok(
      { meta, files: this.readPageFiles(workspacePath, pageId) ?? { code: "", schema: "" } },
      { auditId, diffSummary: { created: [`page:${pageId}`] }, runtimeValidation },
    );
  }

  duplicatePage(
    editId: string,
    pageId: string,
    name?: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageDetail> {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    return this.createPage({
      editId,
      name: name ?? `${page.data.meta.name} 副本`,
      parentId: page.data.meta.parentId,
      runtimeType: resolvePageRuntimeType(page.data.meta),
      code: page.data.files.code,
      schema: page.data.files.schema,
      prototypeHtml: page.data.files.prototypeHtml,
      prototypeCss: page.data.files.prototypeCss,
      prototypeMeta: page.data.files.prototypeMeta,
    }, actor);
  }

  updatePage(input: PageUpdateInput, actor = this.defaultActor()): ProjectAdminResult<PageDetail> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const pageIndex = tree.pages.findIndex((page) => page.id === input.pageId);
    if (pageIndex === -1) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    const current = tree.pages[pageIndex];
    const usedRouteKeys = new Set(
      tree.pages
        .filter((page) => page.id !== input.pageId)
        .map((page) => page.routeKey)
        .filter(Boolean) as string[],
    );
    const nextMeta: DemoPageMeta = {
      ...current,
      name: input.name?.trim() || current.name,
      routeKey: input.routeKey
        ? makeUniqueRouteKey(input.routeKey, usedRouteKeys)
        : current.routeKey ?? makeUniqueRouteKey(input.name ?? current.name, usedRouteKeys),
      parentId: input.parentId !== undefined ? input.parentId : current.parentId,
      order: input.order ?? current.order,
    };
    if (nextMeta.parentId && !tree.folders.some((folder) => folder.id === nextMeta.parentId)) {
      return fail("FOLDER_NOT_FOUND", "父文件夹不存在");
    }
    const validation = this.validateSchemaPair(
      this.readProjectConfig(workspacePath),
      input.schema ?? this.readPageFiles(workspacePath, input.pageId)?.schema,
    );
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "页面 Schema 校验失败", { validation });
    const diff: DiffSummary = { updated: [] };
    if (input.code !== undefined) diff.updated?.push(`page:${input.pageId}:code`);
    if (input.schema !== undefined) diff.updated?.push(`page:${input.pageId}:schema`);
    if (input.name !== undefined || input.routeKey !== undefined || input.parentId !== undefined || input.order !== undefined) {
      diff.updated?.push(`page:${input.pageId}:meta`);
    }
    if (!input.dryRun) {
      const demoDir = this.pageDir(workspacePath, input.pageId);
      if (input.code !== undefined) {
        fs.writeFileSync(path.join(demoDir, "index.tsx"), input.code, "utf-8");
      }
      if (input.schema !== undefined) {
        fs.writeFileSync(path.join(demoDir, "config.schema.json"), input.schema, "utf-8");
      }
      const pages = [...tree.pages];
      pages[pageIndex] = nextMeta;
      this.writeWorkspaceTree(workspacePath, { ...tree, pages });
    }
    const auditId = input.dryRun
      ? undefined
      : this.audit("page_update", actor, "L1", true, {
          projectId: transaction.data.projectId,
          resourceId: input.pageId,
          diffSummary: diff,
          validation,
        });
    const files = this.readPageFiles(workspacePath, input.pageId) ?? {
      code: input.code ?? "",
      schema: input.schema ?? "",
    };
    const runtimeValidation = input.code !== undefined
      ? this.validatePageFilesRuntime(input.pageId, resolvePageRuntimeType(nextMeta), files)
      : undefined;
    return ok(
      { meta: nextMeta, files },
      { auditId, diffSummary: diff, validation, runtimeValidation },
    );
  }

  updatePrototypePage(
    input: PageUpdatePrototypeInput,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageDetail> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const page = tree.pages.find((item) => item.id === input.pageId);
    if (!page) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    if (resolvePageRuntimeType(page) !== "prototype-html-css") {
      return fail("INVALID_REQUEST", "当前页面不是 HTML/CSS 原型页");
    }
    const currentFiles = this.readPageFiles(workspacePath, input.pageId);
    if (!currentFiles) return fail("FILE_READ_ERROR", "页面文件不存在");
    const nextFiles: DemoFiles = {
      ...currentFiles,
      prototypeHtml: input.prototypeHtml ?? currentFiles.prototypeHtml ?? DEFAULT_PROTOTYPE_HTML,
      prototypeCss: input.prototypeCss ?? currentFiles.prototypeCss ?? DEFAULT_PROTOTYPE_CSS,
      prototypeMeta: input.prototypeMeta ?? currentFiles.prototypeMeta ?? DEFAULT_PROTOTYPE_META,
    };
    const runtimeValidation = this.validatePageFilesRuntime(
      input.pageId,
      "prototype-html-css",
      nextFiles,
    );
    if (!runtimeValidation.ok) {
      return fail("VALIDATION_BLOCKED", "原型页校验失败", {
        validation: this.runtimeToValidationResult(runtimeValidation),
        runtimeValidation,
      });
    }
    const diff: DiffSummary = { updated: [] };
    if (input.prototypeHtml !== undefined) diff.updated?.push(`page:${input.pageId}:prototypeHtml`);
    if (input.prototypeCss !== undefined) diff.updated?.push(`page:${input.pageId}:prototypeCss`);
    if (input.prototypeMeta !== undefined) diff.updated?.push(`page:${input.pageId}:prototypeMeta`);

    if (!input.dryRun) {
      const demoDir = this.pageDir(workspacePath, input.pageId);
      ensureDir(demoDir);
      if (input.prototypeHtml !== undefined) {
        fs.writeFileSync(path.join(demoDir, "prototype.html"), input.prototypeHtml, "utf-8");
      }
      if (input.prototypeCss !== undefined) {
        fs.writeFileSync(path.join(demoDir, "prototype.css"), input.prototypeCss, "utf-8");
      }
      if (input.prototypeMeta !== undefined) {
        writeJsonFile(path.join(demoDir, "prototype.meta.json"), input.prototypeMeta);
      }
    }

    const files = input.dryRun
      ? nextFiles
      : this.readPageFiles(workspacePath, input.pageId) ?? nextFiles;
    const auditId = input.dryRun
      ? undefined
      : this.audit("page_update_prototype", actor, "L1", true, {
          projectId: transaction.data.projectId,
          resourceId: input.pageId,
          diffSummary: diff,
        });
    return ok(
      { meta: page, files },
      { auditId, diffSummary: diff, runtimeValidation },
    );
  }

  switchPageRuntime(
    input: PageSwitchRuntimeInput,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageDetail> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const pageIndex = tree.pages.findIndex((page) => page.id === input.pageId);
    if (pageIndex === -1) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    const targetRuntimeType = input.targetRuntimeType === "prototype-html-css"
      ? "prototype-html-css"
      : input.targetRuntimeType === "high-fidelity-react"
        ? "high-fidelity-react"
        : undefined;
    if (!targetRuntimeType) {
      return fail("INVALID_REQUEST", "目标页面类型不合法");
    }

    const current = tree.pages[pageIndex];
    const currentRuntimeType = resolvePageRuntimeType(current);
    const currentFiles = this.readPageFiles(workspacePath, input.pageId);
    if (!currentFiles) return fail("FILE_READ_ERROR", "页面文件不存在");

    const nextFiles: DemoFiles = {
      ...currentFiles,
      code: input.code ?? currentFiles.code ?? DEFAULT_DEMO_CODE,
      schema: input.schema ?? currentFiles.schema ?? DEFAULT_DEMO_SCHEMA,
      prototypeHtml: input.prototypeHtml ?? currentFiles.prototypeHtml ?? DEFAULT_PROTOTYPE_HTML,
      prototypeCss: input.prototypeCss ?? currentFiles.prototypeCss ?? DEFAULT_PROTOTYPE_CSS,
      prototypeMeta: input.prototypeMeta ?? currentFiles.prototypeMeta ?? DEFAULT_PROTOTYPE_META,
    };
    const validation = this.validateSchemaPair(
      this.readProjectConfig(workspacePath),
      nextFiles.schema,
    );
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "页面 Schema 校验失败", { validation });

    const runtimeValidation = this.validatePageFilesRuntime(
      input.pageId,
      targetRuntimeType,
      nextFiles,
    );
    if (!runtimeValidation.ok) {
      return fail("VALIDATION_BLOCKED", "页面类型切换校验失败，已保留原页面内容", {
        validation: this.runtimeToValidationResult(runtimeValidation),
        runtimeValidation,
      });
    }

    const nextMeta: DemoPageMeta = {
      ...current,
      runtimeType: targetRuntimeType === "prototype-html-css" ? "prototype-html-css" : undefined,
    };
    const diff: DiffSummary = {
      updated: [
        `page:${input.pageId}:runtimeType:${currentRuntimeType}->${targetRuntimeType}`,
      ],
      notes: input.reason ? [input.reason] : undefined,
    };
    if (targetRuntimeType === "prototype-html-css") {
      diff.updated?.push(`page:${input.pageId}:prototypeHtml`, `page:${input.pageId}:prototypeCss`);
      if (input.prototypeMeta !== undefined) diff.updated?.push(`page:${input.pageId}:prototypeMeta`);
    } else {
      diff.updated?.push(`page:${input.pageId}:code`);
    }
    if (input.schema !== undefined) diff.updated?.push(`page:${input.pageId}:schema`);

    if (!input.dryRun) {
      const demoDir = this.pageDir(workspacePath, input.pageId);
      ensureDir(demoDir);
      if (targetRuntimeType === "prototype-html-css") {
        fs.writeFileSync(path.join(demoDir, "prototype.html"), nextFiles.prototypeHtml ?? DEFAULT_PROTOTYPE_HTML, "utf-8");
        fs.writeFileSync(path.join(demoDir, "prototype.css"), nextFiles.prototypeCss ?? DEFAULT_PROTOTYPE_CSS, "utf-8");
        writeJsonFile(path.join(demoDir, "prototype.meta.json"), nextFiles.prototypeMeta ?? DEFAULT_PROTOTYPE_META);
      } else {
        fs.writeFileSync(path.join(demoDir, "index.tsx"), nextFiles.code || DEFAULT_DEMO_CODE, "utf-8");
      }
      if (input.schema !== undefined) {
        fs.writeFileSync(path.join(demoDir, "config.schema.json"), nextFiles.schema, "utf-8");
      }
      const pages = [...tree.pages];
      pages[pageIndex] = nextMeta;
      this.writeWorkspaceTree(workspacePath, { ...tree, pages });
    }

    const files = input.dryRun
      ? nextFiles
      : this.readPageFiles(workspacePath, input.pageId) ?? nextFiles;
    const auditId = input.dryRun
      ? undefined
      : this.audit("page_switch_runtime", actor, "L2", true, {
          projectId: transaction.data.projectId,
          resourceId: input.pageId,
          diffSummary: diff,
        });
    return ok(
      { meta: nextMeta, files },
      { auditId, diffSummary: diff, validation, runtimeValidation },
    );
  }

  createPageVersion(
    input: PageVersionCreateInput,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageVersionInfo> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const access = this.requireProjectAccess(input.projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    if (this.isProjectLocked(input.projectId) && actor.role !== "admin") {
      return fail("PROJECT_LOCKED", "项目已被管理员锁定，当前不能创建页面版本");
    }

    const project = this.readProject(input.projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");

    let sourceWorkspacePath = this.projectWorkspacePath(input.projectId);
    if (input.editId) {
      const transaction = this.requireEditable(input.editId);
      if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
      if (transaction.data.projectId !== input.projectId) {
        return fail("INVALID_REQUEST", "editId 与 projectId 不匹配");
      }
      sourceWorkspacePath = transaction.data.workspacePath;
    }

    const page =
      this.findPage(sourceWorkspacePath, input.pageId) ??
      this.findPage(this.projectWorkspacePath(input.projectId), input.pageId);
    if (!page) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");

    const files = this.readPageFiles(sourceWorkspacePath, input.pageId);
    if (!files) return fail("FILE_READ_ERROR", "页面文件不存在");

    const validation = this.validateSchemaPair(this.readProjectConfig(sourceWorkspacePath), files.schema);
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "页面 Schema 校验失败", { validation });
    const runtimeValidation = this.validatePageFilesRuntime(
      input.pageId,
      resolvePageRuntimeType(page),
      files,
    );
    if (!runtimeValidation.ok) {
      return fail("VALIDATION_BLOCKED", "页面运行契约校验失败，不能创建版本", {
        validation: this.runtimeToValidationResult(runtimeValidation),
        runtimeValidation,
      });
    }

    const savedAt = Date.now();
    const versionId = this.generateVersionId(project);
    const snapshotPath = path.join(this.snapshotsDir, input.projectId, "pages", input.pageId, versionId);
    fs.rmSync(snapshotPath, { recursive: true, force: true });
    ensureDir(snapshotPath);
    if (resolvePageRuntimeType(page) === "prototype-html-css") {
      fs.writeFileSync(path.join(snapshotPath, "prototype.html"), files.prototypeHtml ?? "", "utf-8");
      fs.writeFileSync(path.join(snapshotPath, "prototype.css"), files.prototypeCss ?? "", "utf-8");
      writeJsonFile(path.join(snapshotPath, "prototype.meta.json"), files.prototypeMeta ?? DEFAULT_PROTOTYPE_META);
    } else {
      fs.writeFileSync(path.join(snapshotPath, "index.tsx"), files.code, "utf-8");
    }
    fs.writeFileSync(path.join(snapshotPath, "config.schema.json"), files.schema, "utf-8");

    const version: PageVersionInfo = {
      versionId,
      type: "named_version",
      demoId: input.pageId,
      demoName: page.name,
      savedAt,
      savedBy: actor.name,
      sessionId: input.editId ?? `page-${input.pageId}`,
      snapshotPath,
      fileCount: 2,
      note: input.note,
    };

    const existingVersions = project.pageVersions?.[input.pageId] ?? [];
    const overflow = Math.max(existingVersions.length + 1 - MAX_VERSIONS_KEEP, 0);
    for (const stale of existingVersions.slice(0, overflow)) {
      fs.rmSync(stale.snapshotPath, { recursive: true, force: true });
    }
    const nextVersions = [...existingVersions.slice(overflow), version];
    const updatedProject: Project = {
      ...project,
      pageVersions: {
        ...(project.pageVersions ?? {}),
        [input.pageId]: nextVersions,
      },
      updatedAt: savedAt,
    };
    this.writeProject(input.projectId, updatedProject);

    const auditId = this.audit("page_create_version", actor, "L2", true, {
      projectId: input.projectId,
      resourceId: input.pageId,
      diffSummary: { created: [`page-version:${input.pageId}:${versionId}`] },
      validation,
    });
    return ok(version, {
      auditId,
      diffSummary: { created: [`page-version:${input.pageId}:${versionId}`] },
      validation,
      runtimeValidation,
      nextActions: ["page_version_list", "page_version_get"],
    });
  }

  deletePagePreview(editId: string, pageIds: string[]): ProjectAdminResult<PreviewPlan> {
    if (pageIds.length > this.maxBatchSize) {
      return fail("BATCH_LIMIT_EXCEEDED", `批量删除页面不能超过 ${this.maxBatchSize} 个`);
    }
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    const missing = pageIds.filter((id) => !tree.pages.some((page) => page.id === id));
    if (missing.length > 0) return fail("DEMO_PAGE_NOT_FOUND", `页面不存在: ${missing.join(", ")}`);
    return ok(
      this.createPlan("page_delete", editId, pageIds.map((id) => `删除页面 ${id}`), {
        pageIds,
      }),
      { diffSummary: { deleted: pageIds.map((id) => `page:${id}`) } },
    );
  }

  deletePageExecute(
    planId: string,
    confirmToken: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ deleted: string[] }> {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "page_delete") return fail("PLAN_NOT_FOUND", "页面删除计划不存在");
    if (plan.confirmToken !== confirmToken) return fail("CONFIRMATION_REQUIRED", "确认 token 不匹配");
    const editId = plan.resourceId;
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const pageIds = Array.isArray(plan.extra?.pageIds)
      ? plan.extra.pageIds.filter((id): id is string => typeof id === "string")
      : [];
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    for (const pageId of pageIds) {
      fs.rmSync(this.pageDir(transaction.data.workspacePath, pageId), { recursive: true, force: true });
    }
    this.writeWorkspaceTree(transaction.data.workspacePath, {
      ...tree,
      pages: tree.pages.filter((page) => !pageIds.includes(page.id)),
    });
    const diffSummary = { deleted: pageIds.map((id) => `page:${id}`) };
    const auditId = this.audit("page_delete_execute", actor, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: editId,
      diffSummary,
    });
    return ok({ deleted: pageIds }, { auditId, diffSummary });
  }

  reorderPages(
    editId: string,
    input: { pages: Array<{ id: string; order: number; parentId: string | null }>; folders?: Array<{ id: string; order: number; parentId: string | null }> },
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ pages: DemoPageMeta[]; folders: DemoFolderMeta[] }> {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    if (input.pages.length > this.maxBatchSize) {
      return fail("BATCH_LIMIT_EXCEEDED", `批量排序页面不能超过 ${this.maxBatchSize} 个`);
    }
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folders = input.folders
      ? tree.folders.map((folder) => {
          const patch = input.folders?.find((item) => item.id === folder.id);
          return patch ? { ...folder, order: patch.order, parentId: patch.parentId } : folder;
        })
      : tree.folders;
    const pages = tree.pages.map((page) => {
      const patch = input.pages.find((item) => item.id === page.id);
      return patch ? { ...page, order: patch.order, parentId: patch.parentId } : page;
    });
    const validation = this.validateTree({ pages, folders });
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "页面树校验失败", { validation });
    this.writeWorkspaceTree(transaction.data.workspacePath, { pages, folders });
    const auditId = this.audit("page_reorder", actor, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: editId,
      diffSummary: { updated: ["workspace-tree"] },
      validation,
    });
    return ok({ pages: sortPages(pages), folders }, { auditId, diffSummary: { updated: ["workspace-tree"] }, validation });
  }

  restorePageVersion(
    projectId: string,
    pageId: string,
    versionId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<PageRestoreResult> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有写权限");
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    if (this.isProjectLocked(projectId) && actor.role !== "admin") {
      return fail("PROJECT_LOCKED", "项目已被管理员锁定，当前不能恢复页面版本");
    }
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const workspacePath = this.projectWorkspacePath(projectId);
    const page = this.findPage(workspacePath, pageId);
    if (!page) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");

    const targetVersion = project.pageVersions?.[pageId]?.find((version) => version.versionId === versionId);
    if (!targetVersion) return fail("VERSION_NOT_FOUND", `页面版本 ${versionId} 不存在`);
    const files = this.readPageVersionFiles(project, pageId, versionId);
    if (!files) return fail("VERSION_SNAPSHOT_MISSING", `页面版本快照已丢失: ${versionId}`);

    const validation = this.validateSchemaPair(this.readProjectConfig(workspacePath), files.schema);
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "恢复版本的页面 Schema 校验失败", { validation });

    const demoDir = this.pageDir(workspacePath, pageId);
    if (resolvePageRuntimeType(page) === "prototype-html-css") {
      fs.writeFileSync(path.join(demoDir, "prototype.html"), files.prototypeHtml ?? "", "utf-8");
      fs.writeFileSync(path.join(demoDir, "prototype.css"), files.prototypeCss ?? "", "utf-8");
      writeJsonFile(path.join(demoDir, "prototype.meta.json"), files.prototypeMeta ?? DEFAULT_PROTOTYPE_META);
    } else {
      fs.writeFileSync(path.join(demoDir, "index.tsx"), files.code, "utf-8");
    }
    fs.writeFileSync(path.join(demoDir, "config.schema.json"), files.schema, "utf-8");

    const restoredAt = Date.now();
    const version = this.createProjectVersion(
      project,
      workspacePath,
      actor.name,
      `restore-page-${pageId}-${versionId}`,
      `从页面 ${page.name} 的历史版本 ${versionId} 恢复`,
      "restore_snapshot",
    );
    const tree = this.readWorkspaceTree(workspacePath);
    const updatedProject: Project = {
      ...project,
      workspacePath,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: this.compactProjectVersions([...project.versions, version]),
      updatedAt: restoredAt,
    };
    this.writeProject(projectId, updatedProject);
    const auditId = this.audit("page_restore_version", actor, "L2", true, {
      projectId,
      resourceId: pageId,
      diffSummary: {
        updated: [`demos/${pageId}/index.tsx`, `demos/${pageId}/config.schema.json`],
        notes: [`生成版本 ${version.versionId}`],
      },
      validation,
    });
    return ok(
      {
        success: true,
        newVersionId: version.versionId,
        restoredAt,
        files,
      },
      {
        auditId,
        diffSummary: {
          updated: [`demos/${pageId}/index.tsx`, `demos/${pageId}/config.schema.json`],
          notes: [`生成版本 ${version.versionId}`],
        },
        validation,
        nextActions: ["project_get"],
      },
    );
  }

  createFolder(
    editId: string,
    name: string,
    parentId: string | null = null,
    actor = this.defaultActor(),
    options: { folderId?: string; order?: number; dryRun?: boolean } = {},
  ): ProjectAdminResult<DemoFolderMeta> {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folderId = options.folderId ? safeId(options.folderId, "folder") : nowId("folder");
    if (tree.folders.some((folder) => folder.id === folderId)) {
      return fail("FOLDER_ID_CONFLICT", `文件夹 id 已存在: ${folderId}`);
    }
    const folder: DemoFolderMeta = {
      id: folderId,
      name: name.trim() || "未命名文件夹",
      parentId,
      order: options.order ?? tree.folders.length,
    };
    const nextTree = { ...tree, folders: [...tree.folders, folder] };
    const validation = this.validateTree(nextTree);
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "文件夹层级校验失败", { validation });
    if (options.dryRun) return ok(folder, { diffSummary: { created: [`folder:${folder.id}`] }, validation });
    this.writeWorkspaceTree(transaction.data.workspacePath, nextTree);
    const auditId = this.audit("folder_create", actor, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: folder.id,
      diffSummary: { created: [`folder:${folder.id}`] },
      validation,
    });
    return ok(folder, { auditId, diffSummary: { created: [`folder:${folder.id}`] }, validation });
  }

  updateFolder(input: FolderUpdateInput, actor = this.defaultActor()): ProjectAdminResult<DemoFolderMeta> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folderIndex = tree.folders.findIndex((folder) => folder.id === input.folderId);
    if (folderIndex === -1) return fail("FOLDER_NOT_FOUND", "文件夹不存在");
    const nextFolder: DemoFolderMeta = {
      ...tree.folders[folderIndex],
      name: input.name?.trim() || tree.folders[folderIndex].name,
      parentId: input.parentId !== undefined ? input.parentId : tree.folders[folderIndex].parentId,
      order: input.order ?? tree.folders[folderIndex].order,
    };
    const folders = [...tree.folders];
    folders[folderIndex] = nextFolder;
    const validation = this.validateTree({ ...tree, folders });
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "文件夹层级校验失败", { validation });
    if (!input.dryRun) this.writeWorkspaceTree(transaction.data.workspacePath, { ...tree, folders });
    const auditId = input.dryRun
      ? undefined
      : this.audit("folder_update", actor, "L2", true, {
          projectId: transaction.data.projectId,
          resourceId: input.folderId,
          diffSummary: { updated: [`folder:${input.folderId}`] },
          validation,
        });
    return ok(nextFolder, { auditId, diffSummary: { updated: [`folder:${input.folderId}`] }, validation });
  }

  deleteFolderPreview(editId: string, folderId: string): ProjectAdminResult<PreviewPlan> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    const folder = tree.folders.find((item) => item.id === folderId);
    if (!folder) return fail("FOLDER_NOT_FOUND", "文件夹不存在");
    const childPages = tree.pages.filter((page) => page.parentId === folderId);
    return ok(
      this.createPlan("folder_delete", editId, [
        `删除文件夹 ${folder.name}`,
        `影响 ${childPages.length} 个直接页面`,
      ], { folderId }),
      { diffSummary: { deleted: [`folder:${folderId}`] } },
    );
  }

  deleteFolderExecute(
    planId: string,
    confirmToken: string,
    strategy: "move_to_root" | "delete_contents",
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ deletedFolderId: string; affectedPages: string[] }> {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "folder_delete") return fail("PLAN_NOT_FOUND", "文件夹删除计划不存在");
    if (plan.confirmToken !== confirmToken) return fail("CONFIRMATION_REQUIRED", "确认 token 不匹配");
    const folderId = typeof plan.extra?.folderId === "string" ? plan.extra.folderId : "";
    const transaction = this.requireEditable(plan.resourceId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const affectedPages = tree.pages.filter((page) => page.parentId === folderId).map((page) => page.id);
    const pages =
      strategy === "delete_contents"
        ? tree.pages.filter((page) => page.parentId !== folderId)
        : tree.pages.map((page) => (page.parentId === folderId ? { ...page, parentId: null } : page));
    if (strategy === "delete_contents") {
      for (const pageId of affectedPages) {
        fs.rmSync(this.pageDir(transaction.data.workspacePath, pageId), { recursive: true, force: true });
      }
    }
    this.writeWorkspaceTree(transaction.data.workspacePath, {
      pages,
      folders: tree.folders
        .filter((folder) => folder.id !== folderId)
        .map((folder) => (folder.parentId === folderId ? { ...folder, parentId: null } : folder)),
    });
    const auditId = this.audit("folder_delete_execute", actor, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: folderId,
      diffSummary: { deleted: [`folder:${folderId}`], updated: affectedPages.map((id) => `page:${id}`) },
    });
    return ok({ deletedFolderId: folderId, affectedPages }, { auditId });
  }

  getProjectConfig(editId: string): ProjectAdminResult<{ schema?: string; exists: boolean }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const schema = this.readProjectConfig(transaction.workspacePath);
    return ok({ schema: schema ?? undefined, exists: schema !== null });
  }

  setProjectConfig(input: ConfigUpdateInput, actor = this.defaultActor()): ProjectAdminResult<{ schema?: string; exists: boolean }> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    if (input.schema === undefined) return fail("INVALID_REQUEST", "schema 参数必填");
    const validation = this.validateProjectConfigAgainstPages(transaction.data.workspacePath, input.schema);
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "项目级配置校验失败", { validation });
    if (!input.dryRun) {
      fs.writeFileSync(path.join(transaction.data.workspacePath, PROJECT_CONFIG_FILENAME), input.schema, "utf-8");
    }
    const auditId = input.dryRun
      ? undefined
      : this.audit("config_set_project_schema", actor, "L1", true, {
          projectId: transaction.data.projectId,
          resourceId: input.editId,
          diffSummary: { updated: [PROJECT_CONFIG_FILENAME] },
          validation,
        });
    return ok({ schema: input.schema, exists: true }, { auditId, validation, diffSummary: { updated: [PROJECT_CONFIG_FILENAME] } });
  }

  deleteProjectConfig(editId: string, dryRun = false, actor = this.defaultActor()): ProjectAdminResult<{ deleted: boolean; affectedPages: string[] }> {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const configPath = path.join(transaction.data.workspacePath, PROJECT_CONFIG_FILENAME);
    if (!dryRun && fs.existsSync(configPath)) fs.rmSync(configPath);
    const affectedPages = tree.pages.map((page) => page.id);
    const auditId = dryRun
      ? undefined
      : this.audit("config_delete_project_schema", actor, "L2", true, {
          projectId: transaction.data.projectId,
          resourceId: editId,
          diffSummary: { deleted: [PROJECT_CONFIG_FILENAME], updated: affectedPages.map((id) => `page:${id}`) },
        });
    return ok({ deleted: fs.existsSync(configPath) ? false : !dryRun, affectedPages }, { auditId });
  }

  validatePageSchema(editId: string, pageId: string): ProjectAdminResult<ValidationResult> {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    const transaction = this.readEdit(editId);
    const validation = this.validateSchemaPair(
      transaction ? this.readProjectConfig(transaction.workspacePath) : null,
      page.data.files.schema,
    );
    return ok(validation, { validation });
  }

  validateMergedSchema(editId: string): ProjectAdminResult<ValidationResult> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const validation = this.validateWorkspace(transaction.workspacePath);
    return ok(validation, { validation });
  }

  generateSchemaFromCode(editId: string, pageId: string): ProjectAdminResult<{ schema: string; applied: false }> {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    const props = [...page.data.files.code.matchAll(/props\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]);
    const uniqueProps = [...new Set(props)];
    const schema = JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: Object.fromEntries(
          uniqueProps.map((prop) => [prop, { type: "string", title: prop, default: "" }]),
        ),
      },
      null,
      2,
    );
    return ok({ schema, applied: false }, { warnings: ["自动生成结果仅作为候选，未覆盖页面 Schema"] });
  }

  applyVisualPatch(editId: string, pageId: string, patch: Record<string, unknown>): ProjectAdminResult<{ patch: Record<string, unknown>; applied: false }> {
    const page = this.getPage(editId, pageId);
    if (!page.ok) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    return ok(
      { patch, applied: false },
      { warnings: ["当前服务仅返回可视化补丁候选；实际配置值写入仍由 Web 配置面板处理"] },
    );
  }

  listAssets(editId: string): ProjectAdminResult<{ assets: AssetSummary[] }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const assets: AssetSummary[] = [];
    for (const file of this.walkFiles(transaction.workspacePath)) {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) {
        const relative = path.relative(transaction.workspacePath, file);
        assets.push({
          path: relative,
          size: fs.statSync(file).size,
          references: this.findReferences(transaction.workspacePath, relative),
        });
      }
    }
    return ok({ assets });
  }

  uploadAsset(input: AssetUploadInput, actor = this.defaultActor()): ProjectAdminResult<AssetSummary> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const validation = this.validateAssetInput(input);
    if (!validation.ok) return fail("VALIDATION_BLOCKED", "资产校验失败", { validation });
    const buffer = Buffer.from(input.dataBase64, "base64");
    const filename = this.generateAssetFilename(input.filename);
    const relativePath = input.targetPath
      ? this.safeRelativeAssetPath(input.targetPath)
      : `assets/images/${filename}`;
    if (input.targetPath && relativePath.split("/")[0] !== "assets") {
      return fail("INVALID_ASSET_PATH", "targetPath 必须位于 assets/ 目录下");
    }
    const targetPath = path.join(transaction.data.workspacePath, relativePath);
    const existed = fs.existsSync(targetPath);
    const summary: AssetSummary = {
      path: relativePath,
      size: buffer.length,
      references: [],
    };
    if (input.dryRun) {
      return ok(summary, { diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] }, validation });
    }
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, buffer);
    const auditId = this.audit("asset_upload", actor, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: relativePath,
      diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] },
      validation,
    });
    return ok(summary, { auditId, diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] }, validation });
  }

  deleteAssetPreview(editId: string, assetPath: string): ProjectAdminResult<PreviewPlan> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const relativePath = this.safeRelativeAssetPath(assetPath);
    const fullPath = path.join(transaction.workspacePath, relativePath);
    if (!fs.existsSync(fullPath)) return fail("ASSET_NOT_FOUND", "资产不存在");
    const references = this.findReferences(transaction.workspacePath, relativePath);
    return ok(
      this.createPlan("asset_delete", editId, [
        `删除资产 ${relativePath}`,
        `影响 ${references.length} 个引用位置`,
      ], { assetPath: relativePath }),
      {
        warnings: references.length > 0 ? ["资产仍被引用，删除前建议先替换引用"] : undefined,
        diffSummary: { deleted: [relativePath], updated: references },
      },
    );
  }

  deleteAssetExecute(
    planId: string,
    confirmToken: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<{ deleted: string }> {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "asset_delete") return fail("PLAN_NOT_FOUND", "资产删除计划不存在");
    if (plan.confirmToken !== confirmToken) return fail("CONFIRMATION_REQUIRED", "确认 token 不匹配");
    const transaction = this.requireEditable(plan.resourceId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const assetPath = typeof plan.extra?.assetPath === "string" ? plan.extra.assetPath : "";
    const relativePath = this.safeRelativeAssetPath(assetPath);
    fs.rmSync(path.join(transaction.data.workspacePath, relativePath), { force: true });
    const auditId = this.audit("asset_delete_execute", actor, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: relativePath,
      diffSummary: { deleted: [relativePath] },
    });
    return ok({ deleted: relativePath }, { auditId, diffSummary: { deleted: [relativePath] } });
  }

  replaceAsset(input: AssetReplaceInput, actor = this.defaultActor()): ProjectAdminResult<{
    oldPath: string;
    newAsset: AssetSummary;
    updatedReferences: string[];
  }> {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const oldPath = this.safeRelativeAssetPath(input.oldPath);
    const upload = this.uploadAsset(input, actor);
    if (!upload.ok || !upload.data) {
      return fail(upload.error?.code ?? "UPLOAD_FAILED", upload.error?.message ?? "资产上传失败", {
        warnings: upload.warnings,
        validation: upload.validation,
      });
    }
    if (input.dryRun) {
      return ok(
        { oldPath, newAsset: upload.data, updatedReferences: [] },
        {
          warnings: upload.warnings,
          diffSummary: upload.diffSummary,
          validation: upload.validation,
        },
      );
    }
    const updatedReferences = oldPath === upload.data.path
      ? []
      : this.replaceReferences(
          transaction.data.workspacePath,
          oldPath,
          upload.data.path,
        );
    const auditId = this.audit("asset_replace", actor, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: oldPath,
      diffSummary: { created: [upload.data.path], updated: updatedReferences },
    });
    return ok(
      { oldPath, newAsset: upload.data, updatedReferences },
      { auditId, diffSummary: { created: [upload.data.path], updated: updatedReferences } },
    );
  }

  previewCompile(editId: string, pageId?: string): ProjectAdminResult<RuntimeValidationResult> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const validation = this.validateWorkspaceRuntime(transaction.workspacePath, pageId);
    return ok(validation, {
      validation: this.runtimeToValidationResult(validation),
      warnings: ["CLI 已执行创作端页面源码契约校验；浏览器截图仍需通过 author-site / screenshot-service 验证"],
    });
  }

  validatePageRuntime(editId: string, pageId: string): ProjectAdminResult<RuntimeValidationResult> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    return ok(this.validateWorkspaceRuntime(transaction.workspacePath, pageId));
  }

  validateWorkspacePathRuntime(workspacePath: string, pageId?: string): ProjectAdminResult<RuntimeValidationResult> {
    return ok(this.validateWorkspaceRuntime(workspacePath, pageId));
  }

  validateDemoPageFilesRuntime(
    pageId: string,
    runtimeType: DemoPageRuntimeType,
    files: DemoFiles,
  ): RuntimeValidationResult {
    return this.validatePageFilesRuntime(pageId, runtimeType, files);
  }

  validateProjectRuntime(
    projectId: string,
    actor = this.defaultActor(),
  ): ProjectAdminResult<RuntimeValidationResult> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    return ok(this.validateWorkspaceRuntime(this.projectWorkspacePath(projectId)));
  }

  previewRender(editId: string, pageId: string): ProjectAdminResult<{ url?: string; html?: string }> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    const page = this.findPage(transaction.workspacePath, pageId);
    if (!page) return fail("DEMO_PAGE_NOT_FOUND", "页面不存在");
    return ok(
      {
        url: `/demo/${transaction.projectId}/edit?page=${encodeURIComponent(pageId)}`,
      },
      { warnings: ["返回 Web 编辑页预览入口；CLI 不直接启动 author-site"] },
    );
  }

  async previewScreenshot(): Promise<ProjectAdminResult<{ available: boolean; reason?: string; serviceUrl: string }>> {
    const health = await this.previewHealthcheck();
    const screenshotService = health.data?.screenshotService;
    return ok(
      {
        available: screenshotService === "ok",
        reason: screenshotService === "ok" ? undefined : "截图服务未就绪，不能直接捕获截图",
        serviceUrl: this.getScreenshotServiceUrl(),
      },
      {
        warnings:
          screenshotService === "ok"
            ? ["请通过 author-site /api/screenshots/generate 触发具体截图任务"]
            : ["启动 screenshot-service 后可通过 Web API 触发截图"],
      },
    );
  }

  previewLogs(): ProjectAdminResult<{ logs: string[] }> {
    return ok({ logs: [] }, { warnings: ["当前没有持久化的预览控制台日志"] });
  }

  async previewHealthcheck(): Promise<ProjectAdminResult<{ core: true; screenshotService: "ok" | "unavailable"; authorSite: "not_checked"; serviceUrl: string }>> {
    const serviceUrl = this.getScreenshotServiceUrl();
    let screenshotService: "ok" | "unavailable" = "unavailable";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${serviceUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      screenshotService = response.ok ? "ok" : "unavailable";
    } catch {
      screenshotService = "unavailable";
    }
    return ok({ core: true, screenshotService, authorSite: "not_checked", serviceUrl });
  }

  publishCheck(projectId: string, actor = this.defaultActor()): ProjectAdminResult<ValidationResult> {
    const detail = this.getProject(projectId, actor);
    if (!detail.ok || !detail.data) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const validation = this.validateWorkspace(this.projectWorkspacePath(projectId));
    const runtimeValidation = this.validateWorkspaceRuntime(this.projectWorkspacePath(projectId));
    const issues = [
      ...validation.issues,
      ...this.runtimeToValidationResult(runtimeValidation).issues,
    ];
    if (detail.data.pages.length === 0) {
      issues.push({ code: "NO_CONTENT_TO_PUBLISH", message: "项目没有可发布页面", severity: "blocking" });
    }
    const result = { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
    return ok(result, { validation: result, runtimeValidation });
  }

  private viewerBaseUrl(): string {
    return getViewerBaseUrl();
  }

  private buildPublishStatus(
    projectId: string,
    input: {
      published: boolean;
      publishedVersion?: string;
      publishedAt?: number;
      artifactPath?: string;
    },
  ): PublishStatus {
    const project = this.readProject(projectId);
    const pages = project?.demoPages ?? [];
    const artifactPath = input.artifactPath ?? path.join(this.publishedDir, projectId);
    const artifactExists = fs.existsSync(artifactPath);
    const publishedProjectPath = path.join(artifactPath, "project.json");
    const statusPath = path.join(artifactPath, "project-admin-status.json");
    const publishedProject = fs.existsSync(publishedProjectPath)
      ? readJsonFile<{ demoPages?: Array<{ id: string; compiledJsPath?: string; schemaPath?: string; iframeHtmlPath?: string }> }>(publishedProjectPath)
      : null;
    const publishedPages = publishedProject?.demoPages ?? [];
    const hasStatusArtifact = fs.existsSync(statusPath) || (input.published && Boolean(input.artifactPath));
    const entryPaths = publishedPages.length > 0
      ? [
          "project.json",
          ...publishedPages.flatMap((page) => [
            page.compiledJsPath,
            page.iframeHtmlPath,
            page.schemaPath,
          ].filter((entryPath): entryPath is string => Boolean(entryPath))),
        ]
      : hasStatusArtifact
        ? ["project-admin-status.json"]
        : [];
    const viewerBaseUrl = this.viewerBaseUrl();
    const dataBase = viewerBaseUrl ? `${viewerBaseUrl}/data/${projectId}` : `/data/${projectId}`;
    const viewerUrl = viewerBaseUrl ? `${viewerBaseUrl}/projects/${projectId}` : `/projects/${projectId}`;
    const hasFormalArtifact = Boolean(publishedProject);
    return {
      projectId,
      published: input.published,
      publishedVersion: input.publishedVersion,
      publishedAt: input.publishedAt,
      artifactPath: artifactExists ? artifactPath : input.artifactPath,
      artifactSummary: {
        demoCount: publishedPages.length || pages.length,
        projectJsonPath: hasFormalArtifact ? "project.json" : undefined,
        indexJsonPath: fs.existsSync(path.join(this.publishedDir, "projects-index.json")) ? "../projects-index.json" : undefined,
        entryPaths,
      },
      accessUrls: {
        viewerUrl,
        dataUrl: hasFormalArtifact ? `${dataBase}/project.json` : undefined,
        embedUrls: (publishedPages.length > 0 ? publishedPages : pages).map((page) => ({
          pageId: page.id,
          url: `${dataBase}/demos/${page.id}/iframe.html`,
        })),
      },
    };
  }

  publishProject(projectId: string, actor = this.defaultActor()): ProjectAdminResult<PublishStatus> {
    if (actor.role === "readonly") return fail("FORBIDDEN", "当前操作者没有发布权限");
    const check = this.publishCheck(projectId, actor);
    if (!check.ok || !check.data?.ok) {
      return fail("VALIDATION_BLOCKED", "发布前检查未通过", { validation: check.data });
    }
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const snapshot = this.createProjectVersion(
      project,
      this.projectWorkspacePath(projectId),
      actor.name,
      `publish-${Date.now()}`,
      "发布快照",
      "publish_snapshot",
    );
    const versionedProject = {
      ...project,
      versions: this.compactProjectVersions([...project.versions, snapshot]),
      updatedAt: Date.now(),
    };
    this.writeProject(projectId, versionedProject);
    const status = this.buildPublishStatus(projectId, {
      published: true,
      publishedVersion: snapshot.versionId,
      publishedAt: Date.now(),
      artifactPath: path.join(this.publishedDir, projectId),
    });
    const updated = { ...versionedProject, publishedVersion: status.publishedVersion, publishedAt: status.publishedAt };
    this.writeProject(projectId, updated);
    ensureDir(status.artifactPath ?? "");
    writeJsonFile(path.join(status.artifactPath ?? "", "project-admin-status.json"), status);
    const auditId = this.audit("publish_project", actor, "L4", true, {
      projectId,
      diffSummary: { updated: ["publishedVersion", "publishedAt"] },
    });
    return ok(status, {
      auditId,
      warnings: ["当前 CLI 发布只更新发布状态；完整产物编译需配置 AUTHOR_SITE_URL 和 AUTHOR_SITE_AUTH_TOKEN 后使用 author-site publish API"],
      nextActions: ["配置 AUTHOR_SITE_URL 和 AUTHOR_SITE_AUTH_TOKEN 后运行 ow publish project <projectId> --json"],
    });
  }

  publishStatus(projectId: string, actor = this.defaultActor()): ProjectAdminResult<PublishStatus> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    return ok(this.buildPublishStatus(projectId, {
      published: Boolean(project.publishedVersion),
      publishedVersion: project.publishedVersion,
      publishedAt: project.publishedAt,
      artifactPath: fs.existsSync(path.join(this.publishedDir, projectId))
        ? path.join(this.publishedDir, projectId)
        : undefined,
    }));
  }

  publishRollback(projectId: string, actor = this.defaultActor()): ProjectAdminResult<PublishStatus> {
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    if (project.versions.length < 2) return fail("VERSION_NOT_FOUND", "没有可回滚的上一版本");
    const previous = project.versions.at(-2);
    const updated = {
      ...project,
      publishedVersion: previous?.versionId,
      publishedAt: Date.now(),
    };
    this.writeProject(projectId, updated);
    return this.publishStatus(projectId, actor);
  }

  auditList(projectId?: string): ProjectAdminResult<AuditEvent[]> {
    this.ensureDirs();
    const events = this.walkFiles(this.auditDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJsonFile<AuditEvent>(file))
      .filter((event): event is AuditEvent => Boolean(event))
      .filter((event) => !projectId || event.projectId === projectId)
      .sort((a, b) => b.at - a.at);
    return ok(events);
  }

  auditGet(auditId: string): ProjectAdminResult<AuditEvent> {
    const events = this.auditList().data ?? [];
    const event = events.find((item) => item.auditId === auditId);
    if (!event) return fail("AUDIT_NOT_FOUND", "审计记录不存在");
    return ok(event);
  }

  aiSessionList(projectId: string): ProjectAdminResult<{ projectId: string; sessions: AiSessionSummary[] }> {
    const sessions = this.scanAiSessions(projectId);
    return ok({ projectId, sessions });
  }

  aiSessionGet(sessionId: string): ProjectAdminResult<AiSessionSummary> {
    const session = this.scanAiSessions().find((item) => item.sessionId === sessionId);
    if (!session) return fail("SESSION_NOT_FOUND", "AI 会话不存在");
    return ok(session);
  }

  aiRunLogs(sessionId: string): ProjectAdminResult<{ sessionId: string; logs: string[] }> {
    const logs: string[] = [];
    const candidateDirs = [
      path.join(this.agentRunLogsDir, sessionId),
      ...this.walkFiles(this.agentRunLogsDir)
        .filter((file) => file.includes(sessionId))
        .map((file) => path.dirname(file)),
    ];
    for (const dir of [...new Set(candidateDirs)]) {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      for (const file of this.walkFiles(dir)) {
        if (!/\.(log|txt|json|jsonl)$/i.test(file)) continue;
        logs.push(fs.readFileSync(file, "utf-8"));
      }
    }
    return ok({ sessionId, logs });
  }

  aiWorkspaceContext(sessionId: string): ProjectAdminResult<{ sessionId: string; workspacePath?: string; files: string[] }> {
    const session = this.aiSessionGet(sessionId);
    if (!session.ok || !session.data) return fail("SESSION_NOT_FOUND", "AI 会话不存在");
    const workspacePath = session.data.workspaceId
      ? this.findWorkspacePathById(session.data.workspaceId)
      : undefined;
    return ok({
      sessionId,
      workspacePath,
      files: workspacePath ? this.walkFiles(workspacePath).map((file) => path.relative(workspacePath, file)) : [],
    });
  }

  async sendAiMessage(
    input: AiSendMessageInput,
    actor = this.defaultActor(),
  ): Promise<ProjectAdminResult<AiSendMessageResult>> {
    const sessionId = input.sessionId.trim();
    const content = input.content.trim();
    if (!sessionId) return fail("INVALID_REQUEST", "sessionId 不能为空");
    if (!content) return fail("INVALID_REQUEST", "消息内容不能为空");

    const session = this.aiSessionGet(sessionId);
    if (!session.ok || !session.data) return fail("SESSION_NOT_FOUND", "AI 会话不存在");
    const projectId = input.projectId ?? session.data.projectId;
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");

    const workspacePath =
      input.workingDir ??
      (session.data.workspaceId ? this.findWorkspacePathById(session.data.workspaceId) : undefined);
    const body = {
      content,
      demoId: projectId,
      workingDir: workspacePath,
      customWorkspace: Boolean(workspacePath),
      model: input.model,
      options: {
        stream: input.stream ?? false,
        timeout: input.timeout,
      },
    };

    try {
      const response = await fetch(
        `${this.getAgentServiceUrl()}/api/agent/${encodeURIComponent(sessionId)}/message`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: AiSendMessageResult; error?: { code?: string; message?: string } }
        | null;
      if (!response.ok || payload?.success === false || !payload?.data) {
        return fail(
          payload?.error?.code ?? "AGENT_SERVICE_ERROR",
          payload?.error?.message ?? `agent-service 响应 ${response.status}`,
        );
      }
      const auditId = this.audit("ai_send_message", actor, "L2", true, {
        projectId,
        resourceId: sessionId,
        inputSummary: { contentLength: content.length, model: input.model },
      });
      return ok(payload.data, {
        auditId,
        nextActions: ["ai_session_get", "ai_run_logs", "ai_workspace_context"],
      });
    } catch (error) {
      return fail(
        "AGENT_SERVICE_UNAVAILABLE",
        error instanceof Error ? error.message : "agent-service 不可用",
        { warnings: [`请确认 agent-service 已启动: ${this.getAgentServiceUrl()}`] },
      );
    }
  }

  lockProject(projectId: string, actor = this.defaultActor()): ProjectAdminResult<{ locked: true; projectId: string }> {
    if (actor.role !== "admin") return fail("FORBIDDEN", "只有管理员可以锁定项目");
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    writeJsonFile(this.projectLockPath(projectId), {
      projectId,
      lockedAt: Date.now(),
      actor,
    });
    return ok({ locked: true, projectId });
  }

  unlockProject(projectId: string, actor = this.defaultActor()): ProjectAdminResult<{ unlocked: true; projectId: string }> {
    if (actor.role !== "admin") return fail("FORBIDDEN", "只有管理员可以解锁项目");
    const access = this.requireProjectAccess(projectId, actor);
    if (!access.ok) return fail("FORBIDDEN", "当前操作者无权访问该项目");
    fs.rmSync(this.projectLockPath(projectId), { force: true });
    return ok({ unlocked: true, projectId });
  }

  private patchProjectCover(projectId: string, thumbnail: string | undefined, actor: ProjectAdminActor): ProjectAdminResult<Project> {
    const project = this.readProject(projectId);
    if (!project) return fail("PROJECT_NOT_FOUND", "项目不存在");
    const updated = { ...project, thumbnail, updatedAt: Date.now() };
    this.writeProject(projectId, updated);
    const auditId = this.audit(thumbnail ? "project_set_cover" : "project_delete_cover", actor, "L1", true, {
      projectId,
      diffSummary: { updated: ["project.thumbnail"] },
    });
    return ok(updated, { auditId, diffSummary: { updated: ["project.thumbnail"] } });
  }

  private getProjectPath(projectId: string): string {
    return path.join(this.projectsDir, safeId(projectId, "project"));
  }

  private getTemplatePath(templateId: string): string {
    return path.join(this.templatesDir, safeId(templateId, "template"));
  }

  private projectWorkspacePath(projectId: string): string {
    return path.join(this.getProjectPath(projectId), "workspace");
  }

  private readProject(projectId: string): Project | null {
    const parsed = readJsonFile<Partial<Project>>(path.join(this.getProjectPath(projectId), "project.json"));
    if (!parsed) return null;
    return {
      id: parsed.id ?? projectId,
      name: parsed.name ?? projectId,
      category: normalizeProjectCategory(parsed.category),
      description: parsed.description,
      workspacePath: parsed.workspacePath ?? this.projectWorkspacePath(projectId),
      demoPages: Array.isArray(parsed.demoPages) ? parsed.demoPages : [],
      demoFolders: Array.isArray(parsed.demoFolders) ? parsed.demoFolders : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      pageVersions: parsed.pageVersions ?? {},
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? Date.now(),
      lockedDependencies: parsed.lockedDependencies,
      thumbnail: parsed.thumbnail,
      publishedVersion: parsed.publishedVersion,
      publishedAt: parsed.publishedAt,
    };
  }

  private writeProject(projectId: string, project: Project): void {
    writeJsonFile(path.join(this.getProjectPath(projectId), "project.json"), project);
  }

  private readTemplate(templateId: string): ProjectTemplateMeta | null {
    const parsed = readJsonFile<Partial<ProjectTemplateMeta>>(path.join(this.getTemplatePath(templateId), "template.json"));
    if (!parsed?.id || !parsed.sourceProjectId || !parsed.category || !parsed.name || !parsed.description) {
      return null;
    }
    return {
      id: parsed.id,
      sourceProjectId: parsed.sourceProjectId,
      category: parsed.category,
      name: parsed.name,
      description: parsed.description,
      thumbnail: parsed.thumbnail,
      scope: parsed.scope,
      official: parsed.official,
      demoCount: parsed.demoCount ?? parsed.demoPages?.length ?? 0,
      demoPages: parsed.demoPages,
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? parsed.createdAt ?? Date.now(),
    };
  }

  private writeTemplate(templateId: string, template: ProjectTemplateMeta): void {
    writeJsonFile(path.join(this.getTemplatePath(templateId), "template.json"), template);
  }

  private createTemplateSnapshot(projectId: string, input: TemplateMetaInput): string {
    const project = this.readProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const templateId = nowId("tmpl");
    const templatePath = this.getTemplatePath(templateId);
    const templateWorkspacePath = path.join(templatePath, "workspace");
    ensureDir(templatePath);
    copyWorkspace(this.projectWorkspacePath(projectId), templateWorkspacePath);
    const tree = this.readWorkspaceTree(templateWorkspacePath);
    const now = Date.now();
    const template: ProjectTemplateMeta = {
      id: templateId,
      sourceProjectId: projectId,
      category: input.category.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      thumbnail: input.thumbnail ?? project.thumbnail,
      scope: input.scope ?? (input.official ? "official" : "team"),
      official: input.official ?? false,
      demoCount: tree.pages.length,
      demoPages: sortPages(tree.pages),
      createdAt: now,
      updatedAt: now,
    };
    this.writeTemplate(templateId, template);
    indexTemplateSnapshot(new KnowledgeFileStore({ dataDir: this.dataDir }), {
      templateId,
      templateName: template.name,
      templateDescription: template.description,
      workspacePath: templateWorkspacePath,
    });
    return templateId;
  }

  private readWorkspaceTree(workspacePath: string): WorkspaceTree {
    const parsed = readJsonFile<Partial<WorkspaceTree>>(path.join(workspacePath, WORKSPACE_TREE_FILENAME));
    if (parsed) {
      return {
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        pages: Array.isArray(parsed.pages) ? normalizePagesRouteKeys(parsed.pages) : [],
      };
    }
    const pages: DemoPageMeta[] = [];
    const demosDir = path.join(workspacePath, "demos");
    if (fs.existsSync(demosDir)) {
      for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (fs.existsSync(path.join(demosDir, entry.name, "index.tsx"))) {
          pages.push({
            id: entry.name,
            name: entry.name.split("_")[0].replace(/-/g, " "),
            routeKey: makeUniqueRouteKey(entry.name, new Set(pages.map((page) => page.routeKey).filter(Boolean) as string[])),
            order: pages.length,
            parentId: null,
          });
        }
      }
    }
    const tree = { folders: [], pages };
    this.writeWorkspaceTree(workspacePath, tree);
    return tree;
  }

  private writeWorkspaceTree(workspacePath: string, tree: WorkspaceTree): void {
    ensureDir(workspacePath);
    writeJsonFile(path.join(workspacePath, WORKSPACE_TREE_FILENAME), {
      folders: tree.folders,
      pages: sortPages(normalizePagesRouteKeys(tree.pages)),
    });
  }

  private readEdit(editId: string): EditTransaction | null {
    return readJsonFile<EditTransaction>(path.join(this.editsDir, `${safeId(editId, "edit")}.json`));
  }

  private writeEdit(transaction: EditTransaction): void {
    writeJsonFile(path.join(this.editsDir, `${transaction.editId}.json`), transaction);
  }

  private refreshEditStatus(transaction: EditTransaction): EditTransaction {
    if (transaction.status === "editing" && Date.now() > transaction.expiresAt) {
      const expired = { ...transaction, status: "expired" as const };
      this.writeEdit(expired);
      return expired;
    }
    return transaction;
  }

  private requireEditable(editId: string): ProjectAdminResult<EditTransaction> {
    const transaction = this.readEdit(editId);
    if (!transaction) return fail("EDIT_NOT_FOUND", "编辑事务不存在");
    if (transaction.status !== "editing") return fail("EDIT_NOT_EDITING", "编辑事务不在编辑状态");
    if (Date.now() > transaction.expiresAt) return fail("EDIT_EXPIRED", "编辑事务已过期");
    return ok(transaction);
  }

  private pageDir(workspacePath: string, pageId: string): string {
    return path.join(workspacePath, "demos", safeId(pageId, "page"));
  }

  private findPage(workspacePath: string, pageId: string): DemoPageMeta | null {
    const tree = this.readWorkspaceTree(workspacePath);
    return tree.pages.find((page) => page.id === pageId) ?? null;
  }

  private readPageFiles(workspacePath: string, pageId: string): DemoFiles | null {
    const demoDir = this.pageDir(workspacePath, pageId);
    const codePath = path.join(demoDir, "index.tsx");
    const schemaPath = path.join(demoDir, "config.schema.json");
    const prototypeHtmlPath = path.join(demoDir, "prototype.html");
    const prototypeCssPath = path.join(demoDir, "prototype.css");
    const prototypeMetaPath = path.join(demoDir, "prototype.meta.json");
    if (!fs.existsSync(schemaPath)) return null;
    const files: DemoFiles = {
      code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
      schema: fs.readFileSync(schemaPath, "utf-8"),
    };
    if (fs.existsSync(prototypeHtmlPath)) {
      files.prototypeHtml = fs.readFileSync(prototypeHtmlPath, "utf-8");
    }
    if (fs.existsSync(prototypeCssPath)) {
      files.prototypeCss = fs.readFileSync(prototypeCssPath, "utf-8");
    }
    if (fs.existsSync(prototypeMetaPath)) {
      files.prototypeMeta = readJsonFile<PrototypePageMeta>(prototypeMetaPath) ?? undefined;
    }
    return files;
  }

  private readPageVersionFiles(project: Project, pageId: string, versionId: string): DemoFiles | null {
    const version = project.pageVersions?.[pageId]?.find((item) => item.versionId === versionId);
    if (!version || !fs.existsSync(version.snapshotPath)) return null;
    const codePath = path.join(version.snapshotPath, "index.tsx");
    const schemaPath = path.join(version.snapshotPath, "config.schema.json");
    const prototypeHtmlPath = path.join(version.snapshotPath, "prototype.html");
    const prototypeCssPath = path.join(version.snapshotPath, "prototype.css");
    const prototypeMetaPath = path.join(version.snapshotPath, "prototype.meta.json");
    if (!fs.existsSync(schemaPath)) return null;
    return {
      code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
      schema: fs.readFileSync(schemaPath, "utf-8"),
      prototypeHtml: fs.existsSync(prototypeHtmlPath) ? fs.readFileSync(prototypeHtmlPath, "utf-8") : undefined,
      prototypeCss: fs.existsSync(prototypeCssPath) ? fs.readFileSync(prototypeCssPath, "utf-8") : undefined,
      prototypeMeta: fs.existsSync(prototypeMetaPath)
        ? readJsonFile<PrototypePageMeta>(prototypeMetaPath) ?? undefined
        : undefined,
    };
  }

  private readProjectConfig(workspacePath: string): string | null {
    const configPath = path.join(workspacePath, PROJECT_CONFIG_FILENAME);
    return fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : null;
  }

  private readAppGraph(workspacePath: string): AppGraph {
    const tree = this.readWorkspaceTree(workspacePath);
    const graphPath = path.join(workspacePath, APP_GRAPH_FILENAME);
    const parsed = readJsonFile<Partial<AppGraph>>(graphPath);
    const pages: AppGraph["pages"] = {};
    for (const page of sortPages(tree.pages)) {
      if (!page.routeKey) continue;
      pages[page.routeKey] = {
        pageId: page.id,
        title: page.name,
      };
    }
    const pageKeys = new Set(Object.keys(pages));
    const entry =
      parsed?.entry && pageKeys.has(parsed.entry)
        ? parsed.entry
        : Object.keys(pages)[0] ?? "";
    const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    const state =
      parsed?.state && typeof parsed.state === "object" && !Array.isArray(parsed.state)
        ? parsed.state
        : {};
    return {
      version: 1,
      entry,
      pages,
      actions,
      state,
    };
  }

  private createProjectVersion(
    project: Project,
    workspacePath: string,
    actorName: string,
    editId: string,
    note?: string,
    type: VersionHistoryEntryType = "named_version",
  ): VersionInfo {
    const versionId = this.generateVersionId(project);
    const snapshotPath = path.join(this.snapshotsDir, project.id, versionId);
    ensureDir(path.dirname(snapshotPath));
    fs.rmSync(snapshotPath, { recursive: true, force: true });
    copyWorkspaceWithoutRuntimeMetadata(workspacePath, snapshotPath);
    return {
      versionId,
      type,
      savedAt: Date.now(),
      savedBy: actorName,
      sessionId: editId,
      snapshotPath,
      fileCount: countFiles(workspacePath),
      note,
    };
  }

  private generateVersionId(project: Project): string {
    const pageVersions = Object.values(project.pageVersions ?? {}).flat();
    const maxVersion = [...project.versions, ...pageVersions].reduce((max, version) => {
      const match = /^v(\d+)$/.exec(version.versionId);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `v${maxVersion + 1}`;
  }

  private compactProjectVersions(versions: VersionInfo[]): VersionInfo[] {
    if (versions.length <= MAX_VERSIONS_KEEP) return versions;
    const removeCount = versions.length - MAX_VERSIONS_KEEP;
    const removable = versions
      .map((version, index) => ({ version, index }))
      .filter(({ version }) => version.type === "auto_checkpoint");
    const fallback = versions.map((version, index) => ({ version, index }));
    const toRemove = [...removable, ...fallback]
      .filter(
        (entry, index, all) =>
          all.findIndex((item) => item.index === entry.index) === index,
      )
      .slice(0, removeCount);
    const removeIndexes = new Set(toRemove.map((entry) => entry.index));
    for (const { version } of toRemove) {
      fs.rmSync(version.snapshotPath, { recursive: true, force: true });
    }
    return versions.filter((_, index) => !removeIndexes.has(index));
  }

  private diffWorkspaceFiles(basePath: string, nextPath: string): string[] {
    const baseFiles = new Map<string, string>();
    const nextFiles = new Map<string, string>();
    for (const file of this.walkFiles(basePath)) {
      baseFiles.set(path.relative(basePath, file), fs.readFileSync(file, "utf-8"));
    }
    for (const file of this.walkFiles(nextPath)) {
      nextFiles.set(path.relative(nextPath, file), fs.readFileSync(file, "utf-8"));
    }
    const changed = new Set<string>();
    for (const [file, content] of nextFiles) {
      if (baseFiles.get(file) !== content) changed.add(file);
    }
    for (const file of baseFiles.keys()) {
      if (!nextFiles.has(file)) changed.add(file);
    }
    return [...changed].sort();
  }

  private walkFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const result: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result.push(...this.walkFiles(entryPath));
      if (entry.isFile()) result.push(entryPath);
    }
    return result;
  }

  private validateEditTransaction(transaction: EditTransaction): ValidationResult {
    const structuralValidation = this.validateWorkspace(transaction.workspacePath);
    const changedPageIds = this.getChangedCodePageIds(transaction);
    const runtimeValidation = this.validateWorkspaceRuntime(transaction.workspacePath);
    const runtimeIssues = this.runtimeToValidationResult(
      runtimeValidation,
      changedPageIds,
    ).issues;
    const issues = [...structuralValidation.issues, ...runtimeIssues];
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private getChangedCodePageIds(transaction: EditTransaction): Set<string> {
    const changedFiles = this.diffWorkspaceFiles(
      this.projectWorkspacePath(transaction.projectId),
      transaction.workspacePath,
    );
    const pageIds = new Set<string>();
    for (const file of changedFiles) {
      const match = file.match(/^demos\/([^/]+)\/(?:index\.tsx|prototype\.(?:html|css)|prototype\.meta\.json)$/u);
      if (match?.[1]) pageIds.add(match[1]);
    }
    return pageIds;
  }

  private validateWorkspaceRuntime(
    workspacePath: string,
    pageId?: string,
  ): RuntimeValidationResult {
    const tree = this.readWorkspaceTree(workspacePath);
    const pages = pageId
      ? tree.pages.filter((page) => page.id === pageId)
      : tree.pages;
    const issues: RuntimeValidationIssue[] = [];
    const pageIds: string[] = [];
    let prototypeGate: RuntimeValidationResult["prototypeGate"];

    if (pageId && pages.length === 0) {
      issues.push({
        pageId,
        severity: "error",
        stage: "source_contract",
        code: "DEMO_PAGE_NOT_FOUND",
        message: `页面不存在: ${pageId}`,
        instruction: "请先通过 page list 获取准确页面 ID。",
      });
      return { ok: false, issues, pageIds: [pageId] };
    }

    for (const page of pages) {
      pageIds.push(page.id);
      const files = this.readPageFiles(workspacePath, page.id);
      if (!files) {
        issues.push({
          pageId: page.id,
          severity: "error",
          stage: "source_contract",
          code: "FILE_READ_ERROR",
          message: `页面文件不存在: ${page.id}`,
          instruction: "请确认页面目录存在 index.tsx 和 config.schema.json。",
        });
        continue;
      }
      const pageValidation = this.validatePageFilesRuntime(
        page.id,
        resolvePageRuntimeType(page),
        files,
      );
      issues.push(...pageValidation.issues);
      if (pageId && pageValidation.prototypeGate) {
        prototypeGate = pageValidation.prototypeGate;
      }
    }

    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues,
      pageIds,
      prototypeGate,
    };
  }

  private validatePageFilesRuntime(
    pageId: string,
    runtimeType: DemoPageRuntimeType,
    files: DemoFiles,
  ): RuntimeValidationResult {
    if (runtimeType === "prototype-html-css") {
      return this.validatePrototypePageSource(
        pageId,
        files.prototypeHtml ?? "",
        files.prototypeCss ?? "",
      );
    }
    return this.validatePageRuntimeSource(pageId, files.code);
  }

  private validatePrototypePageSource(
    pageId: string,
    html: string,
    css: string,
  ): RuntimeValidationResult {
    const issues: RuntimeValidationIssue[] = [];
    const repairReasonCodes: string[] = [];
    const upgradeReasonCodes: string[] = [];
    const addIssue = (
      issue: Omit<RuntimeValidationIssue, "pageId" | "severity" | "stage">,
      gateDecision: Exclude<PrototypeGateDecision, "accept_prototype">,
    ) => {
      issues.push({
        pageId,
        severity: "error",
        stage: "prototype_contract",
        ...issue,
      });
      if (gateDecision === "upgrade_to_high_fidelity") {
        upgradeReasonCodes.push(issue.code);
      } else {
        repairReasonCodes.push(issue.code);
      }
    };

    if (!html.trim()) {
      addIssue({
        code: "PROTOTYPE_HTML_EMPTY",
        message: "原型页 HTML 不能为空",
        instruction: "请提供可渲染的 prototype.html 内容。",
      }, "repair_prototype");
    }
    if (html.length > MAX_PROTOTYPE_HTML_LENGTH) {
      addIssue({
        code: "PROTOTYPE_HTML_TOO_LARGE",
        message: "原型页 HTML 超过 MVP 限制",
        instruction: "请压缩 HTML 结构，避免一次写入过大的页面内容。",
      }, "repair_prototype");
    }
    if (css.length > MAX_PROTOTYPE_CSS_LENGTH) {
      addIssue({
        code: "PROTOTYPE_CSS_TOO_LARGE",
        message: "原型页 CSS 超过 MVP 限制",
        instruction: "请压缩 CSS，移除不必要的样式规则。",
      }, "repair_prototype");
    }
    if (/<\s*script\b/i.test(html)) {
      addIssue({
        code: "PROTOTYPE_SCRIPT_FORBIDDEN",
        message: "原型页不允许包含 script 标签",
        instruction: "页面需要执行脚本时应升级为高保真页；否则请移除 script 标签。",
      }, "upgrade_to_high_fidelity");
    }
    if (/\son[a-z]+\s*=/i.test(html)) {
      addIssue({
        code: "PROTOTYPE_INLINE_EVENT_FORBIDDEN",
        message: "原型页不允许包含内联事件属性",
        instruction: "页面需要真实事件处理时应升级为高保真页；否则请移除 onclick、onload 等内联事件属性。",
      }, "upgrade_to_high_fidelity");
    }
    if (/javascript\s*:/i.test(html) || /javascript\s*:/i.test(css)) {
      addIssue({
        code: "PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN",
        message: "原型页不允许包含 javascript: URL",
        instruction: "页面需要执行 JavaScript URL 时应升级为高保真页；否则请将链接改为普通 URL 或占位链接。",
      }, "upgrade_to_high_fidelity");
    }
    if (/<\s*(iframe|embed|object)\b/i.test(html)) {
      addIssue({
        code: "PROTOTYPE_EMBED_FORBIDDEN",
        message: "原型页不允许直接内嵌 iframe、embed 或 object",
        instruction: "需要嵌入第三方运行时内容时应升级为高保真页。",
      }, "upgrade_to_high_fidelity");
    }
    if (/<\s*form\b[^>]*\saction\s*=/i.test(html)) {
      addIssue({
        code: "PROTOTYPE_FORM_ACTION_FORBIDDEN",
        message: "原型页不允许包含会提交的表单 action",
        instruction: "需要真实表单提交时应升级为高保真页；静态表单请移除 action。",
      }, "upgrade_to_high_fidelity");
    }
    if (/\bposition\s*:\s*fixed\b/i.test(css)) {
      addIssue({
        code: "PROTOTYPE_FIXED_POSITION_REQUIRES_ISOLATION",
        message: "原型页不允许使用 position: fixed",
        instruction: "需要固定定位覆盖视口时应升级为高保真页；静态布局请改用 absolute、sticky 或普通布局。",
      }, "upgrade_to_high_fidelity");
    }
    if (/@import\b/i.test(css)) {
      addIssue({
        code: "PROTOTYPE_CSS_IMPORT_FORBIDDEN",
        message: "原型页不允许使用 CSS @import",
        instruction: "请移除远程样式导入，把必要样式内联到 prototype.css。",
      }, "repair_prototype");
    }
    if (PROTOTYPE_GLOBAL_SELECTOR_RE.test(css)) {
      addIssue({
        code: "PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN",
        message: "原型页 CSS 不允许直接选择 html、body 或 :root",
        instruction: "请把全局选择器改为原型页根节点内的局部 class 选择器。",
      }, "repair_prototype");
    }

    const decision: PrototypeGateDecision = upgradeReasonCodes.length > 0
      ? "upgrade_to_high_fidelity"
      : issues.length > 0
        ? "repair_prototype"
        : "accept_prototype";
    const reasonCodes = Array.from(new Set([
      ...upgradeReasonCodes,
      ...repairReasonCodes,
    ]));
    const summary = decision === "accept_prototype"
      ? "HTML/CSS 原型页可安全内嵌渲染。"
      : decision === "repair_prototype"
        ? "HTML/CSS 原型页存在可自动修复的问题，修复后可继续按原型页保存。"
        : "页面触碰运行时隔离红线，应升级为高保真页。";

    return {
      ok: issues.length === 0,
      issues,
      pageIds: [pageId],
      prototypeGate: { decision, reasonCodes, summary },
    };
  }

  private validatePageRuntimeSource(pageId: string, code: string): RuntimeValidationResult {
    try {
      compilePreviewPageSource(code, {
        resolveDependencyUrl: (specifier) => `/runtime/${specifier}.js`,
      });
      return { ok: true, issues: [], pageIds: [pageId] };
    } catch (error) {
      if (error instanceof PreviewRuntimeContractError) {
        return {
          ok: false,
          issues: error.issues.map((issue) => this.toRuntimeValidationIssue(pageId, issue)),
          pageIds: [pageId],
        };
      }
      return {
        ok: false,
        issues: [
          {
            pageId,
            severity: "error",
            stage: "compile_transform",
            code: "COMPILE_TRANSFORM_FAILED",
            message: error instanceof Error ? error.message : "页面源码编译失败",
            instruction: "请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。",
          },
        ],
        pageIds: [pageId],
      };
    }
  }

  private toRuntimeValidationIssue(
    pageId: string,
    issue: RuntimeContractIssue,
  ): RuntimeValidationIssue {
    return {
      pageId,
      severity: issue.severity,
      stage: issue.stage,
      code: issue.code,
      message: issue.message,
      instruction: issue.instruction,
      moduleName: issue.moduleName,
      importName: issue.importName,
    };
  }

  private runtimeToValidationResult(
    runtime: RuntimeValidationResult,
    blockingPageIds?: Set<string>,
  ): ValidationResult {
    return {
      ok: runtime.issues.every((issue) =>
        issue.severity !== "error" || (blockingPageIds !== undefined && !blockingPageIds.has(issue.pageId))
      ),
      issues: runtime.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        resourceId: issue.pageId,
        pageId: issue.pageId,
        stage: issue.stage,
        instruction: issue.instruction,
        severity:
          issue.severity === "error" && (blockingPageIds === undefined || blockingPageIds.has(issue.pageId))
            ? "blocking"
            : "warning",
      })),
    };
  }

  private validateWorkspace(workspacePath: string): ValidationResult {
    const tree = this.readWorkspaceTree(workspacePath);
    const treeValidation = this.validateTree(tree);
    const issues = [...treeValidation.issues];
    const projectSchema = this.readProjectConfig(workspacePath);
    for (const page of tree.pages) {
      const pageValidation = this.validatePageFiles(workspacePath, page.id, projectSchema);
      issues.push(...pageValidation.issues);
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private validatePageFiles(workspacePath: string, pageId: string, projectSchema?: string | null): ValidationResult {
    const files = this.readPageFiles(workspacePath, pageId);
    const page = this.findPage(workspacePath, pageId);
    const issues: ValidationResult["issues"] = [];
    if (!files) {
      issues.push({ code: "FILE_READ_ERROR", message: `页面文件不存在: ${pageId}`, resourceId: pageId, severity: "blocking" });
      return { ok: false, issues };
    }
    if (resolvePageRuntimeType(page) !== "prototype-html-css" && !files.code.includes("export default")) {
      issues.push({ code: "NO_DEFAULT_EXPORT", message: `页面缺少 default export: ${pageId}`, resourceId: pageId, severity: "blocking" });
    }
    issues.push(...this.validateSchemaPair(projectSchema ?? null, files.schema).issues);
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private validateSchemaPair(projectSchema: string | null | undefined, pageSchema: string | null | undefined): ValidationResult {
    const issues: ValidationResult["issues"] = [];
    const projectKeys = new Set<string>();
    if (projectSchema) {
      const parsed = this.parseSchema(projectSchema, "project.config.schema.json", issues);
      Object.keys(parsed?.properties ?? {}).forEach((key) => projectKeys.add(key));
    }
    if (pageSchema) {
      const parsed = this.parseSchema(pageSchema, "config.schema.json", issues);
      for (const key of Object.keys(parsed?.properties ?? {})) {
        if (projectKeys.has(key)) {
          issues.push({
            code: "SCHEMA_CONFLICT",
            message: `项目级配置和页面配置字段冲突: ${key}`,
            resourceId: key,
            severity: "blocking",
          });
        }
      }
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private validateProjectConfigAgainstPages(workspacePath: string, projectSchema: string): ValidationResult {
    const tree = this.readWorkspaceTree(workspacePath);
    const issues = [...this.validateSchemaPair(projectSchema, null).issues];
    for (const page of tree.pages) {
      const files = this.readPageFiles(workspacePath, page.id);
      if (files) issues.push(...this.validateSchemaPair(projectSchema, files.schema).issues);
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private parseSchema(
    schema: string,
    resourceId: string,
    issues: ValidationResult["issues"],
  ): { properties?: Record<string, unknown> } | null {
    try {
      const parsed = JSON.parse(schema) as { properties?: unknown; type?: unknown };
      if (parsed.properties !== undefined && (typeof parsed.properties !== "object" || Array.isArray(parsed.properties))) {
        issues.push({ code: "INVALID_SCHEMA", message: `${resourceId} properties 必须是对象`, resourceId, severity: "blocking" });
      }
      return {
        properties:
          parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties)
            ? (parsed.properties as Record<string, unknown>)
            : {},
      };
    } catch {
      issues.push({ code: "INVALID_JSON", message: `${resourceId} 不是合法 JSON`, resourceId, severity: "blocking" });
      return null;
    }
  }

  private validateTree(tree: WorkspaceTree): ValidationResult {
    const issues: ValidationResult["issues"] = [];
    const folderIds = new Set(tree.folders.map((folder) => folder.id));
    for (const folder of tree.folders) {
      if (folder.parentId && !folderIds.has(folder.parentId)) {
        issues.push({ code: "FOLDER_NOT_FOUND", message: `父文件夹不存在: ${folder.parentId}`, resourceId: folder.id, severity: "blocking" });
      }
      if (folder.parentId && this.isFolderDescendant(tree.folders, folder.parentId, folder.id)) {
        issues.push({ code: "CIRCULAR_REFERENCE", message: "文件夹不能移动到自身或子级", resourceId: folder.id, severity: "blocking" });
      }
      if (this.folderDepth(tree.folders, folder.id) > 3) {
        issues.push({ code: "FOLDER_DEPTH_EXCEEDED", message: "文件夹嵌套不能超过 3 层", resourceId: folder.id, severity: "blocking" });
      }
    }
    for (const page of tree.pages) {
      if (page.parentId && !folderIds.has(page.parentId)) {
        issues.push({ code: "FOLDER_NOT_FOUND", message: `页面父文件夹不存在: ${page.parentId}`, resourceId: page.id, severity: "blocking" });
      }
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private folderDepth(folders: DemoFolderMeta[], folderId: string): number {
    let depth = 1;
    let current = folders.find((folder) => folder.id === folderId);
    while (current?.parentId) {
      depth += 1;
      current = folders.find((folder) => folder.id === current?.parentId);
    }
    return depth;
  }

  private isFolderDescendant(folders: DemoFolderMeta[], candidateId: string, ancestorId: string): boolean {
    let current = folders.find((folder) => folder.id === candidateId);
    while (current) {
      if (current.parentId === ancestorId) return true;
      current = folders.find((folder) => folder.id === current?.parentId);
    }
    return false;
  }

  private createPlan(
    operation: string,
    resourceId: string,
    impact: string[],
    extra?: Record<string, unknown>,
  ): PreviewPlan & { extra?: Record<string, unknown> } {
    const plan: PreviewPlan & { extra?: Record<string, unknown> } = {
      planId: nowId("plan"),
      operation,
      resourceId,
      impact,
      reversible: true,
      confirmToken: nowId("confirm"),
      extra,
    };
    writeJsonFile(path.join(this.plansDir, `${plan.planId}.json`), plan);
    return plan;
  }

  private readPlan(planId: string): (PreviewPlan & { extra?: Record<string, unknown> }) | null {
    return readJsonFile<PreviewPlan & { extra?: Record<string, unknown> }>(path.join(this.plansDir, `${safeId(planId, "plan")}.json`));
  }

  private projectLockPath(projectId: string): string {
    return path.join(this.internalDir, "locks", `${safeId(projectId, "project")}.json`);
  }

  private isProjectLocked(projectId: string): boolean {
    return fs.existsSync(this.projectLockPath(projectId));
  }

  private canAccessProject(projectId: string, actor: ProjectAdminActor): boolean {
    return !actor.allowedProjectIds || actor.allowedProjectIds.includes(projectId);
  }

  private requireProjectAccess(projectId: string, actor: ProjectAdminActor): ProjectAdminResult<true> {
    return this.canAccessProject(projectId, actor)
      ? ok(true)
      : fail("FORBIDDEN", "当前操作者无权访问该项目");
  }

  private scanAiSessions(projectId?: string): AiSessionSummary[] {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const sessions: AiSessionSummary[] = [];
    for (const file of this.walkFiles(this.sessionsDir)) {
      if (!file.endsWith(".session.json")) continue;
      const parsed = readJsonFile<Record<string, unknown>>(file);
      if (!parsed) continue;
      const sessionId =
        typeof parsed.id === "string"
          ? parsed.id
          : typeof parsed.sessionId === "string"
            ? parsed.sessionId
            : path.basename(file, ".session.json");
      const parsedProjectId =
        typeof parsed.demoId === "string"
          ? parsed.demoId
          : typeof parsed.projectId === "string"
            ? parsed.projectId
            : path.basename(path.dirname(file));
      if (projectId && parsedProjectId !== projectId) continue;
      sessions.push({
        sessionId,
        projectId: parsedProjectId,
        userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
        workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : undefined,
        status: typeof parsed.status === "string" ? parsed.status : undefined,
        createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
        expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
        path: file,
      });
    }
    return sessions.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  private findWorkspacePathById(workspaceId: string): string | undefined {
    if (!fs.existsSync(this.workspacesDir)) return undefined;
    for (const entryPath of this.walkFiles(this.workspacesDir).map((file) => path.dirname(file))) {
      if (path.basename(entryPath) === workspaceId) return entryPath;
    }
    for (const file of this.walkFiles(this.workspacesDir)) {
      if (!file.endsWith(".workspace.json")) continue;
      const parsed = readJsonFile<Record<string, unknown>>(file);
      const parsedWorkspaceId =
        typeof parsed?.workspaceId === "string"
          ? parsed.workspaceId
          : typeof parsed?.id === "string"
            ? parsed.id
            : undefined;
      if (parsedWorkspaceId === workspaceId) return path.dirname(file);
    }
    return undefined;
  }

  private audit(
    tool: string,
    actor: ProjectAdminActor,
    level: AuditLevel,
    success: boolean,
    input: {
      projectId?: string;
      resourceId?: string;
      inputSummary?: Record<string, unknown>;
      diffSummary?: DiffSummary;
      validation?: ValidationResult;
      error?: ProjectAdminError;
    } = {},
  ): string {
    this.ensureDirs();
    const auditId = nowId("audit");
    const event: AuditEvent = {
      auditId,
      at: Date.now(),
      actor,
      level,
      tool,
      projectId: input.projectId,
      resourceId: input.resourceId,
      inputSummary: input.inputSummary,
      ok: success,
      diffSummary: input.diffSummary,
      validation: input.validation,
      error: input.error,
    };
    const date = new Date(event.at).toISOString().slice(0, 10);
    writeJsonFile(path.join(this.auditDir, date, `${auditId}.json`), event);
    return auditId;
  }

  private findReferences(workspacePath: string, relativeAssetPath: string): string[] {
    const refs: string[] = [];
    for (const file of this.walkFiles(workspacePath)) {
      if (/\.(tsx?|json|md|css)$/i.test(file)) {
        const content = fs.readFileSync(file, "utf-8");
        if (content.includes(relativeAssetPath)) refs.push(path.relative(workspacePath, file));
      }
    }
    return refs;
  }

  private validateAssetInput(input: AssetUploadInput): ValidationResult {
    const issues: ValidationResult["issues"] = [];
    if (input.mimeType && !ALLOWED_ASSET_MIME_TYPES.has(input.mimeType)) {
      issues.push({
        code: "INVALID_FILE_TYPE",
        message: `不支持的图片类型: ${input.mimeType}`,
        severity: "blocking",
      });
    }
    let size = 0;
    try {
      size = Buffer.from(input.dataBase64, "base64").length;
    } catch {
      issues.push({
        code: "INVALID_REQUEST",
        message: "dataBase64 不是合法 base64 数据",
        severity: "blocking",
      });
    }
    if (size <= 0) {
      issues.push({
        code: "INVALID_REQUEST",
        message: "资产内容不能为空",
        severity: "blocking",
      });
    }
    if (size > MAX_ASSET_SIZE) {
      issues.push({
        code: "FILE_TOO_LARGE",
        message: `资产大小超过 ${Math.floor(MAX_ASSET_SIZE / 1024 / 1024)}MB`,
        severity: "blocking",
      });
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }

  private generateAssetFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase() || ".bin";
    const stem = path
      .basename(filename, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "image";
    return `${stem}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  }

  private safeRelativeAssetPath(assetPath: string): string {
    const normalized = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "").split(path.sep).join("/");
    if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
      throw new Error("INVALID_ASSET_PATH");
    }
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(normalized)) {
      throw new Error("INVALID_FILE_TYPE");
    }
    return normalized;
  }

  private replaceReferences(workspacePath: string, oldPath: string, newPath: string): string[] {
    const updated: string[] = [];
    for (const file of this.walkFiles(workspacePath)) {
      if (!/\.(tsx?|json|md|css)$/i.test(file)) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (!content.includes(oldPath)) continue;
      fs.writeFileSync(file, content.split(oldPath).join(newPath), "utf-8");
      updated.push(path.relative(workspacePath, file).split(path.sep).join("/"));
    }
    return updated;
  }

  private getScreenshotServiceUrl(): string {
    return getScreenshotServiceUrl();
  }

  private getAgentServiceUrl(): string {
    return getAgentServiceUrl();
  }
}
