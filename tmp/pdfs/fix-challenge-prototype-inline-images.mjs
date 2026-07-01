// tmp/pdfs/fix-challenge-prototype-inline-images.ts
import fs4 from "node:fs";
import path4 from "node:path";

// packages/project-core/src/service.ts
import fs3 from "node:fs";
import path3 from "node:path";

// packages/knowledge-service/src/index.ts
import fs from "node:fs";
import path from "node:path";
var READING_MAP_RELATIVE_ROOT = "knowledge/templates";
var KnowledgeFileStore = class {
  dataDir;
  knowledgeDir;
  jobsDir;
  templatesDir;
  constructor(options) {
    this.dataDir = options.dataDir;
    this.knowledgeDir = path.join(options.dataDir, "knowledge");
    this.jobsDir = path.join(this.knowledgeDir, "index-jobs");
    this.templatesDir = path.join(this.knowledgeDir, "templates");
  }
  writeIndexJob(job) {
    writeJson(path.join(this.jobsDir, `${job.id}.json`), job);
    return job;
  }
  readIndexJob(jobId) {
    return readJson(path.join(this.jobsDir, `${safeFileName(jobId)}.json`));
  }
  listIndexJobs() {
    if (!fs.existsSync(this.jobsDir))
      return [];
    return fs.readdirSync(this.jobsDir).filter((fileName) => fileName.endsWith(".json")).map((fileName) => readJson(path.join(this.jobsDir, fileName))).filter((job) => Boolean(job)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  writeTemplateReadingMap(templateId, map) {
    const relativePath = `${READING_MAP_RELATIVE_ROOT}/${templateId}/reading-map.json`;
    writeJson(path.join(this.dataDir, relativePath), map);
    return relativePath;
  }
  readTemplateReadingMap(templateId) {
    return readJson(
      path.join(this.dataDir, READING_MAP_RELATIVE_ROOT, safeFileName(templateId), "reading-map.json")
    );
  }
};
function createTemplateIndexJob(store, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return store.writeIndexJob({
    id: `kjob_${input.templateId}_${Date.now()}`,
    targetType: "template",
    targetId: input.templateId,
    targetTitle: input.templateName,
    targetDescription: input.templateDescription,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    workspacePath: input.workspacePath,
    itemCount: 0
  });
}
function indexTemplateSnapshot(store, input) {
  const job = createTemplateIndexJob(store, input);
  return runBasicTemplateIndexJob(store, job.id);
}
function runBasicTemplateIndexJob(store, jobId) {
  const job = store.readIndexJob(jobId);
  if (!job || job.targetType !== "template" || !job.workspacePath) {
    throw new Error("INDEX_JOB_NOT_FOUND");
  }
  const workspacePath = job.workspacePath;
  const running = store.writeIndexJob({
    ...job,
    status: "running",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    const templateMeta = readTemplateMetaFromWorkspace(running.targetId, workspacePath);
    const readingMap = generateTemplateReadingMap({
      templateId: running.targetId,
      templateName: running.targetTitle ?? templateMeta.name,
      templateDescription: running.targetDescription ?? templateMeta.description,
      workspacePath
    });
    const readingMapPath = store.writeTemplateReadingMap(running.targetId, readingMap);
    return store.writeIndexJob({
      ...running,
      status: "ready",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      readingMapPath,
      itemCount: readingMap.structure.pages.length + readingMap.structure.configs.length + readingMap.structure.knowledgeDocuments.length
    });
  } catch (error) {
    return store.writeIndexJob({
      ...running,
      status: "failed",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
function generateTemplateReadingMap(input) {
  const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const pages2 = readWorkspacePages(input.workspacePath);
  const configs = readWorkspaceConfigs(input.workspacePath);
  const knowledgeDocuments = readWorkspaceKnowledgeDocuments(input.workspacePath);
  const originalEntries = [
    ...pages2,
    ...configs,
    ...knowledgeDocuments
  ];
  return {
    id: `reading-map:${input.templateId}`,
    targetType: "template",
    targetId: input.templateId,
    overview: {
      title: input.templateName,
      scene: input.templateDescription,
      pageCount: pages2.length,
      configCount: configs.length,
      knowledgeCount: knowledgeDocuments.length,
      updatedAt: now
    },
    structure: {
      pages: pages2,
      configs,
      knowledgeDocuments,
      assets: []
    },
    localSummaries: originalEntries,
    taskEntries: buildTaskEntries(pages2, configs, knowledgeDocuments),
    originalEntries
  };
}
function readTemplateMetaFromWorkspace(templateId, workspacePath) {
  const templateJsonPath = path.join(path.dirname(workspacePath), "template.json");
  const parsed = readJson(templateJsonPath);
  return {
    name: typeof parsed?.name === "string" ? parsed.name : templateId,
    description: typeof parsed?.description === "string" ? parsed.description : "\u6A21\u677F\u57FA\u7840\u9605\u8BFB\u5730\u56FE"
  };
}
function readWorkspacePages(workspacePath) {
  const tree = readJson(path.join(workspacePath, "workspace-tree.json"));
  return (tree?.pages ?? []).map((page, index) => {
    const id = typeof page.id === "string" ? page.id : `page-${index + 1}`;
    const title = typeof page.name === "string" ? page.name : id;
    const filePath = typeof page.file === "string" ? page.file : typeof page.path === "string" ? page.path : `pages/${id}.tsx`;
    return {
      id,
      title,
      name: title,
      path: filePath,
      summary: `\u9875\u9762\uFF1A${title}`,
      order: typeof page.order === "number" ? page.order : index
    };
  }).sort((left, right) => left.order - right.order).map(({ order: _order, name: _name, ...entry }) => entry);
}
function readWorkspaceConfigs(workspacePath) {
  const configPath = path.join(workspacePath, "project.config.schema.json");
  if (!fs.existsSync(configPath))
    return [];
  const schema = readJson(configPath);
  const propertyNames = schema?.properties ? Object.keys(schema.properties) : [];
  return [
    {
      id: "project-config-schema",
      title: typeof schema?.title === "string" ? schema.title : "\u9879\u76EE\u914D\u7F6E",
      path: "project.config.schema.json",
      summary: propertyNames.length > 0 ? `\u5305\u542B\u914D\u7F6E\u9879\uFF1A${propertyNames.join(", ")}` : "\u9879\u76EE\u914D\u7F6E Schema"
    }
  ];
}
function readWorkspaceKnowledgeDocuments(workspacePath) {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  const manifest = readJson(path.join(knowledgeDir, "manifest.json"));
  if (manifest?.items?.length) {
    return manifest.items.map((item, index) => {
      const manifestPath = typeof item.path === "string" ? item.path : typeof item.fileName === "string" ? item.fileName : "";
      const fileName = safeKnowledgeRelativePath(manifestPath);
      if (!fileName)
        return null;
      return {
        id: typeof item.id === "string" ? item.id : `knowledge-${index + 1}`,
        title: typeof item.title === "string" ? item.title : fileName,
        path: `knowledge/${fileName}`,
        summary: typeof item.description === "string" && item.description.trim() ? item.description : `\u77E5\u8BC6\u6587\u6863\uFF1A${fileName}`,
        tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : []
      };
    }).filter((entry) => Boolean(entry));
  }
  if (!fs.existsSync(knowledgeDir))
    return [];
  return fs.readdirSync(knowledgeDir).filter((fileName) => fileName.endsWith(".md")).map((fileName) => ({
    id: `knowledge:${fileName}`,
    title: fileName.replace(/\.md$/, ""),
    path: `knowledge/${fileName}`,
    summary: `\u77E5\u8BC6\u6587\u6863\uFF1A${fileName}`
  }));
}
function safeKnowledgeRelativePath(value) {
  const normalized = value.replace(/\\/g, "/").replace(/^knowledge\//, "");
  if (!normalized || path.isAbsolute(normalized))
    return null;
  const parts = normalized.split("/");
  if (parts.includes("..") || parts.some((part) => part.trim() === ""))
    return null;
  if (!normalized.endsWith(".md"))
    return null;
  return normalized;
}
function buildTaskEntries(pages2, configs, docs) {
  const entries = [
    {
      taskType: "\u4FEE\u6539\u9875\u9762",
      description: "\u5148\u9605\u8BFB\u76F8\u5173\u9875\u9762\u6458\u8981\uFF0C\u518D\u6253\u5F00\u9875\u9762\u539F\u6587\u3002",
      recommendedPaths: pages2.map((page) => page.path)
    },
    {
      taskType: "\u4FEE\u6539\u914D\u7F6E",
      description: "\u5148\u786E\u8BA4\u914D\u7F6E Schema\uFF0C\u518D\u7ED3\u5408\u77E5\u8BC6\u6587\u6863\u5224\u65AD\u4E1A\u52A1\u7EA6\u675F\u3002",
      recommendedPaths: [...configs.map((config) => config.path), ...docs.map((doc) => doc.path)]
    },
    {
      taskType: "\u6392\u67E5\u5F02\u5E38",
      description: "\u4ECE\u9875\u9762\u3001\u914D\u7F6E\u548C\u77E5\u8BC6\u6587\u6863\u4E09\u4E2A\u5165\u53E3\u4EA4\u53C9\u786E\u8BA4\u3002",
      recommendedPaths: [...pages2, ...configs, ...docs].map((entry) => entry.path)
    }
  ];
  return entries.filter((entry) => entry.recommendedPaths.length > 0);
}
function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
function readJson(filePath) {
  if (!fs.existsSync(filePath))
    return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

// packages/project-core/src/config.ts
import fs2 from "node:fs";
import path2 from "node:path";
var DEFAULT_AGENT_SERVICE_URL = "http://localhost:3201";
var DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:3202";
var DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE = 20;
function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}
function parseCsvEnv(value) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function findProjectRoot(cwd) {
  let current = path2.resolve(cwd);
  while (current !== path2.dirname(current)) {
    if (fs2.existsSync(path2.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path2.dirname(current);
  }
  return cwd;
}
function getProjectAdminDataDir(cwd = process.cwd()) {
  return process.env.DATA_DIR ?? path2.join(findProjectRoot(cwd), "data");
}
function getProjectAdminAuditDir(dataDir) {
  return process.env.PROJECT_ADMIN_AUDIT_DIR ?? path2.join(dataDir, "audit", "project-admin");
}
function getProjectAdminMaxBatchSize() {
  return Number(
    process.env.PROJECT_ADMIN_MAX_BATCH_SIZE || DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE
  );
}
function getProjectAdminMode(writable) {
  return process.env.PROJECT_ADMIN_CLI_MODE === "local" ? "local" : writable ? "cli" : "readonly";
}
function getProjectAdminActorEnv() {
  const role = process.env.PROJECT_ADMIN_ROLE ?? "admin";
  const user = process.env.USER ?? "local-codex";
  return {
    id: user,
    name: user,
    role: ["admin", "creator", "readonly"].includes(role) ? role : "admin",
    source: "project-admin-core",
    allowedProjectIds: parseCsvEnv(process.env.PROJECT_ADMIN_ALLOWED_PROJECTS)
  };
}
function getViewerBaseUrl() {
  return trimTrailingSlashes(
    process.env.VIEWER_CLOUDFLARE_URL || process.env.VIEWER_LAN_URL || ""
  );
}
function getScreenshotServiceUrl() {
  return trimTrailingSlashes(
    process.env.SCREENSHOT_SERVICE_URL || process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL || DEFAULT_SCREENSHOT_SERVICE_URL
  );
}
function getAgentServiceUrl() {
  return trimTrailingSlashes(
    process.env.AGENT_SERVICE_URL || process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || DEFAULT_AGENT_SERVICE_URL
  );
}

// packages/project-core/src/service.ts
var DEFAULT_DEMO_CODE = `import React from 'react';

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
var DEFAULT_DEMO_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Demo \u914D\u7F6E",
    type: "object",
    properties: {
      title: { type: "string", title: "\u6807\u9898", default: "Hello World" },
      description: {
        type: "string",
        title: "\u63CF\u8FF0",
        default: "This is a demo"
      }
    },
    required: ["title"]
  },
  null,
  2
);
var WORKSPACE_TREE_FILENAME = "workspace-tree.json";
var APP_GRAPH_FILENAME = "app.graph.json";
var PROJECT_CONFIG_FILENAME = "project.config.schema.json";
var EDIT_TTL_MS = 2 * 60 * 60 * 1e3;
var MAX_VERSIONS_KEEP = 50;
var MAX_ASSET_SIZE = 10 * 1024 * 1024;
var ALLOWED_ASSET_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml"
]);
var DEFAULT_PROJECT_CATEGORY = "\u672A\u5206\u7C7B";
function normalizeProjectCategory(category) {
  const normalized = category?.trim();
  return normalized || DEFAULT_PROJECT_CATEGORY;
}
function nowId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function safeId(id, label) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new Error(`INVALID_${label.toUpperCase()}_ID`);
  }
  return id;
}
function ensureDir(dir) {
  fs3.mkdirSync(dir, { recursive: true });
}
function readJsonFile(filePath) {
  if (!fs3.existsSync(filePath))
    return null;
  try {
    return JSON.parse(fs3.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeJsonFile(filePath, value) {
  ensureDir(path3.dirname(filePath));
  fs3.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}
function copyWorkspace(source, target) {
  fs3.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path3.relative(source, sourcePath);
      if (!relative)
        return true;
      const segments = relative.split(path3.sep);
      return !segments.some(
        (segment) => ["node_modules", ".next", ".opencode", ".git"].includes(segment)
      );
    }
  });
}
function countFiles(dir) {
  if (!fs3.existsSync(dir))
    return 0;
  let count = 0;
  for (const entry of fs3.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("."))
      continue;
    const entryPath = path3.join(dir, entry.name);
    count += entry.isDirectory() ? countFiles(entryPath) : 1;
  }
  return count;
}
function generatePageSlug(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 20).replace(/-$/, "");
  return slug || "page";
}
function isValidRouteKey(routeKey) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}
function makeUniqueRouteKey(base, used) {
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
function normalizePagesRouteKeys(pages2) {
  const used = /* @__PURE__ */ new Set();
  return pages2.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used)
    };
  });
}
function sortPages(pages2) {
  return [...pages2].sort((a, b) => {
    if (a.order !== b.order)
      return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}
function ok(data, extras = {}) {
  return { ok: true, data, ...extras };
}
function fail(code, message, extras = {}) {
  return {
    ok: false,
    error: { code, message, recoverable: true },
    ...extras
  };
}
var ProjectAdminService = class {
  constructor(config = {}) {
    this.config = config;
    this.dataDir = config.dataDir ?? getProjectAdminDataDir();
    this.projectsDir = path3.join(this.dataDir, "projects");
    this.templatesDir = path3.join(this.dataDir, "templates");
    this.workspacesDir = path3.join(this.dataDir, "workspaces");
    this.snapshotsDir = path3.join(this.dataDir, "snapshots");
    this.publishedDir = path3.join(this.dataDir, "published");
    this.sessionsDir = path3.join(this.dataDir, "sessions");
    this.agentRunLogsDir = path3.join(this.dataDir, "agent-run-logs");
    this.auditDir = config.auditDir ?? getProjectAdminAuditDir(this.dataDir);
    this.internalDir = path3.join(this.dataDir, ".project-admin");
    this.editsDir = path3.join(this.internalDir, "edits");
    this.plansDir = path3.join(this.internalDir, "plans");
    this.maxBatchSize = config.maxBatchSize ?? getProjectAdminMaxBatchSize();
  }
  dataDir;
  projectsDir;
  templatesDir;
  workspacesDir;
  snapshotsDir;
  publishedDir;
  sessionsDir;
  agentRunLogsDir;
  auditDir;
  internalDir;
  editsDir;
  plansDir;
  maxBatchSize;
  ensureDirs() {
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
      this.plansDir
    ].forEach(ensureDir);
  }
  capabilities(actor2 = this.defaultActor()) {
    const writable = actor2.role !== "readonly";
    return ok({
      actor: actor2,
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
        "admin_*"
      ]
    });
  }
  defaultActor() {
    const actor2 = getProjectAdminActorEnv();
    return {
      ...actor2,
      allowedProjectIds: actor2.allowedProjectIds && actor2.allowedProjectIds.length > 0 ? actor2.allowedProjectIds : void 0
    };
  }
  listProjects(actor2 = this.defaultActor()) {
    this.ensureDirs();
    const projects = [];
    for (const entry of fs3.readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue;
      if (!this.canAccessProject(entry.name, actor2))
        continue;
      const projectPath = this.getProjectPath(entry.name);
      const stats = fs3.statSync(projectPath);
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
        locked: this.isProjectLocked(entry.name)
      });
    }
    return ok(projects.sort((a, b) => b.updatedAt - a.updatedAt));
  }
  getProject(projectId2, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const workspacePath = this.projectWorkspacePath(projectId2);
    const tree = this.readWorkspaceTree(workspacePath);
    return ok({
      project: {
        ...project,
        demoPages: sortPages(tree.pages),
        demoFolders: tree.folders
      },
      pages: sortPages(tree.pages),
      folders: tree.folders,
      versions: [...project.versions].reverse(),
      projectConfigSchema: this.readProjectConfig(workspacePath) ?? void 0,
      locked: this.isProjectLocked(projectId2)
    });
  }
  exportProjectPackage(projectId2, actor2 = this.defaultActor()) {
    const detail = this.getProject(projectId2, actor2);
    if (!detail.ok || !detail.data) {
      return fail(detail.error?.code ?? "PROJECT_NOT_FOUND", detail.error?.message ?? "\u9879\u76EE\u4E0D\u5B58\u5728");
    }
    const workspacePath = this.projectWorkspacePath(projectId2);
    const pages2 = [];
    for (const page of detail.data.pages) {
      const files = this.readPageFiles(workspacePath, page.id);
      if (!files) {
        return fail("FILE_READ_ERROR", `\u9875\u9762\u6587\u4EF6\u4E0D\u5B58\u5728: ${page.id}`);
      }
      pages2.push({ meta: page, files });
    }
    const assets = this.walkFiles(path3.join(workspacePath, "assets")).filter((file) => fs3.statSync(file).isFile()).map((file) => {
      const relativePath = ["assets", path3.relative(path3.join(workspacePath, "assets"), file)].join("/").split(path3.sep).join("/");
      const buffer = fs3.readFileSync(file);
      return {
        path: relativePath,
        dataBase64: buffer.toString("base64"),
        size: buffer.length
      };
    });
    const knowledgeFiles = this.walkFiles(path3.join(workspacePath, "knowledge")).filter((file) => fs3.statSync(file).isFile()).map((file) => {
      const relativePath = ["knowledge", path3.relative(path3.join(workspacePath, "knowledge"), file)].join("/").split(path3.sep).join("/");
      const buffer = fs3.readFileSync(file);
      return {
        path: relativePath,
        dataBase64: buffer.toString("base64"),
        size: buffer.length
      };
    });
    const baseVersion = detail.data.versions[0]?.versionId ?? "v0";
    return ok({
      project: detail.data.project,
      pages: pages2,
      folders: detail.data.folders,
      versions: detail.data.versions,
      projectConfigSchema: detail.data.projectConfigSchema,
      appGraph: this.readAppGraph(workspacePath),
      assets,
      knowledgeFiles,
      baseVersion
    });
  }
  createProject(input, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const name = input.name.trim();
    if (!name)
      return fail("INVALID_REQUEST", "\u9879\u76EE\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
    const category = normalizeProjectCategory(input.category);
    if (input.dryRun) {
      return ok(
        {
          id: "dry-run",
          name,
          category,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          demoCount: 0
        },
        {
          diffSummary: { created: [`project:${name}`] },
          nextActions: ["project_create", "edit_begin"]
        }
      );
    }
    this.ensureDirs();
    const projectId2 = nowId("proj");
    const projectPath = this.getProjectPath(projectId2);
    const workspacePath = path3.join(projectPath, "workspace");
    ensureDir(projectPath);
    if (input.templateId) {
      const templateWorkspace = path3.join(this.getTemplatePath(input.templateId), "workspace");
      if (!fs3.existsSync(templateWorkspace)) {
        return fail("TEMPLATE_NOT_FOUND", "\u6A21\u677F\u4E0D\u5B58\u5728");
      }
      copyWorkspace(templateWorkspace, workspacePath);
    } else {
      ensureDir(path3.join(workspacePath, "demos"));
      this.writeWorkspaceTree(workspacePath, { pages: [], folders: [] });
    }
    const tree = this.readWorkspaceTree(workspacePath);
    const now = Date.now();
    const project = {
      id: projectId2,
      name,
      category,
      description: input.description,
      workspacePath,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: [],
      pageVersions: {},
      createdAt: now,
      updatedAt: now
    };
    this.writeProject(projectId2, project);
    const stats = fs3.statSync(projectPath);
    const result = {
      id: projectId2,
      name,
      category,
      createdAt: stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
      demoCount: project.demoPages.length,
      demoPages: project.demoPages
    };
    const auditId = this.audit("project_create", actor2, "L1", true, {
      projectId: projectId2,
      inputSummary: { name, category, templateId: input.templateId },
      diffSummary: { created: [`project:${projectId2}`] }
    });
    return ok(result, {
      auditId,
      diffSummary: { created: [`project:${projectId2}`] },
      nextActions: ["edit_begin", "project_get"]
    });
  }
  updateProject(input, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const access = this.requireProjectAccess(input.projectId, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(input.projectId);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const diff2 = { updated: [] };
    const next = { ...project };
    if (input.name !== void 0) {
      const name = input.name.trim();
      if (!name)
        return fail("INVALID_REQUEST", "\u9879\u76EE\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      next.name = name;
      diff2.updated?.push("project.name");
    }
    if (input.category !== void 0) {
      next.category = normalizeProjectCategory(input.category);
      diff2.updated?.push("project.category");
    }
    if (input.description !== void 0) {
      next.description = input.description;
      diff2.updated?.push("project.description");
    }
    next.updatedAt = Date.now();
    if (!input.dryRun)
      this.writeProject(project.id, next);
    const auditId = input.dryRun ? void 0 : this.audit("project_rename", actor2, "L1", true, {
      projectId: project.id,
      diffSummary: diff2
    });
    return ok(next, { auditId, diffSummary: diff2 });
  }
  duplicateProject(projectId2, name, category, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const source = this.readProject(projectId2);
    if (!source)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const templateId = this.createTemplateSnapshot(projectId2, {
      category: "\u4E34\u65F6\u590D\u5236",
      name: `${source.name} copy source`,
      description: "\u9879\u76EE\u590D\u5236\u4E34\u65F6\u5FEB\u7167"
    });
    const created = this.createProject(
      { name: name ?? `${source.name} \u526F\u672C`, category: normalizeProjectCategory(category ?? source.category), templateId },
      actor2
    );
    fs3.rmSync(this.getTemplatePath(templateId), { recursive: true, force: true });
    return created;
  }
  deleteProjectPreview(projectId2, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const plan = this.createPlan("project_delete", projectId2, [
      `\u5220\u9664\u9879\u76EE ${project.name}`,
      `\u5220\u9664 ${project.demoPages.length} \u4E2A\u9875\u9762`,
      "\u5220\u9664\u9879\u76EE\u5DE5\u4F5C\u7A7A\u95F4\u548C\u5143\u6570\u636E"
    ]);
    return ok(plan, {
      diffSummary: { deleted: [`project:${projectId2}`] },
      nextActions: ["project_delete_execute"]
    });
  }
  deleteProjectExecute(planId, confirmToken, actor2 = this.defaultActor()) {
    if (actor2.role !== "admin")
      return fail("FORBIDDEN", "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u5220\u9664\u9879\u76EE");
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "project_delete") {
      return fail("PLAN_NOT_FOUND", "\u5220\u9664\u9884\u89C8\u8BA1\u5212\u4E0D\u5B58\u5728");
    }
    if (plan.confirmToken !== confirmToken) {
      return fail("CONFIRMATION_REQUIRED", "\u786E\u8BA4 token \u4E0D\u5339\u914D");
    }
    const access = this.requireProjectAccess(plan.resourceId, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    fs3.rmSync(this.getProjectPath(plan.resourceId), { recursive: true, force: true });
    const auditId = this.audit("project_delete_execute", actor2, "L3", true, {
      projectId: plan.resourceId,
      resourceId: plan.resourceId,
      diffSummary: { deleted: [`project:${plan.resourceId}`] }
    });
    return ok(
      { deleted: true, projectId: plan.resourceId },
      { auditId, diffSummary: { deleted: [`project:${plan.resourceId}`] } }
    );
  }
  setProjectCover(projectId2, thumbnail, actor2 = this.defaultActor()) {
    return this.updateProject({ projectId: projectId2, description: void 0 }, actor2).ok ? this.patchProjectCover(projectId2, thumbnail, actor2) : fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
  }
  listTemplates(filter = {}) {
    this.ensureDirs();
    const templates = [];
    for (const entry of fs3.readdirSync(this.templatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue;
      const meta = this.readTemplate(entry.name);
      if (meta)
        templates.push(meta);
    }
    const filtered = templates.filter((template) => {
      if (filter.scope && template.scope !== filter.scope)
        return false;
      if (filter.official !== void 0 && Boolean(template.official) !== filter.official) {
        return false;
      }
      return true;
    });
    return ok(
      filtered.sort((a, b) => {
        if (Boolean(a.official) !== Boolean(b.official))
          return a.official ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      })
    );
  }
  getTemplate(templateId) {
    const template = this.readTemplate(templateId);
    if (!template)
      return fail("TEMPLATE_NOT_FOUND", "\u6A21\u677F\u4E0D\u5B58\u5728");
    return ok(template);
  }
  createTemplateFromProject(projectId2, input, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    if (this.isProjectLocked(projectId2) && actor2.role !== "admin") {
      return fail("PROJECT_LOCKED", "\u9879\u76EE\u5DF2\u88AB\u7BA1\u7406\u5458\u9501\u5B9A\uFF0C\u5F53\u524D\u4E0D\u80FD\u6253\u5F00\u7F16\u8F91\u4E8B\u52A1");
    }
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const templateId = this.createTemplateSnapshot(projectId2, input);
    const template = this.readTemplate(templateId);
    if (!template)
      return fail("FILE_WRITE_ERROR", "\u6A21\u677F\u5199\u5165\u5931\u8D25");
    const auditId = this.audit("template_create_from_project", actor2, "L2", true, {
      projectId: projectId2,
      resourceId: templateId,
      diffSummary: { created: [`template:${templateId}`] }
    });
    return ok(template, {
      auditId,
      diffSummary: { created: [`template:${templateId}`] }
    });
  }
  updateTemplateMeta(templateId, input, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const template = this.readTemplate(templateId);
    if (!template)
      return fail("TEMPLATE_NOT_FOUND", "\u6A21\u677F\u4E0D\u5B58\u5728");
    const updated2 = {
      ...template,
      category: input.category?.trim() || template.category,
      name: input.name?.trim() || template.name,
      description: input.description?.trim() || template.description,
      thumbnail: Object.prototype.hasOwnProperty.call(input, "thumbnail") ? input.thumbnail : template.thumbnail,
      scope: input.scope ?? template.scope,
      official: input.official ?? template.official,
      updatedAt: Date.now()
    };
    this.writeTemplate(templateId, updated2);
    const auditId = this.audit("template_update_meta", actor2, "L1", true, {
      resourceId: templateId,
      diffSummary: { updated: [`template:${templateId}`] }
    });
    return ok(updated2, { auditId, diffSummary: { updated: [`template:${templateId}`] } });
  }
  checkTemplateHealth(templateId) {
    this.ensureDirs();
    const templateIds = templateId ? [templateId] : fs3.readdirSync(this.templatesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const items = templateIds.map((id) => {
      const template = this.readTemplate(id);
      const issues = [];
      const workspacePath = path3.join(this.getTemplatePath(id), "workspace");
      if (!template) {
        issues.push({
          code: "TEMPLATE_META_INVALID",
          message: "\u6A21\u677F\u5143\u6570\u636E\u7F3A\u5931\u6216\u4E0D\u5B8C\u6574",
          resourceId: id,
          severity: "blocking"
        });
      }
      if (!fs3.existsSync(workspacePath)) {
        issues.push({
          code: "TEMPLATE_WORKSPACE_MISSING",
          message: "\u6A21\u677F workspace \u4E0D\u5B58\u5728",
          resourceId: id,
          severity: "blocking"
        });
      } else {
        const validation2 = this.validateWorkspace(workspacePath);
        issues.push(...validation2.issues);
        if (template && template.demoCount !== this.readWorkspaceTree(workspacePath).pages.length) {
          issues.push({
            code: "TEMPLATE_DEMO_COUNT_MISMATCH",
            message: "\u6A21\u677F\u9875\u9762\u6570\u91CF\u4E0E workspace-tree \u4E0D\u4E00\u81F4",
            resourceId: id,
            severity: "warning"
          });
        }
      }
      return {
        templateId: id,
        name: template?.name,
        scope: template?.scope,
        official: template?.official,
        ok: issues.every((issue) => issue.severity !== "blocking"),
        issues
      };
    });
    const report = {
      checkedAt: Date.now(),
      total: items.length,
      ok: items.every((item) => item.ok),
      items
    };
    writeJsonFile(path3.join(this.internalDir, "template-health", "latest.json"), report);
    return ok(report, {
      validation: {
        ok: report.ok,
        issues: items.flatMap((item) => item.issues)
      },
      nextActions: ["template_list", "template_get"]
    });
  }
  deleteTemplatePreview(templateId) {
    const template = this.readTemplate(templateId);
    if (!template)
      return fail("TEMPLATE_NOT_FOUND", "\u6A21\u677F\u4E0D\u5B58\u5728");
    return ok(
      this.createPlan("template_delete", templateId, [
        `\u5220\u9664\u6A21\u677F ${template.name}`,
        "\u4E0D\u4F1A\u5220\u9664\u5DF2\u4ECE\u8BE5\u6A21\u677F\u521B\u5EFA\u7684\u9879\u76EE"
      ]),
      { diffSummary: { deleted: [`template:${templateId}`] } }
    );
  }
  deleteTemplateExecute(planId, confirmToken, actor2 = this.defaultActor()) {
    if (actor2.role !== "admin")
      return fail("FORBIDDEN", "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u5220\u9664\u6A21\u677F");
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "template_delete") {
      return fail("PLAN_NOT_FOUND", "\u6A21\u677F\u5220\u9664\u9884\u89C8\u8BA1\u5212\u4E0D\u5B58\u5728");
    }
    if (plan.confirmToken !== confirmToken) {
      return fail("CONFIRMATION_REQUIRED", "\u786E\u8BA4 token \u4E0D\u5339\u914D");
    }
    fs3.rmSync(this.getTemplatePath(plan.resourceId), { recursive: true, force: true });
    const auditId = this.audit("template_delete_execute", actor2, "L3", true, {
      resourceId: plan.resourceId,
      diffSummary: { deleted: [`template:${plan.resourceId}`] }
    });
    return ok(
      { deleted: true, templateId: plan.resourceId },
      { auditId, diffSummary: { deleted: [`template:${plan.resourceId}`] } }
    );
  }
  convertTemplateToProject(templateId, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const template = this.readTemplate(templateId);
    if (!template)
      return fail("TEMPLATE_NOT_FOUND", "\u6A21\u677F\u4E0D\u5B58\u5728");
    const created = this.createProject(
      {
        name: template.name,
        category: template.category,
        description: template.description,
        templateId
      },
      actor2
    );
    if (!created.ok || !created.data)
      return created;
    fs3.rmSync(this.getTemplatePath(templateId), { recursive: true, force: true });
    const auditId = this.audit("template_convert_to_project", actor2, "L2", true, {
      projectId: created.data.id,
      resourceId: templateId,
      diffSummary: {
        created: [`project:${created.data.id}`],
        deleted: [`template:${templateId}`]
      }
    });
    return ok(created.data, {
      auditId,
      diffSummary: {
        created: [`project:${created.data.id}`],
        deleted: [`template:${templateId}`]
      },
      nextActions: ["project_get", "template_list"]
    });
  }
  recommendTemplate(description) {
    const templates = this.listTemplates().data ?? [];
    const query = description.toLowerCase();
    const scored = templates.map((template) => {
      const haystack = `${template.category} ${template.name} ${template.description}`.toLowerCase();
      const score = query.split(/\s+/).filter(Boolean).reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { template, score };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
      return ok({ templateId: null, reason: "\u6A21\u677F\u5E93\u4E3A\u7A7A", confidence: 0 });
    }
    return ok({
      templateId: best.template.id,
      reason: best.score > 0 ? "\u6A21\u677F\u5143\u4FE1\u606F\u4E0E\u63CF\u8FF0\u5B58\u5728\u5173\u952E\u8BCD\u5339\u914D" : "\u672A\u547D\u4E2D\u5173\u952E\u8BCD\uFF0C\u8FD4\u56DE\u6700\u8FD1\u66F4\u65B0\u6A21\u677F",
      confidence: best.score > 0 ? Math.min(0.95, 0.45 + best.score * 0.15) : 0.25,
      template: best.template
    });
  }
  instantiateTemplate(templateId, name, categoryOrActor, actor2 = this.defaultActor()) {
    const category = typeof categoryOrActor === "string" ? categoryOrActor : void 0;
    const effectiveActor = typeof categoryOrActor === "object" && categoryOrActor ? categoryOrActor : actor2;
    return this.createProject({ name, category, templateId }, effectiveActor);
  }
  beginEdit(projectId2, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    if (this.isProjectLocked(projectId2) && actor2.role !== "admin") {
      return fail("PROJECT_LOCKED", "\u9879\u76EE\u5DF2\u88AB\u7BA1\u7406\u5458\u9501\u5B9A\uFF0C\u5F53\u524D\u4E0D\u80FD\u6253\u5F00\u7F16\u8F91\u4E8B\u52A1");
    }
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const source = this.projectWorkspacePath(projectId2);
    if (!fs3.existsSync(source))
      return fail("WORKSPACE_NOT_FOUND", "\u9879\u76EE\u5DE5\u4F5C\u7A7A\u95F4\u4E0D\u5B58\u5728");
    const editId = nowId("edit");
    const workspacePrefix = actor2.source === "project-admin-cli" ? "cli" : "core";
    const workspaceId = `${workspacePrefix}_${editId}`;
    const workspacePath = path3.join(this.workspacesDir, actor2.id, projectId2, workspaceId);
    ensureDir(path3.dirname(workspacePath));
    copyWorkspace(source, workspacePath);
    const transaction = {
      editId,
      projectId: projectId2,
      workspaceId,
      workspacePath,
      baseVersion: project.versions.at(-1)?.versionId ?? "v0",
      actor: actor2,
      createdAt: Date.now(),
      expiresAt: Date.now() + EDIT_TTL_MS,
      status: "editing"
    };
    this.writeEdit(transaction);
    const auditId = this.audit("edit_begin", actor2, "L1", true, {
      projectId: projectId2,
      resourceId: editId
    });
    return ok(transaction, { auditId, nextActions: ["page_list", "edit_validate"] });
  }
  editStatus(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    return ok({
      transaction: this.refreshEditStatus(transaction),
      changedFiles: this.diffWorkspaceFiles(
        this.projectWorkspacePath(transaction.projectId),
        transaction.workspacePath
      )
    });
  }
  editDiff(editId) {
    const status = this.editStatus(editId);
    if (!status.ok || !status.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    return ok({
      updated: status.data.changedFiles,
      notes: status.data.changedFiles.length === 0 ? ["\u5F53\u524D\u4E8B\u52A1\u6CA1\u6709\u6587\u4EF6\u5DEE\u5F02"] : [`\u5F53\u524D\u4E8B\u52A1\u5305\u542B ${status.data.changedFiles.length} \u4E2A\u53D8\u66F4\u6587\u4EF6`]
    });
  }
  editValidate(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const validation2 = this.validateWorkspace(transaction.workspacePath);
    return ok(validation2, { validation: validation2 });
  }
  commitEdit(editId, note, actor2 = this.defaultActor()) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    if (transaction.status !== "editing") {
      return fail("EDIT_NOT_EDITING", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5728\u53EF\u63D0\u4EA4\u72B6\u6001");
    }
    if (Date.now() > transaction.expiresAt) {
      transaction.status = "expired";
      this.writeEdit(transaction);
      return fail("EDIT_EXPIRED", "\u7F16\u8F91\u4E8B\u52A1\u5DF2\u8FC7\u671F");
    }
    const project = this.readProject(transaction.projectId);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const currentVersion = project.versions.at(-1)?.versionId ?? "v0";
    if (currentVersion !== transaction.baseVersion) {
      return fail("EDIT_CONFLICT", "\u9879\u76EE\u5DF2\u88AB\u5176\u4ED6\u4E8B\u52A1\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u7F16\u8F91\u4E8B\u52A1", {
        validation: {
          ok: false,
          issues: [
            {
              code: "EDIT_CONFLICT",
              message: `\u5F53\u524D\u7248\u672C ${currentVersion} \u4E0E\u4E8B\u52A1\u57FA\u51C6 ${transaction.baseVersion} \u4E0D\u4E00\u81F4`,
              severity: "blocking"
            }
          ]
        }
      });
    }
    const validation2 = this.validateWorkspace(transaction.workspacePath);
    if (!validation2.ok) {
      return fail("VALIDATION_BLOCKED", "\u6821\u9A8C\u672A\u901A\u8FC7\uFF0C\u4E0D\u80FD\u63D0\u4EA4", { validation: validation2 });
    }
    const projectWorkspace = this.projectWorkspacePath(transaction.projectId);
    const changedFiles = this.diffWorkspaceFiles(projectWorkspace, transaction.workspacePath);
    fs3.rmSync(projectWorkspace, { recursive: true, force: true });
    copyWorkspace(transaction.workspacePath, projectWorkspace);
    const version = this.createProjectVersion(project, projectWorkspace, actor2.name, editId, note, "named_version");
    const tree = this.readWorkspaceTree(projectWorkspace);
    const updatedProject = {
      ...project,
      workspacePath: projectWorkspace,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: this.compactProjectVersions([...project.versions, version]),
      updatedAt: Date.now()
    };
    this.writeProject(project.id, updatedProject);
    transaction.status = "committed";
    this.writeEdit(transaction);
    const diffSummary = {
      updated: changedFiles,
      notes: [`\u751F\u6210\u7248\u672C ${version.versionId}`]
    };
    const auditId = this.audit("edit_commit", actor2, "L2", true, {
      projectId: project.id,
      resourceId: editId,
      diffSummary,
      validation: validation2
    });
    return ok(
      { version, project: updatedProject },
      { auditId, diffSummary, validation: validation2, nextActions: ["project_get"] }
    );
  }
  discardEdit(editId, actor2 = this.defaultActor()) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    transaction.status = "discarded";
    this.writeEdit(transaction);
    fs3.rmSync(transaction.workspacePath, { recursive: true, force: true });
    const auditId = this.audit("edit_discard", actor2, "L1", true, {
      projectId: transaction.projectId,
      resourceId: editId
    });
    return ok({ discarded: true }, { auditId });
  }
  extendEdit(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    transaction.expiresAt = Date.now() + EDIT_TTL_MS;
    this.writeEdit(transaction);
    return ok(transaction);
  }
  listPages(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    return ok({ pages: sortPages(tree.pages), folders: tree.folders });
  }
  getPage(editId, pageId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const page = this.findPage(transaction.workspacePath, pageId);
    if (!page)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const files = this.readPageFiles(transaction.workspacePath, pageId);
    if (!files)
      return fail("FILE_READ_ERROR", "\u9875\u9762\u6587\u4EF6\u4E0D\u5B58\u5728");
    return ok({ meta: page, files });
  }
  pageVersionList(projectId2, pageId, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const versions = [...project.pageVersions?.[pageId] ?? []].reverse();
    return ok({
      projectId: projectId2,
      pageId,
      currentVersion: versions[0]?.versionId ?? "v0",
      versions,
      totalVersions: versions.length
    });
  }
  pageVersionGet(projectId2, pageId, versionId, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const version = project.pageVersions?.[pageId]?.find((item) => item.versionId === versionId);
    if (!version)
      return fail("VERSION_NOT_FOUND", `\u9875\u9762\u7248\u672C ${versionId} \u4E0D\u5B58\u5728`);
    const files = this.readPageVersionFiles(project, pageId, versionId);
    if (!files)
      return fail("VERSION_SNAPSHOT_MISSING", `\u9875\u9762\u7248\u672C\u5FEB\u7167\u5DF2\u4E22\u5931: ${versionId}`);
    return ok({ projectId: projectId2, pageId, version, files });
  }
  createPage(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const parentId = input.parentId ?? null;
    if (parentId && !tree.folders.some((folder) => folder.id === parentId)) {
      return fail("FOLDER_NOT_FOUND", "\u7236\u6587\u4EF6\u5939\u4E0D\u5B58\u5728");
    }
    const pageId = input.pageId ? safeId(input.pageId, "page") : `${generatePageSlug(input.name)}_${Math.random().toString(36).slice(2, 6)}`;
    if (tree.pages.some((page) => page.id === pageId)) {
      return fail("PAGE_ID_CONFLICT", `\u9875\u9762 id \u5DF2\u5B58\u5728: ${pageId}`);
    }
    const meta = {
      id: pageId,
      name: input.name.trim() || "Untitled",
      routeKey: makeUniqueRouteKey(
        input.routeKey ?? input.name,
        new Set(tree.pages.map((page) => page.routeKey).filter(Boolean))
      ),
      order: input.order ?? tree.pages.length,
      parentId
    };
    if (input.dryRun) {
      return ok(
        { meta, files: { code: input.code ?? DEFAULT_DEMO_CODE, schema: input.schema ?? DEFAULT_DEMO_SCHEMA } },
        { diffSummary: { created: [`page:${pageId}`] } }
      );
    }
    const demoDir = this.pageDir(workspacePath, pageId);
    ensureDir(demoDir);
    fs3.writeFileSync(path3.join(demoDir, "index.tsx"), input.code ?? DEFAULT_DEMO_CODE, "utf-8");
    fs3.writeFileSync(
      path3.join(demoDir, "config.schema.json"),
      input.schema ?? DEFAULT_DEMO_SCHEMA,
      "utf-8"
    );
    this.writeWorkspaceTree(workspacePath, { ...tree, pages: [...tree.pages, meta] });
    const auditId = this.audit("page_create", actor2, "L1", true, {
      projectId: transaction.data.projectId,
      resourceId: pageId,
      diffSummary: { created: [`page:${pageId}`] }
    });
    return ok(
      { meta, files: this.readPageFiles(workspacePath, pageId) ?? { code: "", schema: "" } },
      { auditId, diffSummary: { created: [`page:${pageId}`] } }
    );
  }
  duplicatePage(editId, pageId, name, actor2 = this.defaultActor()) {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    return this.createPage({
      editId,
      name: name ?? `${page.data.meta.name} \u526F\u672C`,
      parentId: page.data.meta.parentId,
      code: page.data.files.code,
      schema: page.data.files.schema
    }, actor2);
  }
  updatePage(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const workspacePath = transaction.data.workspacePath;
    const tree = this.readWorkspaceTree(workspacePath);
    const pageIndex = tree.pages.findIndex((page) => page.id === input.pageId);
    if (pageIndex === -1)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const current = tree.pages[pageIndex];
    const usedRouteKeys = new Set(
      tree.pages.filter((page) => page.id !== input.pageId).map((page) => page.routeKey).filter(Boolean)
    );
    const nextMeta = {
      ...current,
      name: input.name?.trim() || current.name,
      routeKey: input.routeKey ? makeUniqueRouteKey(input.routeKey, usedRouteKeys) : current.routeKey ?? makeUniqueRouteKey(input.name ?? current.name, usedRouteKeys),
      parentId: input.parentId !== void 0 ? input.parentId : current.parentId,
      order: input.order ?? current.order
    };
    if (nextMeta.parentId && !tree.folders.some((folder) => folder.id === nextMeta.parentId)) {
      return fail("FOLDER_NOT_FOUND", "\u7236\u6587\u4EF6\u5939\u4E0D\u5B58\u5728");
    }
    const validation2 = this.validateSchemaPair(
      this.readProjectConfig(workspacePath),
      input.schema ?? this.readPageFiles(workspacePath, input.pageId)?.schema
    );
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u9875\u9762 Schema \u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    const diff2 = { updated: [] };
    if (input.code !== void 0)
      diff2.updated?.push(`page:${input.pageId}:code`);
    if (input.schema !== void 0)
      diff2.updated?.push(`page:${input.pageId}:schema`);
    if (input.name !== void 0 || input.routeKey !== void 0 || input.parentId !== void 0 || input.order !== void 0) {
      diff2.updated?.push(`page:${input.pageId}:meta`);
    }
    if (!input.dryRun) {
      const demoDir = this.pageDir(workspacePath, input.pageId);
      if (input.code !== void 0) {
        fs3.writeFileSync(path3.join(demoDir, "index.tsx"), input.code, "utf-8");
      }
      if (input.schema !== void 0) {
        fs3.writeFileSync(path3.join(demoDir, "config.schema.json"), input.schema, "utf-8");
      }
      const pages2 = [...tree.pages];
      pages2[pageIndex] = nextMeta;
      this.writeWorkspaceTree(workspacePath, { ...tree, pages: pages2 });
    }
    const auditId = input.dryRun ? void 0 : this.audit("page_update", actor2, "L1", true, {
      projectId: transaction.data.projectId,
      resourceId: input.pageId,
      diffSummary: diff2,
      validation: validation2
    });
    const files = this.readPageFiles(workspacePath, input.pageId) ?? {
      code: input.code ?? "",
      schema: input.schema ?? ""
    };
    return ok({ meta: nextMeta, files }, { auditId, diffSummary: diff2, validation: validation2 });
  }
  createPageVersion(input, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const access = this.requireProjectAccess(input.projectId, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    if (this.isProjectLocked(input.projectId) && actor2.role !== "admin") {
      return fail("PROJECT_LOCKED", "\u9879\u76EE\u5DF2\u88AB\u7BA1\u7406\u5458\u9501\u5B9A\uFF0C\u5F53\u524D\u4E0D\u80FD\u521B\u5EFA\u9875\u9762\u7248\u672C");
    }
    const project = this.readProject(input.projectId);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    let sourceWorkspacePath = this.projectWorkspacePath(input.projectId);
    if (input.editId) {
      const transaction = this.requireEditable(input.editId);
      if (!transaction.ok || !transaction.data)
        return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
      if (transaction.data.projectId !== input.projectId) {
        return fail("INVALID_REQUEST", "editId \u4E0E projectId \u4E0D\u5339\u914D");
      }
      sourceWorkspacePath = transaction.data.workspacePath;
    }
    const page = this.findPage(sourceWorkspacePath, input.pageId) ?? this.findPage(this.projectWorkspacePath(input.projectId), input.pageId);
    if (!page)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const files = this.readPageFiles(sourceWorkspacePath, input.pageId);
    if (!files)
      return fail("FILE_READ_ERROR", "\u9875\u9762\u6587\u4EF6\u4E0D\u5B58\u5728");
    const validation2 = this.validateSchemaPair(this.readProjectConfig(sourceWorkspacePath), files.schema);
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u9875\u9762 Schema \u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    const savedAt = Date.now();
    const versionId = this.generateVersionId(project);
    const snapshotPath = path3.join(this.snapshotsDir, input.projectId, "pages", input.pageId, versionId);
    fs3.rmSync(snapshotPath, { recursive: true, force: true });
    ensureDir(snapshotPath);
    fs3.writeFileSync(path3.join(snapshotPath, "index.tsx"), files.code, "utf-8");
    fs3.writeFileSync(path3.join(snapshotPath, "config.schema.json"), files.schema, "utf-8");
    const version = {
      versionId,
      type: "named_version",
      demoId: input.pageId,
      demoName: page.name,
      savedAt,
      savedBy: actor2.name,
      sessionId: input.editId ?? `page-${input.pageId}`,
      snapshotPath,
      fileCount: 2,
      note: input.note
    };
    const existingVersions = project.pageVersions?.[input.pageId] ?? [];
    const overflow = Math.max(existingVersions.length + 1 - MAX_VERSIONS_KEEP, 0);
    for (const stale of existingVersions.slice(0, overflow)) {
      fs3.rmSync(stale.snapshotPath, { recursive: true, force: true });
    }
    const nextVersions = [...existingVersions.slice(overflow), version];
    const updatedProject = {
      ...project,
      pageVersions: {
        ...project.pageVersions ?? {},
        [input.pageId]: nextVersions
      },
      updatedAt: savedAt
    };
    this.writeProject(input.projectId, updatedProject);
    const auditId = this.audit("page_create_version", actor2, "L2", true, {
      projectId: input.projectId,
      resourceId: input.pageId,
      diffSummary: { created: [`page-version:${input.pageId}:${versionId}`] },
      validation: validation2
    });
    return ok(version, {
      auditId,
      diffSummary: { created: [`page-version:${input.pageId}:${versionId}`] },
      validation: validation2,
      nextActions: ["page_version_list", "page_version_get"]
    });
  }
  deletePagePreview(editId, pageIds) {
    if (pageIds.length > this.maxBatchSize) {
      return fail("BATCH_LIMIT_EXCEEDED", `\u6279\u91CF\u5220\u9664\u9875\u9762\u4E0D\u80FD\u8D85\u8FC7 ${this.maxBatchSize} \u4E2A`);
    }
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    const missing = pageIds.filter((id) => !tree.pages.some((page) => page.id === id));
    if (missing.length > 0)
      return fail("DEMO_PAGE_NOT_FOUND", `\u9875\u9762\u4E0D\u5B58\u5728: ${missing.join(", ")}`);
    return ok(
      this.createPlan("page_delete", editId, pageIds.map((id) => `\u5220\u9664\u9875\u9762 ${id}`), {
        pageIds
      }),
      { diffSummary: { deleted: pageIds.map((id) => `page:${id}`) } }
    );
  }
  deletePageExecute(planId, confirmToken, actor2 = this.defaultActor()) {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "page_delete")
      return fail("PLAN_NOT_FOUND", "\u9875\u9762\u5220\u9664\u8BA1\u5212\u4E0D\u5B58\u5728");
    if (plan.confirmToken !== confirmToken)
      return fail("CONFIRMATION_REQUIRED", "\u786E\u8BA4 token \u4E0D\u5339\u914D");
    const editId = plan.resourceId;
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const pageIds = Array.isArray(plan.extra?.pageIds) ? plan.extra.pageIds.filter((id) => typeof id === "string") : [];
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    for (const pageId of pageIds) {
      fs3.rmSync(this.pageDir(transaction.data.workspacePath, pageId), { recursive: true, force: true });
    }
    this.writeWorkspaceTree(transaction.data.workspacePath, {
      ...tree,
      pages: tree.pages.filter((page) => !pageIds.includes(page.id))
    });
    const diffSummary = { deleted: pageIds.map((id) => `page:${id}`) };
    const auditId = this.audit("page_delete_execute", actor2, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: editId,
      diffSummary
    });
    return ok({ deleted: pageIds }, { auditId, diffSummary });
  }
  reorderPages(editId, input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    if (input.pages.length > this.maxBatchSize) {
      return fail("BATCH_LIMIT_EXCEEDED", `\u6279\u91CF\u6392\u5E8F\u9875\u9762\u4E0D\u80FD\u8D85\u8FC7 ${this.maxBatchSize} \u4E2A`);
    }
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folders = input.folders ? tree.folders.map((folder) => {
      const patch = input.folders?.find((item) => item.id === folder.id);
      return patch ? { ...folder, order: patch.order, parentId: patch.parentId } : folder;
    }) : tree.folders;
    const pages2 = tree.pages.map((page) => {
      const patch = input.pages.find((item) => item.id === page.id);
      return patch ? { ...page, order: patch.order, parentId: patch.parentId } : page;
    });
    const validation2 = this.validateTree({ pages: pages2, folders });
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u9875\u9762\u6811\u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    this.writeWorkspaceTree(transaction.data.workspacePath, { pages: pages2, folders });
    const auditId = this.audit("page_reorder", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: editId,
      diffSummary: { updated: ["workspace-tree"] },
      validation: validation2
    });
    return ok({ pages: sortPages(pages2), folders }, { auditId, diffSummary: { updated: ["workspace-tree"] }, validation: validation2 });
  }
  restorePageVersion(projectId2, pageId, versionId, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u5199\u6743\u9650");
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    if (this.isProjectLocked(projectId2) && actor2.role !== "admin") {
      return fail("PROJECT_LOCKED", "\u9879\u76EE\u5DF2\u88AB\u7BA1\u7406\u5458\u9501\u5B9A\uFF0C\u5F53\u524D\u4E0D\u80FD\u6062\u590D\u9875\u9762\u7248\u672C");
    }
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const workspacePath = this.projectWorkspacePath(projectId2);
    const page = this.findPage(workspacePath, pageId);
    if (!page)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const targetVersion = project.pageVersions?.[pageId]?.find((version2) => version2.versionId === versionId);
    if (!targetVersion)
      return fail("VERSION_NOT_FOUND", `\u9875\u9762\u7248\u672C ${versionId} \u4E0D\u5B58\u5728`);
    const files = this.readPageVersionFiles(project, pageId, versionId);
    if (!files)
      return fail("VERSION_SNAPSHOT_MISSING", `\u9875\u9762\u7248\u672C\u5FEB\u7167\u5DF2\u4E22\u5931: ${versionId}`);
    const validation2 = this.validateSchemaPair(this.readProjectConfig(workspacePath), files.schema);
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u6062\u590D\u7248\u672C\u7684\u9875\u9762 Schema \u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    const demoDir = this.pageDir(workspacePath, pageId);
    fs3.writeFileSync(path3.join(demoDir, "index.tsx"), files.code, "utf-8");
    fs3.writeFileSync(path3.join(demoDir, "config.schema.json"), files.schema, "utf-8");
    const restoredAt = Date.now();
    const version = this.createProjectVersion(
      project,
      workspacePath,
      actor2.name,
      `restore-page-${pageId}-${versionId}`,
      `\u4ECE\u9875\u9762 ${page.name} \u7684\u5386\u53F2\u7248\u672C ${versionId} \u6062\u590D`,
      "restore_snapshot"
    );
    const tree = this.readWorkspaceTree(workspacePath);
    const updatedProject = {
      ...project,
      workspacePath,
      demoPages: sortPages(tree.pages),
      demoFolders: tree.folders,
      versions: this.compactProjectVersions([...project.versions, version]),
      updatedAt: restoredAt
    };
    this.writeProject(projectId2, updatedProject);
    const auditId = this.audit("page_restore_version", actor2, "L2", true, {
      projectId: projectId2,
      resourceId: pageId,
      diffSummary: {
        updated: [`demos/${pageId}/index.tsx`, `demos/${pageId}/config.schema.json`],
        notes: [`\u751F\u6210\u7248\u672C ${version.versionId}`]
      },
      validation: validation2
    });
    return ok(
      {
        success: true,
        newVersionId: version.versionId,
        restoredAt,
        files
      },
      {
        auditId,
        diffSummary: {
          updated: [`demos/${pageId}/index.tsx`, `demos/${pageId}/config.schema.json`],
          notes: [`\u751F\u6210\u7248\u672C ${version.versionId}`]
        },
        validation: validation2,
        nextActions: ["project_get"]
      }
    );
  }
  createFolder(editId, name, parentId = null, actor2 = this.defaultActor(), options = {}) {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folderId = options.folderId ? safeId(options.folderId, "folder") : nowId("folder");
    if (tree.folders.some((folder2) => folder2.id === folderId)) {
      return fail("FOLDER_ID_CONFLICT", `\u6587\u4EF6\u5939 id \u5DF2\u5B58\u5728: ${folderId}`);
    }
    const folder = {
      id: folderId,
      name: name.trim() || "\u672A\u547D\u540D\u6587\u4EF6\u5939",
      parentId,
      order: options.order ?? tree.folders.length
    };
    const nextTree = { ...tree, folders: [...tree.folders, folder] };
    const validation2 = this.validateTree(nextTree);
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u6587\u4EF6\u5939\u5C42\u7EA7\u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    if (options.dryRun)
      return ok(folder, { diffSummary: { created: [`folder:${folder.id}`] }, validation: validation2 });
    this.writeWorkspaceTree(transaction.data.workspacePath, nextTree);
    const auditId = this.audit("folder_create", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: folder.id,
      diffSummary: { created: [`folder:${folder.id}`] },
      validation: validation2
    });
    return ok(folder, { auditId, diffSummary: { created: [`folder:${folder.id}`] }, validation: validation2 });
  }
  updateFolder(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const folderIndex = tree.folders.findIndex((folder) => folder.id === input.folderId);
    if (folderIndex === -1)
      return fail("FOLDER_NOT_FOUND", "\u6587\u4EF6\u5939\u4E0D\u5B58\u5728");
    const nextFolder = {
      ...tree.folders[folderIndex],
      name: input.name?.trim() || tree.folders[folderIndex].name,
      parentId: input.parentId !== void 0 ? input.parentId : tree.folders[folderIndex].parentId,
      order: input.order ?? tree.folders[folderIndex].order
    };
    const folders = [...tree.folders];
    folders[folderIndex] = nextFolder;
    const validation2 = this.validateTree({ ...tree, folders });
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u6587\u4EF6\u5939\u5C42\u7EA7\u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    if (!input.dryRun)
      this.writeWorkspaceTree(transaction.data.workspacePath, { ...tree, folders });
    const auditId = input.dryRun ? void 0 : this.audit("folder_update", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: input.folderId,
      diffSummary: { updated: [`folder:${input.folderId}`] },
      validation: validation2
    });
    return ok(nextFolder, { auditId, diffSummary: { updated: [`folder:${input.folderId}`] }, validation: validation2 });
  }
  deleteFolderPreview(editId, folderId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.workspacePath);
    const folder = tree.folders.find((item) => item.id === folderId);
    if (!folder)
      return fail("FOLDER_NOT_FOUND", "\u6587\u4EF6\u5939\u4E0D\u5B58\u5728");
    const childPages = tree.pages.filter((page) => page.parentId === folderId);
    return ok(
      this.createPlan("folder_delete", editId, [
        `\u5220\u9664\u6587\u4EF6\u5939 ${folder.name}`,
        `\u5F71\u54CD ${childPages.length} \u4E2A\u76F4\u63A5\u9875\u9762`
      ], { folderId }),
      { diffSummary: { deleted: [`folder:${folderId}`] } }
    );
  }
  deleteFolderExecute(planId, confirmToken, strategy, actor2 = this.defaultActor()) {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "folder_delete")
      return fail("PLAN_NOT_FOUND", "\u6587\u4EF6\u5939\u5220\u9664\u8BA1\u5212\u4E0D\u5B58\u5728");
    if (plan.confirmToken !== confirmToken)
      return fail("CONFIRMATION_REQUIRED", "\u786E\u8BA4 token \u4E0D\u5339\u914D");
    const folderId = typeof plan.extra?.folderId === "string" ? plan.extra.folderId : "";
    const transaction = this.requireEditable(plan.resourceId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const affectedPages = tree.pages.filter((page) => page.parentId === folderId).map((page) => page.id);
    const pages2 = strategy === "delete_contents" ? tree.pages.filter((page) => page.parentId !== folderId) : tree.pages.map((page) => page.parentId === folderId ? { ...page, parentId: null } : page);
    if (strategy === "delete_contents") {
      for (const pageId of affectedPages) {
        fs3.rmSync(this.pageDir(transaction.data.workspacePath, pageId), { recursive: true, force: true });
      }
    }
    this.writeWorkspaceTree(transaction.data.workspacePath, {
      pages: pages2,
      folders: tree.folders.filter((folder) => folder.id !== folderId).map((folder) => folder.parentId === folderId ? { ...folder, parentId: null } : folder)
    });
    const auditId = this.audit("folder_delete_execute", actor2, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: folderId,
      diffSummary: { deleted: [`folder:${folderId}`], updated: affectedPages.map((id) => `page:${id}`) }
    });
    return ok({ deletedFolderId: folderId, affectedPages }, { auditId });
  }
  getProjectConfig(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const schema = this.readProjectConfig(transaction.workspacePath);
    return ok({ schema: schema ?? void 0, exists: schema !== null });
  }
  setProjectConfig(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    if (input.schema === void 0)
      return fail("INVALID_REQUEST", "schema \u53C2\u6570\u5FC5\u586B");
    const validation2 = this.validateProjectConfigAgainstPages(transaction.data.workspacePath, input.schema);
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u9879\u76EE\u7EA7\u914D\u7F6E\u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    if (!input.dryRun) {
      fs3.writeFileSync(path3.join(transaction.data.workspacePath, PROJECT_CONFIG_FILENAME), input.schema, "utf-8");
    }
    const auditId = input.dryRun ? void 0 : this.audit("config_set_project_schema", actor2, "L1", true, {
      projectId: transaction.data.projectId,
      resourceId: input.editId,
      diffSummary: { updated: [PROJECT_CONFIG_FILENAME] },
      validation: validation2
    });
    return ok({ schema: input.schema, exists: true }, { auditId, validation: validation2, diffSummary: { updated: [PROJECT_CONFIG_FILENAME] } });
  }
  deleteProjectConfig(editId, dryRun = false, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const tree = this.readWorkspaceTree(transaction.data.workspacePath);
    const configPath = path3.join(transaction.data.workspacePath, PROJECT_CONFIG_FILENAME);
    if (!dryRun && fs3.existsSync(configPath))
      fs3.rmSync(configPath);
    const affectedPages = tree.pages.map((page) => page.id);
    const auditId = dryRun ? void 0 : this.audit("config_delete_project_schema", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: editId,
      diffSummary: { deleted: [PROJECT_CONFIG_FILENAME], updated: affectedPages.map((id) => `page:${id}`) }
    });
    return ok({ deleted: fs3.existsSync(configPath) ? false : !dryRun, affectedPages }, { auditId });
  }
  validatePageSchema(editId, pageId) {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const transaction = this.readEdit(editId);
    const validation2 = this.validateSchemaPair(
      transaction ? this.readProjectConfig(transaction.workspacePath) : null,
      page.data.files.schema
    );
    return ok(validation2, { validation: validation2 });
  }
  validateMergedSchema(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const validation2 = this.validateWorkspace(transaction.workspacePath);
    return ok(validation2, { validation: validation2 });
  }
  generateSchemaFromCode(editId, pageId) {
    const page = this.getPage(editId, pageId);
    if (!page.ok || !page.data)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    const props = [...page.data.files.code.matchAll(/props\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]);
    const uniqueProps = [...new Set(props)];
    const schema = JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: Object.fromEntries(
          uniqueProps.map((prop) => [prop, { type: "string", title: prop, default: "" }])
        )
      },
      null,
      2
    );
    return ok({ schema, applied: false }, { warnings: ["\u81EA\u52A8\u751F\u6210\u7ED3\u679C\u4EC5\u4F5C\u4E3A\u5019\u9009\uFF0C\u672A\u8986\u76D6\u9875\u9762 Schema"] });
  }
  applyVisualPatch(editId, pageId, patch) {
    const page = this.getPage(editId, pageId);
    if (!page.ok)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    return ok(
      { patch, applied: false },
      { warnings: ["\u5F53\u524D\u670D\u52A1\u4EC5\u8FD4\u56DE\u53EF\u89C6\u5316\u8865\u4E01\u5019\u9009\uFF1B\u5B9E\u9645\u914D\u7F6E\u503C\u5199\u5165\u4ECD\u7531 Web \u914D\u7F6E\u9762\u677F\u5904\u7406"] }
    );
  }
  listAssets(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const assets = [];
    for (const file of this.walkFiles(transaction.workspacePath)) {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) {
        const relative = path3.relative(transaction.workspacePath, file);
        assets.push({
          path: relative,
          size: fs3.statSync(file).size,
          references: this.findReferences(transaction.workspacePath, relative)
        });
      }
    }
    return ok({ assets });
  }
  uploadAsset(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const validation2 = this.validateAssetInput(input);
    if (!validation2.ok)
      return fail("VALIDATION_BLOCKED", "\u8D44\u4EA7\u6821\u9A8C\u5931\u8D25", { validation: validation2 });
    const buffer = Buffer.from(input.dataBase64, "base64");
    const filename = this.generateAssetFilename(input.filename);
    const relativePath = input.targetPath ? this.safeRelativeAssetPath(input.targetPath) : `assets/images/${filename}`;
    if (input.targetPath && relativePath.split("/")[0] !== "assets") {
      return fail("INVALID_ASSET_PATH", "targetPath \u5FC5\u987B\u4F4D\u4E8E assets/ \u76EE\u5F55\u4E0B");
    }
    const targetPath = path3.join(transaction.data.workspacePath, relativePath);
    const existed = fs3.existsSync(targetPath);
    const summary = {
      path: relativePath,
      size: buffer.length,
      references: []
    };
    if (input.dryRun) {
      return ok(summary, { diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] }, validation: validation2 });
    }
    ensureDir(path3.dirname(targetPath));
    fs3.writeFileSync(targetPath, buffer);
    const auditId = this.audit("asset_upload", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: relativePath,
      diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] },
      validation: validation2
    });
    return ok(summary, { auditId, diffSummary: existed ? { updated: [relativePath] } : { created: [relativePath] }, validation: validation2 });
  }
  deleteAssetPreview(editId, assetPath) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const relativePath = this.safeRelativeAssetPath(assetPath);
    const fullPath = path3.join(transaction.workspacePath, relativePath);
    if (!fs3.existsSync(fullPath))
      return fail("ASSET_NOT_FOUND", "\u8D44\u4EA7\u4E0D\u5B58\u5728");
    const references = this.findReferences(transaction.workspacePath, relativePath);
    return ok(
      this.createPlan("asset_delete", editId, [
        `\u5220\u9664\u8D44\u4EA7 ${relativePath}`,
        `\u5F71\u54CD ${references.length} \u4E2A\u5F15\u7528\u4F4D\u7F6E`
      ], { assetPath: relativePath }),
      {
        warnings: references.length > 0 ? ["\u8D44\u4EA7\u4ECD\u88AB\u5F15\u7528\uFF0C\u5220\u9664\u524D\u5EFA\u8BAE\u5148\u66FF\u6362\u5F15\u7528"] : void 0,
        diffSummary: { deleted: [relativePath], updated: references }
      }
    );
  }
  deleteAssetExecute(planId, confirmToken, actor2 = this.defaultActor()) {
    const plan = this.readPlan(planId);
    if (!plan || plan.operation !== "asset_delete")
      return fail("PLAN_NOT_FOUND", "\u8D44\u4EA7\u5220\u9664\u8BA1\u5212\u4E0D\u5B58\u5728");
    if (plan.confirmToken !== confirmToken)
      return fail("CONFIRMATION_REQUIRED", "\u786E\u8BA4 token \u4E0D\u5339\u914D");
    const transaction = this.requireEditable(plan.resourceId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const assetPath = typeof plan.extra?.assetPath === "string" ? plan.extra.assetPath : "";
    const relativePath = this.safeRelativeAssetPath(assetPath);
    fs3.rmSync(path3.join(transaction.data.workspacePath, relativePath), { force: true });
    const auditId = this.audit("asset_delete_execute", actor2, "L3", true, {
      projectId: transaction.data.projectId,
      resourceId: relativePath,
      diffSummary: { deleted: [relativePath] }
    });
    return ok({ deleted: relativePath }, { auditId, diffSummary: { deleted: [relativePath] } });
  }
  replaceAsset(input, actor2 = this.defaultActor()) {
    const transaction = this.requireEditable(input.editId);
    if (!transaction.ok || !transaction.data)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const oldPath = this.safeRelativeAssetPath(input.oldPath);
    const upload = this.uploadAsset(input, actor2);
    if (!upload.ok || !upload.data) {
      return fail(upload.error?.code ?? "UPLOAD_FAILED", upload.error?.message ?? "\u8D44\u4EA7\u4E0A\u4F20\u5931\u8D25", {
        warnings: upload.warnings,
        validation: upload.validation
      });
    }
    if (input.dryRun) {
      return ok(
        { oldPath, newAsset: upload.data, updatedReferences: [] },
        {
          warnings: upload.warnings,
          diffSummary: upload.diffSummary,
          validation: upload.validation
        }
      );
    }
    const updatedReferences = oldPath === upload.data.path ? [] : this.replaceReferences(
      transaction.data.workspacePath,
      oldPath,
      upload.data.path
    );
    const auditId = this.audit("asset_replace", actor2, "L2", true, {
      projectId: transaction.data.projectId,
      resourceId: oldPath,
      diffSummary: { created: [upload.data.path], updated: updatedReferences }
    });
    return ok(
      { oldPath, newAsset: upload.data, updatedReferences },
      { auditId, diffSummary: { created: [upload.data.path], updated: updatedReferences } }
    );
  }
  previewCompile(editId, pageId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const validation2 = pageId ? this.validatePageFiles(transaction.workspacePath, pageId) : this.validateWorkspace(transaction.workspacePath);
    return ok(validation2, {
      validation: validation2,
      warnings: ["CLI \u672C\u5730\u9AA8\u67B6\u6267\u884C\u9759\u6001\u6821\u9A8C\uFF1B\u5B8C\u6574\u7F16\u8BD1\u4ECD\u901A\u8FC7 author-site /api/compile \u6216 screenshot-service \u5B8C\u6210"]
    });
  }
  previewRender(editId, pageId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    const page = this.findPage(transaction.workspacePath, pageId);
    if (!page)
      return fail("DEMO_PAGE_NOT_FOUND", "\u9875\u9762\u4E0D\u5B58\u5728");
    return ok(
      {
        url: `/demo/${transaction.projectId}/edit?page=${encodeURIComponent(pageId)}`
      },
      { warnings: ["\u8FD4\u56DE Web \u7F16\u8F91\u9875\u9884\u89C8\u5165\u53E3\uFF1BCLI \u4E0D\u76F4\u63A5\u542F\u52A8 author-site"] }
    );
  }
  async previewScreenshot() {
    const health = await this.previewHealthcheck();
    const screenshotService = health.data?.screenshotService;
    return ok(
      {
        available: screenshotService === "ok",
        reason: screenshotService === "ok" ? void 0 : "\u622A\u56FE\u670D\u52A1\u672A\u5C31\u7EEA\uFF0C\u4E0D\u80FD\u76F4\u63A5\u6355\u83B7\u622A\u56FE",
        serviceUrl: this.getScreenshotServiceUrl()
      },
      {
        warnings: screenshotService === "ok" ? ["\u8BF7\u901A\u8FC7 author-site /api/screenshots/generate \u89E6\u53D1\u5177\u4F53\u622A\u56FE\u4EFB\u52A1"] : ["\u542F\u52A8 screenshot-service \u540E\u53EF\u901A\u8FC7 Web API \u89E6\u53D1\u622A\u56FE"]
      }
    );
  }
  previewLogs() {
    return ok({ logs: [] }, { warnings: ["\u5F53\u524D\u6CA1\u6709\u6301\u4E45\u5316\u7684\u9884\u89C8\u63A7\u5236\u53F0\u65E5\u5FD7"] });
  }
  async previewHealthcheck() {
    const serviceUrl = this.getScreenshotServiceUrl();
    let screenshotService = "unavailable";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3e3);
      const response = await fetch(`${serviceUrl}/health`, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      screenshotService = response.ok ? "ok" : "unavailable";
    } catch {
      screenshotService = "unavailable";
    }
    return ok({ core: true, screenshotService, authorSite: "not_checked", serviceUrl });
  }
  publishCheck(projectId2, actor2 = this.defaultActor()) {
    const detail = this.getProject(projectId2, actor2);
    if (!detail.ok || !detail.data)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const validation2 = this.validateWorkspace(this.projectWorkspacePath(projectId2));
    const issues = [...validation2.issues];
    if (detail.data.pages.length === 0) {
      issues.push({ code: "NO_CONTENT_TO_PUBLISH", message: "\u9879\u76EE\u6CA1\u6709\u53EF\u53D1\u5E03\u9875\u9762", severity: "blocking" });
    }
    const result = { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
    return ok(result, { validation: result });
  }
  viewerBaseUrl() {
    return getViewerBaseUrl();
  }
  buildPublishStatus(projectId2, input) {
    const project = this.readProject(projectId2);
    const pages2 = project?.demoPages ?? [];
    const artifactPath = input.artifactPath ?? path3.join(this.publishedDir, projectId2);
    const artifactExists = fs3.existsSync(artifactPath);
    const publishedProjectPath = path3.join(artifactPath, "project.json");
    const statusPath = path3.join(artifactPath, "project-admin-status.json");
    const publishedProject = fs3.existsSync(publishedProjectPath) ? readJsonFile(publishedProjectPath) : null;
    const publishedPages = publishedProject?.demoPages ?? [];
    const hasStatusArtifact = fs3.existsSync(statusPath) || input.published && Boolean(input.artifactPath);
    const entryPaths = publishedPages.length > 0 ? [
      "project.json",
      ...publishedPages.flatMap((page) => [
        page.compiledJsPath,
        page.iframeHtmlPath,
        page.schemaPath
      ].filter((entryPath) => Boolean(entryPath)))
    ] : hasStatusArtifact ? ["project-admin-status.json"] : [];
    const viewerBaseUrl = this.viewerBaseUrl();
    const dataBase = viewerBaseUrl ? `${viewerBaseUrl}/data/${projectId2}` : `/data/${projectId2}`;
    const viewerUrl = viewerBaseUrl ? `${viewerBaseUrl}/projects/${projectId2}` : `/projects/${projectId2}`;
    const hasFormalArtifact = Boolean(publishedProject);
    return {
      projectId: projectId2,
      published: input.published,
      publishedVersion: input.publishedVersion,
      publishedAt: input.publishedAt,
      artifactPath: artifactExists ? artifactPath : input.artifactPath,
      artifactSummary: {
        demoCount: publishedPages.length || pages2.length,
        projectJsonPath: hasFormalArtifact ? "project.json" : void 0,
        indexJsonPath: fs3.existsSync(path3.join(this.publishedDir, "projects-index.json")) ? "../projects-index.json" : void 0,
        entryPaths
      },
      accessUrls: {
        viewerUrl,
        dataUrl: hasFormalArtifact ? `${dataBase}/project.json` : void 0,
        embedUrls: (publishedPages.length > 0 ? publishedPages : pages2).map((page) => ({
          pageId: page.id,
          url: `${dataBase}/demos/${page.id}/iframe.html`
        }))
      }
    };
  }
  publishProject(projectId2, actor2 = this.defaultActor()) {
    if (actor2.role === "readonly")
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u6CA1\u6709\u53D1\u5E03\u6743\u9650");
    const check = this.publishCheck(projectId2, actor2);
    if (!check.ok || !check.data?.ok) {
      return fail("VALIDATION_BLOCKED", "\u53D1\u5E03\u524D\u68C0\u67E5\u672A\u901A\u8FC7", { validation: check.data });
    }
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const snapshot = this.createProjectVersion(
      project,
      this.projectWorkspacePath(projectId2),
      actor2.name,
      `publish-${Date.now()}`,
      "\u53D1\u5E03\u5FEB\u7167",
      "publish_snapshot"
    );
    const versionedProject = {
      ...project,
      versions: this.compactProjectVersions([...project.versions, snapshot]),
      updatedAt: Date.now()
    };
    this.writeProject(projectId2, versionedProject);
    const status = this.buildPublishStatus(projectId2, {
      published: true,
      publishedVersion: snapshot.versionId,
      publishedAt: Date.now(),
      artifactPath: path3.join(this.publishedDir, projectId2)
    });
    const updated2 = { ...versionedProject, publishedVersion: status.publishedVersion, publishedAt: status.publishedAt };
    this.writeProject(projectId2, updated2);
    ensureDir(status.artifactPath ?? "");
    writeJsonFile(path3.join(status.artifactPath ?? "", "project-admin-status.json"), status);
    const auditId = this.audit("publish_project", actor2, "L4", true, {
      projectId: projectId2,
      diffSummary: { updated: ["publishedVersion", "publishedAt"] }
    });
    return ok(status, {
      auditId,
      warnings: ["\u5F53\u524D CLI \u53D1\u5E03\u53EA\u66F4\u65B0\u53D1\u5E03\u72B6\u6001\uFF1B\u5B8C\u6574\u4EA7\u7269\u7F16\u8BD1\u9700\u914D\u7F6E AUTHOR_SITE_URL \u548C AUTHOR_SITE_AUTH_TOKEN \u540E\u4F7F\u7528 author-site publish API"],
      nextActions: ["\u914D\u7F6E AUTHOR_SITE_URL \u548C AUTHOR_SITE_AUTH_TOKEN \u540E\u8FD0\u884C ow publish project <projectId> --json"]
    });
  }
  publishStatus(projectId2, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    return ok(this.buildPublishStatus(projectId2, {
      published: Boolean(project.publishedVersion),
      publishedVersion: project.publishedVersion,
      publishedAt: project.publishedAt,
      artifactPath: fs3.existsSync(path3.join(this.publishedDir, projectId2)) ? path3.join(this.publishedDir, projectId2) : void 0
    }));
  }
  publishRollback(projectId2, actor2 = this.defaultActor()) {
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    if (project.versions.length < 2)
      return fail("VERSION_NOT_FOUND", "\u6CA1\u6709\u53EF\u56DE\u6EDA\u7684\u4E0A\u4E00\u7248\u672C");
    const previous = project.versions.at(-2);
    const updated2 = {
      ...project,
      publishedVersion: previous?.versionId,
      publishedAt: Date.now()
    };
    this.writeProject(projectId2, updated2);
    return this.publishStatus(projectId2, actor2);
  }
  auditList(projectId2) {
    this.ensureDirs();
    const events = this.walkFiles(this.auditDir).filter((file) => file.endsWith(".json")).map((file) => readJsonFile(file)).filter((event) => Boolean(event)).filter((event) => !projectId2 || event.projectId === projectId2).sort((a, b) => b.at - a.at);
    return ok(events);
  }
  auditGet(auditId) {
    const events = this.auditList().data ?? [];
    const event = events.find((item) => item.auditId === auditId);
    if (!event)
      return fail("AUDIT_NOT_FOUND", "\u5BA1\u8BA1\u8BB0\u5F55\u4E0D\u5B58\u5728");
    return ok(event);
  }
  aiSessionList(projectId2) {
    const sessions = this.scanAiSessions(projectId2);
    return ok({ projectId: projectId2, sessions });
  }
  aiSessionGet(sessionId) {
    const session = this.scanAiSessions().find((item) => item.sessionId === sessionId);
    if (!session)
      return fail("SESSION_NOT_FOUND", "AI \u4F1A\u8BDD\u4E0D\u5B58\u5728");
    return ok(session);
  }
  aiRunLogs(sessionId) {
    const logs = [];
    const candidateDirs = [
      path3.join(this.agentRunLogsDir, sessionId),
      ...this.walkFiles(this.agentRunLogsDir).filter((file) => file.includes(sessionId)).map((file) => path3.dirname(file))
    ];
    for (const dir of [...new Set(candidateDirs)]) {
      if (!fs3.existsSync(dir) || !fs3.statSync(dir).isDirectory())
        continue;
      for (const file of this.walkFiles(dir)) {
        if (!/\.(log|txt|json|jsonl)$/i.test(file))
          continue;
        logs.push(fs3.readFileSync(file, "utf-8"));
      }
    }
    return ok({ sessionId, logs });
  }
  aiWorkspaceContext(sessionId) {
    const session = this.aiSessionGet(sessionId);
    if (!session.ok || !session.data)
      return fail("SESSION_NOT_FOUND", "AI \u4F1A\u8BDD\u4E0D\u5B58\u5728");
    const workspacePath = session.data.workspaceId ? this.findWorkspacePathById(session.data.workspaceId) : void 0;
    return ok({
      sessionId,
      workspacePath,
      files: workspacePath ? this.walkFiles(workspacePath).map((file) => path3.relative(workspacePath, file)) : []
    });
  }
  async sendAiMessage(input, actor2 = this.defaultActor()) {
    const sessionId = input.sessionId.trim();
    const content = input.content.trim();
    if (!sessionId)
      return fail("INVALID_REQUEST", "sessionId \u4E0D\u80FD\u4E3A\u7A7A");
    if (!content)
      return fail("INVALID_REQUEST", "\u6D88\u606F\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    const session = this.aiSessionGet(sessionId);
    if (!session.ok || !session.data)
      return fail("SESSION_NOT_FOUND", "AI \u4F1A\u8BDD\u4E0D\u5B58\u5728");
    const projectId2 = input.projectId ?? session.data.projectId;
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const workspacePath = input.workingDir ?? (session.data.workspaceId ? this.findWorkspacePathById(session.data.workspaceId) : void 0);
    const body = {
      content,
      demoId: projectId2,
      workingDir: workspacePath,
      customWorkspace: Boolean(workspacePath),
      model: input.model,
      options: {
        stream: input.stream ?? false,
        timeout: input.timeout
      }
    };
    try {
      const response = await fetch(
        `${this.getAgentServiceUrl()}/api/agent/${encodeURIComponent(sessionId)}/message`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false || !payload?.data) {
        return fail(
          payload?.error?.code ?? "AGENT_SERVICE_ERROR",
          payload?.error?.message ?? `agent-service \u54CD\u5E94 ${response.status}`
        );
      }
      const auditId = this.audit("ai_send_message", actor2, "L2", true, {
        projectId: projectId2,
        resourceId: sessionId,
        inputSummary: { contentLength: content.length, model: input.model }
      });
      return ok(payload.data, {
        auditId,
        nextActions: ["ai_session_get", "ai_run_logs", "ai_workspace_context"]
      });
    } catch (error) {
      return fail(
        "AGENT_SERVICE_UNAVAILABLE",
        error instanceof Error ? error.message : "agent-service \u4E0D\u53EF\u7528",
        { warnings: [`\u8BF7\u786E\u8BA4 agent-service \u5DF2\u542F\u52A8: ${this.getAgentServiceUrl()}`] }
      );
    }
  }
  lockProject(projectId2, actor2 = this.defaultActor()) {
    if (actor2.role !== "admin")
      return fail("FORBIDDEN", "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u9501\u5B9A\u9879\u76EE");
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    writeJsonFile(this.projectLockPath(projectId2), {
      projectId: projectId2,
      lockedAt: Date.now(),
      actor: actor2
    });
    return ok({ locked: true, projectId: projectId2 });
  }
  unlockProject(projectId2, actor2 = this.defaultActor()) {
    if (actor2.role !== "admin")
      return fail("FORBIDDEN", "\u53EA\u6709\u7BA1\u7406\u5458\u53EF\u4EE5\u89E3\u9501\u9879\u76EE");
    const access = this.requireProjectAccess(projectId2, actor2);
    if (!access.ok)
      return fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
    fs3.rmSync(this.projectLockPath(projectId2), { force: true });
    return ok({ unlocked: true, projectId: projectId2 });
  }
  patchProjectCover(projectId2, thumbnail, actor2) {
    const project = this.readProject(projectId2);
    if (!project)
      return fail("PROJECT_NOT_FOUND", "\u9879\u76EE\u4E0D\u5B58\u5728");
    const updated2 = { ...project, thumbnail, updatedAt: Date.now() };
    this.writeProject(projectId2, updated2);
    const auditId = this.audit(thumbnail ? "project_set_cover" : "project_delete_cover", actor2, "L1", true, {
      projectId: projectId2,
      diffSummary: { updated: ["project.thumbnail"] }
    });
    return ok(updated2, { auditId, diffSummary: { updated: ["project.thumbnail"] } });
  }
  getProjectPath(projectId2) {
    return path3.join(this.projectsDir, safeId(projectId2, "project"));
  }
  getTemplatePath(templateId) {
    return path3.join(this.templatesDir, safeId(templateId, "template"));
  }
  projectWorkspacePath(projectId2) {
    return path3.join(this.getProjectPath(projectId2), "workspace");
  }
  readProject(projectId2) {
    const parsed = readJsonFile(path3.join(this.getProjectPath(projectId2), "project.json"));
    if (!parsed)
      return null;
    return {
      id: parsed.id ?? projectId2,
      name: parsed.name ?? projectId2,
      category: normalizeProjectCategory(parsed.category),
      description: parsed.description,
      workspacePath: parsed.workspacePath ?? this.projectWorkspacePath(projectId2),
      demoPages: Array.isArray(parsed.demoPages) ? parsed.demoPages : [],
      demoFolders: Array.isArray(parsed.demoFolders) ? parsed.demoFolders : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      pageVersions: parsed.pageVersions ?? {},
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? Date.now(),
      lockedDependencies: parsed.lockedDependencies,
      thumbnail: parsed.thumbnail,
      publishedVersion: parsed.publishedVersion,
      publishedAt: parsed.publishedAt
    };
  }
  writeProject(projectId2, project) {
    writeJsonFile(path3.join(this.getProjectPath(projectId2), "project.json"), project);
  }
  readTemplate(templateId) {
    const parsed = readJsonFile(path3.join(this.getTemplatePath(templateId), "template.json"));
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
      updatedAt: parsed.updatedAt ?? parsed.createdAt ?? Date.now()
    };
  }
  writeTemplate(templateId, template) {
    writeJsonFile(path3.join(this.getTemplatePath(templateId), "template.json"), template);
  }
  createTemplateSnapshot(projectId2, input) {
    const project = this.readProject(projectId2);
    if (!project)
      throw new Error("PROJECT_NOT_FOUND");
    const templateId = nowId("tmpl");
    const templatePath = this.getTemplatePath(templateId);
    const templateWorkspacePath = path3.join(templatePath, "workspace");
    ensureDir(templatePath);
    copyWorkspace(this.projectWorkspacePath(projectId2), templateWorkspacePath);
    const tree = this.readWorkspaceTree(templateWorkspacePath);
    const now = Date.now();
    const template = {
      id: templateId,
      sourceProjectId: projectId2,
      category: input.category.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      thumbnail: input.thumbnail ?? project.thumbnail,
      scope: input.scope ?? (input.official ? "official" : "team"),
      official: input.official ?? false,
      demoCount: tree.pages.length,
      demoPages: sortPages(tree.pages),
      createdAt: now,
      updatedAt: now
    };
    this.writeTemplate(templateId, template);
    indexTemplateSnapshot(new KnowledgeFileStore({ dataDir: this.dataDir }), {
      templateId,
      templateName: template.name,
      templateDescription: template.description,
      workspacePath: templateWorkspacePath
    });
    return templateId;
  }
  readWorkspaceTree(workspacePath) {
    const parsed = readJsonFile(path3.join(workspacePath, WORKSPACE_TREE_FILENAME));
    if (parsed) {
      return {
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        pages: Array.isArray(parsed.pages) ? normalizePagesRouteKeys(parsed.pages) : []
      };
    }
    const pages2 = [];
    const demosDir = path3.join(workspacePath, "demos");
    if (fs3.existsSync(demosDir)) {
      for (const entry of fs3.readdirSync(demosDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
          continue;
        if (fs3.existsSync(path3.join(demosDir, entry.name, "index.tsx"))) {
          pages2.push({
            id: entry.name,
            name: entry.name.split("_")[0].replace(/-/g, " "),
            routeKey: makeUniqueRouteKey(entry.name, new Set(pages2.map((page) => page.routeKey).filter(Boolean))),
            order: pages2.length,
            parentId: null
          });
        }
      }
    }
    const tree = { folders: [], pages: pages2 };
    this.writeWorkspaceTree(workspacePath, tree);
    return tree;
  }
  writeWorkspaceTree(workspacePath, tree) {
    ensureDir(workspacePath);
    writeJsonFile(path3.join(workspacePath, WORKSPACE_TREE_FILENAME), {
      folders: tree.folders,
      pages: sortPages(normalizePagesRouteKeys(tree.pages))
    });
  }
  readEdit(editId) {
    return readJsonFile(path3.join(this.editsDir, `${safeId(editId, "edit")}.json`));
  }
  writeEdit(transaction) {
    writeJsonFile(path3.join(this.editsDir, `${transaction.editId}.json`), transaction);
  }
  refreshEditStatus(transaction) {
    if (transaction.status === "editing" && Date.now() > transaction.expiresAt) {
      const expired = { ...transaction, status: "expired" };
      this.writeEdit(expired);
      return expired;
    }
    return transaction;
  }
  requireEditable(editId) {
    const transaction = this.readEdit(editId);
    if (!transaction)
      return fail("EDIT_NOT_FOUND", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5B58\u5728");
    if (transaction.status !== "editing")
      return fail("EDIT_NOT_EDITING", "\u7F16\u8F91\u4E8B\u52A1\u4E0D\u5728\u7F16\u8F91\u72B6\u6001");
    if (Date.now() > transaction.expiresAt)
      return fail("EDIT_EXPIRED", "\u7F16\u8F91\u4E8B\u52A1\u5DF2\u8FC7\u671F");
    return ok(transaction);
  }
  pageDir(workspacePath, pageId) {
    return path3.join(workspacePath, "demos", safeId(pageId, "page"));
  }
  findPage(workspacePath, pageId) {
    const tree = this.readWorkspaceTree(workspacePath);
    return tree.pages.find((page) => page.id === pageId) ?? null;
  }
  readPageFiles(workspacePath, pageId) {
    const demoDir = this.pageDir(workspacePath, pageId);
    const codePath = path3.join(demoDir, "index.tsx");
    const schemaPath = path3.join(demoDir, "config.schema.json");
    if (!fs3.existsSync(codePath) || !fs3.existsSync(schemaPath))
      return null;
    return {
      code: fs3.readFileSync(codePath, "utf-8"),
      schema: fs3.readFileSync(schemaPath, "utf-8")
    };
  }
  readPageVersionFiles(project, pageId, versionId) {
    const version = project.pageVersions?.[pageId]?.find((item) => item.versionId === versionId);
    if (!version || !fs3.existsSync(version.snapshotPath))
      return null;
    const codePath = path3.join(version.snapshotPath, "index.tsx");
    const schemaPath = path3.join(version.snapshotPath, "config.schema.json");
    if (!fs3.existsSync(codePath) || !fs3.existsSync(schemaPath))
      return null;
    return {
      code: fs3.readFileSync(codePath, "utf-8"),
      schema: fs3.readFileSync(schemaPath, "utf-8")
    };
  }
  readProjectConfig(workspacePath) {
    const configPath = path3.join(workspacePath, PROJECT_CONFIG_FILENAME);
    return fs3.existsSync(configPath) ? fs3.readFileSync(configPath, "utf-8") : null;
  }
  readAppGraph(workspacePath) {
    const tree = this.readWorkspaceTree(workspacePath);
    const graphPath = path3.join(workspacePath, APP_GRAPH_FILENAME);
    const parsed = readJsonFile(graphPath);
    const pages2 = {};
    for (const page of sortPages(tree.pages)) {
      if (!page.routeKey)
        continue;
      pages2[page.routeKey] = {
        pageId: page.id,
        title: page.name
      };
    }
    const pageKeys = new Set(Object.keys(pages2));
    const entry = parsed?.entry && pageKeys.has(parsed.entry) ? parsed.entry : Object.keys(pages2)[0] ?? "";
    const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    const state = parsed?.state && typeof parsed.state === "object" && !Array.isArray(parsed.state) ? parsed.state : {};
    return {
      version: 1,
      entry,
      pages: pages2,
      actions,
      state
    };
  }
  createProjectVersion(project, workspacePath, actorName, editId, note, type = "named_version") {
    const versionId = this.generateVersionId(project);
    const snapshotPath = path3.join(this.snapshotsDir, project.id, versionId);
    ensureDir(path3.dirname(snapshotPath));
    fs3.rmSync(snapshotPath, { recursive: true, force: true });
    copyWorkspace(workspacePath, snapshotPath);
    return {
      versionId,
      type,
      savedAt: Date.now(),
      savedBy: actorName,
      sessionId: editId,
      snapshotPath,
      fileCount: countFiles(workspacePath),
      note
    };
  }
  generateVersionId(project) {
    const pageVersions = Object.values(project.pageVersions ?? {}).flat();
    const maxVersion = [...project.versions, ...pageVersions].reduce((max, version) => {
      const match = /^v(\d+)$/.exec(version.versionId);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `v${maxVersion + 1}`;
  }
  compactProjectVersions(versions) {
    if (versions.length <= MAX_VERSIONS_KEEP)
      return versions;
    const removeCount = versions.length - MAX_VERSIONS_KEEP;
    const removable = versions.map((version, index) => ({ version, index })).filter(({ version }) => version.type === "auto_checkpoint");
    const fallback = versions.map((version, index) => ({ version, index }));
    const toRemove = [...removable, ...fallback].filter(
      (entry, index, all) => all.findIndex((item) => item.index === entry.index) === index
    ).slice(0, removeCount);
    const removeIndexes = new Set(toRemove.map((entry) => entry.index));
    for (const { version } of toRemove) {
      fs3.rmSync(version.snapshotPath, { recursive: true, force: true });
    }
    return versions.filter((_, index) => !removeIndexes.has(index));
  }
  diffWorkspaceFiles(basePath, nextPath) {
    const baseFiles = /* @__PURE__ */ new Map();
    const nextFiles = /* @__PURE__ */ new Map();
    for (const file of this.walkFiles(basePath)) {
      baseFiles.set(path3.relative(basePath, file), fs3.readFileSync(file, "utf-8"));
    }
    for (const file of this.walkFiles(nextPath)) {
      nextFiles.set(path3.relative(nextPath, file), fs3.readFileSync(file, "utf-8"));
    }
    const changed = /* @__PURE__ */ new Set();
    for (const [file, content] of nextFiles) {
      if (baseFiles.get(file) !== content)
        changed.add(file);
    }
    for (const file of baseFiles.keys()) {
      if (!nextFiles.has(file))
        changed.add(file);
    }
    return [...changed].sort();
  }
  walkFiles(dir) {
    if (!fs3.existsSync(dir))
      return [];
    const result = [];
    for (const entry of fs3.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git"].includes(entry.name))
        continue;
      const entryPath = path3.join(dir, entry.name);
      if (entry.isDirectory())
        result.push(...this.walkFiles(entryPath));
      if (entry.isFile())
        result.push(entryPath);
    }
    return result;
  }
  validateWorkspace(workspacePath) {
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
  validatePageFiles(workspacePath, pageId, projectSchema) {
    const files = this.readPageFiles(workspacePath, pageId);
    const issues = [];
    if (!files) {
      issues.push({ code: "FILE_READ_ERROR", message: `\u9875\u9762\u6587\u4EF6\u4E0D\u5B58\u5728: ${pageId}`, resourceId: pageId, severity: "blocking" });
      return { ok: false, issues };
    }
    if (!files.code.includes("export default")) {
      issues.push({ code: "NO_DEFAULT_EXPORT", message: `\u9875\u9762\u7F3A\u5C11 default export: ${pageId}`, resourceId: pageId, severity: "blocking" });
    }
    issues.push(...this.validateSchemaPair(projectSchema ?? null, files.schema).issues);
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }
  validateSchemaPair(projectSchema, pageSchema) {
    const issues = [];
    const projectKeys = /* @__PURE__ */ new Set();
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
            message: `\u9879\u76EE\u7EA7\u914D\u7F6E\u548C\u9875\u9762\u914D\u7F6E\u5B57\u6BB5\u51B2\u7A81: ${key}`,
            resourceId: key,
            severity: "blocking"
          });
        }
      }
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }
  validateProjectConfigAgainstPages(workspacePath, projectSchema) {
    const tree = this.readWorkspaceTree(workspacePath);
    const issues = [...this.validateSchemaPair(projectSchema, null).issues];
    for (const page of tree.pages) {
      const files = this.readPageFiles(workspacePath, page.id);
      if (files)
        issues.push(...this.validateSchemaPair(projectSchema, files.schema).issues);
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }
  parseSchema(schema, resourceId, issues) {
    try {
      const parsed = JSON.parse(schema);
      if (parsed.properties !== void 0 && (typeof parsed.properties !== "object" || Array.isArray(parsed.properties))) {
        issues.push({ code: "INVALID_SCHEMA", message: `${resourceId} properties \u5FC5\u987B\u662F\u5BF9\u8C61`, resourceId, severity: "blocking" });
      }
      return {
        properties: parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties) ? parsed.properties : {}
      };
    } catch {
      issues.push({ code: "INVALID_JSON", message: `${resourceId} \u4E0D\u662F\u5408\u6CD5 JSON`, resourceId, severity: "blocking" });
      return null;
    }
  }
  validateTree(tree) {
    const issues = [];
    const folderIds = new Set(tree.folders.map((folder) => folder.id));
    for (const folder of tree.folders) {
      if (folder.parentId && !folderIds.has(folder.parentId)) {
        issues.push({ code: "FOLDER_NOT_FOUND", message: `\u7236\u6587\u4EF6\u5939\u4E0D\u5B58\u5728: ${folder.parentId}`, resourceId: folder.id, severity: "blocking" });
      }
      if (folder.parentId && this.isFolderDescendant(tree.folders, folder.parentId, folder.id)) {
        issues.push({ code: "CIRCULAR_REFERENCE", message: "\u6587\u4EF6\u5939\u4E0D\u80FD\u79FB\u52A8\u5230\u81EA\u8EAB\u6216\u5B50\u7EA7", resourceId: folder.id, severity: "blocking" });
      }
      if (this.folderDepth(tree.folders, folder.id) > 3) {
        issues.push({ code: "FOLDER_DEPTH_EXCEEDED", message: "\u6587\u4EF6\u5939\u5D4C\u5957\u4E0D\u80FD\u8D85\u8FC7 3 \u5C42", resourceId: folder.id, severity: "blocking" });
      }
    }
    for (const page of tree.pages) {
      if (page.parentId && !folderIds.has(page.parentId)) {
        issues.push({ code: "FOLDER_NOT_FOUND", message: `\u9875\u9762\u7236\u6587\u4EF6\u5939\u4E0D\u5B58\u5728: ${page.parentId}`, resourceId: page.id, severity: "blocking" });
      }
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }
  folderDepth(folders, folderId) {
    let depth = 1;
    let current = folders.find((folder) => folder.id === folderId);
    while (current?.parentId) {
      depth += 1;
      current = folders.find((folder) => folder.id === current?.parentId);
    }
    return depth;
  }
  isFolderDescendant(folders, candidateId, ancestorId) {
    let current = folders.find((folder) => folder.id === candidateId);
    while (current) {
      if (current.parentId === ancestorId)
        return true;
      current = folders.find((folder) => folder.id === current?.parentId);
    }
    return false;
  }
  createPlan(operation, resourceId, impact, extra) {
    const plan = {
      planId: nowId("plan"),
      operation,
      resourceId,
      impact,
      reversible: true,
      confirmToken: nowId("confirm"),
      extra
    };
    writeJsonFile(path3.join(this.plansDir, `${plan.planId}.json`), plan);
    return plan;
  }
  readPlan(planId) {
    return readJsonFile(path3.join(this.plansDir, `${safeId(planId, "plan")}.json`));
  }
  projectLockPath(projectId2) {
    return path3.join(this.internalDir, "locks", `${safeId(projectId2, "project")}.json`);
  }
  isProjectLocked(projectId2) {
    return fs3.existsSync(this.projectLockPath(projectId2));
  }
  canAccessProject(projectId2, actor2) {
    return !actor2.allowedProjectIds || actor2.allowedProjectIds.includes(projectId2);
  }
  requireProjectAccess(projectId2, actor2) {
    return this.canAccessProject(projectId2, actor2) ? ok(true) : fail("FORBIDDEN", "\u5F53\u524D\u64CD\u4F5C\u8005\u65E0\u6743\u8BBF\u95EE\u8BE5\u9879\u76EE");
  }
  scanAiSessions(projectId2) {
    if (!fs3.existsSync(this.sessionsDir))
      return [];
    const sessions = [];
    for (const file of this.walkFiles(this.sessionsDir)) {
      if (!file.endsWith(".session.json"))
        continue;
      const parsed = readJsonFile(file);
      if (!parsed)
        continue;
      const sessionId = typeof parsed.id === "string" ? parsed.id : typeof parsed.sessionId === "string" ? parsed.sessionId : path3.basename(file, ".session.json");
      const parsedProjectId = typeof parsed.demoId === "string" ? parsed.demoId : typeof parsed.projectId === "string" ? parsed.projectId : path3.basename(path3.dirname(file));
      if (projectId2 && parsedProjectId !== projectId2)
        continue;
      sessions.push({
        sessionId,
        projectId: parsedProjectId,
        userId: typeof parsed.userId === "string" ? parsed.userId : void 0,
        workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : void 0,
        status: typeof parsed.status === "string" ? parsed.status : void 0,
        createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : void 0,
        expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : void 0,
        path: file
      });
    }
    return sessions.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  findWorkspacePathById(workspaceId) {
    if (!fs3.existsSync(this.workspacesDir))
      return void 0;
    for (const entryPath of this.walkFiles(this.workspacesDir).map((file) => path3.dirname(file))) {
      if (path3.basename(entryPath) === workspaceId)
        return entryPath;
    }
    for (const file of this.walkFiles(this.workspacesDir)) {
      if (!file.endsWith(".workspace.json"))
        continue;
      const parsed = readJsonFile(file);
      const parsedWorkspaceId = typeof parsed?.workspaceId === "string" ? parsed.workspaceId : typeof parsed?.id === "string" ? parsed.id : void 0;
      if (parsedWorkspaceId === workspaceId)
        return path3.dirname(file);
    }
    return void 0;
  }
  audit(tool, actor2, level, success, input = {}) {
    this.ensureDirs();
    const auditId = nowId("audit");
    const event = {
      auditId,
      at: Date.now(),
      actor: actor2,
      level,
      tool,
      projectId: input.projectId,
      resourceId: input.resourceId,
      inputSummary: input.inputSummary,
      ok: success,
      diffSummary: input.diffSummary,
      validation: input.validation,
      error: input.error
    };
    const date = new Date(event.at).toISOString().slice(0, 10);
    writeJsonFile(path3.join(this.auditDir, date, `${auditId}.json`), event);
    return auditId;
  }
  findReferences(workspacePath, relativeAssetPath) {
    const refs = [];
    for (const file of this.walkFiles(workspacePath)) {
      if (/\.(tsx?|json|md|css)$/i.test(file)) {
        const content = fs3.readFileSync(file, "utf-8");
        if (content.includes(relativeAssetPath))
          refs.push(path3.relative(workspacePath, file));
      }
    }
    return refs;
  }
  validateAssetInput(input) {
    const issues = [];
    if (input.mimeType && !ALLOWED_ASSET_MIME_TYPES.has(input.mimeType)) {
      issues.push({
        code: "INVALID_FILE_TYPE",
        message: `\u4E0D\u652F\u6301\u7684\u56FE\u7247\u7C7B\u578B: ${input.mimeType}`,
        severity: "blocking"
      });
    }
    let size = 0;
    try {
      size = Buffer.from(input.dataBase64, "base64").length;
    } catch {
      issues.push({
        code: "INVALID_REQUEST",
        message: "dataBase64 \u4E0D\u662F\u5408\u6CD5 base64 \u6570\u636E",
        severity: "blocking"
      });
    }
    if (size <= 0) {
      issues.push({
        code: "INVALID_REQUEST",
        message: "\u8D44\u4EA7\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A",
        severity: "blocking"
      });
    }
    if (size > MAX_ASSET_SIZE) {
      issues.push({
        code: "FILE_TOO_LARGE",
        message: `\u8D44\u4EA7\u5927\u5C0F\u8D85\u8FC7 ${Math.floor(MAX_ASSET_SIZE / 1024 / 1024)}MB`,
        severity: "blocking"
      });
    }
    return { ok: issues.every((issue) => issue.severity !== "blocking"), issues };
  }
  generateAssetFilename(filename) {
    const ext = path3.extname(filename).toLowerCase() || ".bin";
    const stem = path3.basename(filename, ext).toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "image";
    return `${stem}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  }
  safeRelativeAssetPath(assetPath) {
    const normalized = path3.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "").split(path3.sep).join("/");
    if (path3.isAbsolute(normalized) || normalized.startsWith("..")) {
      throw new Error("INVALID_ASSET_PATH");
    }
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(normalized)) {
      throw new Error("INVALID_FILE_TYPE");
    }
    return normalized;
  }
  replaceReferences(workspacePath, oldPath, newPath) {
    const updated2 = [];
    for (const file of this.walkFiles(workspacePath)) {
      if (!/\.(tsx?|json|md|css)$/i.test(file))
        continue;
      const content = fs3.readFileSync(file, "utf-8");
      if (!content.includes(oldPath))
        continue;
      fs3.writeFileSync(file, content.split(oldPath).join(newPath), "utf-8");
      updated2.push(path3.relative(workspacePath, file).split(path3.sep).join("/"));
    }
    return updated2;
  }
  getScreenshotServiceUrl() {
    return getScreenshotServiceUrl();
  }
  getAgentServiceUrl() {
    return getAgentServiceUrl();
  }
};

// tmp/pdfs/fix-challenge-prototype-inline-images.ts
var projectId = "proj_1782839405716_tqjl1f";
var actor = {
  id: process.env.USER ?? "local-codex",
  name: process.env.USER ?? "Local Codex",
  role: "admin",
  source: "project-admin-inline-image-fix"
};
function assertOk(label, result) {
  if (!result.ok || result.data === void 0) {
    throw new Error(`${label} failed: ${JSON.stringify(result, null, 2)}`);
  }
  return result.data;
}
function readPngSize(filePath) {
  const buffer = fs4.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}
function pageCode(title, dataUrl, width, height) {
  return `interface PrototypePageProps {
  title?: string;
}

const PROTOTYPE_IMAGE_SRC = ${JSON.stringify(dataUrl)};

export default function PrototypePage({ title = ${JSON.stringify(title)} }: PrototypePageProps) {
  return (
    <main className="min-h-screen w-full bg-[#f3f4f6] px-4 py-6 text-[#111827]">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[${Math.min(Math.max(width, 375), 760)}px] flex-col items-center justify-center gap-3">
        <h1 className="w-full text-left text-sm font-medium text-[#374151]">{title}</h1>
        <div className="w-full overflow-hidden rounded-[8px] bg-white shadow-sm ring-1 ring-black/10">
          <img
            src={PROTOTYPE_IMAGE_SRC}
            alt={title}
            className="block h-auto w-full"
            width={${width}}
            height={${height}}
          />
        </div>
      </section>
    </main>
  );
}
`;
}
var service = new ProjectAdminService();
var edit = assertOk("edit begin", service.beginEdit(projectId, actor));
var pages = assertOk("page list", service.listPages(edit.editId)).pages;
var updated = [];
for (const page of pages) {
  const match = /^prototype-(\d{2})$/.exec(page.id);
  if (!match)
    continue;
  const pageNumber = match[1];
  const title = page.name.replace(/^\d{2}\s+/, "");
  const imagePath = path4.resolve(
    `data/projects/${projectId}/workspace/assets/images/challenge-prototype/page-${pageNumber}.png`
  );
  const { width, height } = readPngSize(imagePath);
  const dataUrl = `data:image/png;base64,${fs4.readFileSync(imagePath).toString("base64")}`;
  const detail = assertOk("page get", service.getPage(edit.editId, page.id));
  const result = assertOk("page update", service.updatePage({
    editId: edit.editId,
    pageId: page.id,
    code: pageCode(title, dataUrl, width, height),
    schema: detail.files.schema
  }, actor));
  updated.push({ pageId: result.meta.id, title, width, height });
}
var validation = assertOk("edit validate", service.editValidate(edit.editId));
if (!validation.ok) {
  throw new Error(`validation failed: ${JSON.stringify(validation, null, 2)}`);
}
var diff = assertOk("edit diff", service.editDiff(edit.editId));
var committed = assertOk("edit commit", service.commitEdit(
  edit.editId,
  "\u4FEE\u590D\u95EF\u5173\u6D3B\u52A8\u539F\u578B\u9875\u56FE\u7247\u9884\u89C8\u8DEF\u5F84",
  actor
));
var output = {
  projectId,
  editId: edit.editId,
  versionId: committed.version.versionId,
  updatedCount: updated.length,
  updated,
  validation,
  diff
};
fs4.writeFileSync(
  path4.resolve("tmp/pdfs/challenge-inline-fix-result.json"),
  JSON.stringify(output, null, 2),
  "utf-8"
);
console.log(JSON.stringify(output, null, 2));
