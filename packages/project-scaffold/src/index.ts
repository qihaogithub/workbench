import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ProjectAdminActor,
  ProjectAdminResult,
  TemplateMetaInput,
  ValidationIssue,
  WorkspaceMutationPort,
} from "../../project-core/src/types.js";
import { ProjectAdminService } from "../../project-core/src/service.js";
import { LOCAL_PREVIEW_DEV_SERVER_SCRIPT } from "./local-preview-dev-server.js";

const SCAFFOLD_VERSION = "0.1.0";
const PROJECT_FILE = "workbench.project.json";
const SYNC_STATE_FILE = path.join(".workbench", "sync-state.json");
const REMOTE_FILE = path.join(".workbench", "remote.json");
const WORKSPACE_KNOWLEDGE_DIR = "knowledge";
const DEFAULT_LOCAL_KNOWLEDGE_DIR = "src/knowledge";

type LocalPageRuntimeType =
  | "high-fidelity-react"
  | "prototype-html-css"
  | "sketch-scene";

interface LocalProjectPage {
  id: string;
  name: string;
  routeKey?: string;
  runtimeType?: LocalPageRuntimeType;
  entry: string;
  schema: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: string;
  sketchScene?: string;
  sketchMeta?: string;
  parentId: string | null;
  order: number;
}

interface LocalProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

interface LocalProjectManifest {
  schemaVersion: 1;
  scaffoldVersion: string;
  projectId: string;
  baseVersion: string;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  name: string;
  pages: LocalProjectPage[];
  folders: LocalProjectFolder[];
  appGraph: string | null;
  projectConfig: string | null;
  assetsDir: string;
  knowledgeDir?: string | null;
}

interface SyncFileState {
  sha256: string;
  size: number;
}

interface SyncState {
  schemaVersion: 1;
  scaffoldVersion: string;
  projectId: string;
  baseVersion: string;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  pulledAt: string;
  files: Record<string, SyncFileState>;
}

export interface ProjectScaffoldEntry {
  path: string;
  data: Buffer;
}

export interface ProjectScaffoldExport {
  projectId: string;
  baseVersion: string;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  pages: number;
  assets: number;
  knowledgeFiles: number;
  entries: ProjectScaffoldEntry[];
}

export interface ProjectScaffoldUpgradeResult {
  projectDir: string;
  projectId: string;
  previousVersion: string;
  currentVersion: string;
  changedFiles: string[];
  alreadyCurrent: boolean;
  dryRun: boolean;
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

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readText(projectDir: string, relativePath: string): string {
  return fs.readFileSync(path.join(projectDir, relativePath), "utf-8");
}

function readOptionalText(
  projectDir: string,
  relativePath: string | undefined,
): string | undefined {
  if (!relativePath) return undefined;
  const filePath = path.join(projectDir, relativePath);
  return fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8")
    : undefined;
}

function readOptionalJson<T>(
  projectDir: string,
  relativePath: string | undefined,
): T | undefined {
  if (!relativePath) return undefined;
  return readJson<T>(path.join(projectDir, relativePath)) ?? undefined;
}

function pageRuntimeType(
  page: Pick<LocalProjectPage, "runtimeType">,
): LocalPageRuntimeType {
  if (page.runtimeType === "prototype-html-css") return "prototype-html-css";
  if (page.runtimeType === "sketch-scene") return "sketch-scene";
  return "high-fidelity-react";
}

function hashFile(filePath: string): SyncFileState {
  const buffer = fs.readFileSync(filePath);
  return {
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    size: buffer.length,
  };
}

function hashBuffer(buffer: Buffer): SyncFileState {
  return {
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    size: buffer.length,
  };
}

function hashText(value: string): SyncFileState {
  return hashBuffer(Buffer.from(value, "utf-8"));
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

function relativeTo(projectDir: string, filePath: string): string {
  return path.relative(projectDir, filePath).split(path.sep).join("/");
}

function managedFiles(
  projectDir: string,
  manifest: LocalProjectManifest,
): string[] {
  const files = [
    PROJECT_FILE,
    ...manifest.pages.flatMap((page) =>
      [
        page.entry,
        page.schema,
        page.prototypeHtml,
        page.prototypeCss,
        page.prototypeMeta,
        page.sketchScene,
        page.sketchMeta,
      ].filter((file): file is string => Boolean(file)),
    ),
    ...(manifest.appGraph ? [manifest.appGraph] : []),
    ...(manifest.projectConfig ? [manifest.projectConfig] : []),
    ...walkFiles(path.join(projectDir, manifest.assetsDir)).map((file) =>
      relativeTo(projectDir, file),
    ),
    ...(manifest.knowledgeDir
      ? walkFiles(path.join(projectDir, manifest.knowledgeDir)).map((file) =>
          relativeTo(projectDir, file),
        )
      : []),
  ];
  return [...new Set(files)].filter((file) =>
    fs.existsSync(path.join(projectDir, file)),
  );
}

function computeSyncState(
  projectDir: string,
  manifest: LocalProjectManifest,
): SyncState {
  const files = Object.fromEntries(
    managedFiles(projectDir, manifest).map((file) => [
      file,
      hashFile(path.join(projectDir, file)),
    ]),
  );
  return {
    schemaVersion: 1,
    scaffoldVersion: SCAFFOLD_VERSION,
    projectId: manifest.projectId,
    baseVersion: manifest.baseVersion,
    workspaceId: manifest.workspaceId,
    workspaceRevision: manifest.workspaceRevision,
    workspaceRootHash: manifest.workspaceRootHash,
    pulledAt: new Date().toISOString(),
    files,
  };
}

function computeSyncStateFromEntries(
  entries: ProjectScaffoldEntry[],
  manifest: LocalProjectManifest,
): SyncState {
  const entryMap = new Map(entries.map((entry) => [entry.path, entry.data]));
  const managedPaths = [
    PROJECT_FILE,
    ...manifest.pages.flatMap((page) =>
      [
        page.entry,
        page.schema,
        page.prototypeHtml,
        page.prototypeCss,
        page.prototypeMeta,
        page.sketchScene,
        page.sketchMeta,
      ].filter((entryPath): entryPath is string => Boolean(entryPath)),
    ),
    ...(manifest.appGraph ? [manifest.appGraph] : []),
    ...(manifest.projectConfig ? [manifest.projectConfig] : []),
    ...entries
      .map((entry) => entry.path)
      .filter((entryPath) =>
        entryPath.startsWith(`${manifest.assetsDir.replace(/\/$/, "")}/`),
      ),
    ...(manifest.knowledgeDir
      ? entries
          .map((entry) => entry.path)
          .filter((entryPath) =>
            entryPath.startsWith(
              `${manifest.knowledgeDir?.replace(/\/$/, "")}/`,
            ),
          )
      : []),
  ];
  const files = Object.fromEntries(
    [...new Set(managedPaths)]
      .map((entryPath): [string, SyncFileState] | null => {
        const data = entryMap.get(entryPath);
        return data ? [entryPath, hashBuffer(data)] : null;
      })
      .filter((item): item is [string, SyncFileState] => item !== null),
  );
  return {
    schemaVersion: 1,
    scaffoldVersion: SCAFFOLD_VERSION,
    projectId: manifest.projectId,
    baseVersion: manifest.baseVersion,
    workspaceId: manifest.workspaceId,
    workspaceRevision: manifest.workspaceRevision,
    workspaceRootHash: manifest.workspaceRootHash,
    pulledAt: new Date().toISOString(),
    files,
  };
}

function readManifest(projectDir: string): LocalProjectManifest | null {
  return readJson<LocalProjectManifest>(path.join(projectDir, PROJECT_FILE));
}

function readSyncState(projectDir: string): SyncState | null {
  return readJson<SyncState>(path.join(projectDir, SYNC_STATE_FILE));
}

function validateManifestShape(
  manifest: LocalProjectManifest | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!manifest) {
    issues.push({
      code: "PROJECT_PACKAGE_MISSING",
      message: "workbench.project.json 不存在或不是合法 JSON",
      severity: "blocking",
    });
    return issues;
  }
  if (manifest.schemaVersion !== 1) {
    issues.push({
      code: "UNSUPPORTED_PROJECT_SCHEMA",
      message: "当前 CLI 仅支持 schemaVersion 1",
      severity: "blocking",
    });
  }
  if (!manifest.projectId) {
    issues.push({
      code: "PROJECT_ID_MISSING",
      message: "projectId 不能为空",
      severity: "blocking",
    });
  }
  if (
    manifest.workspaceId !== undefined &&
    typeof manifest.workspaceId !== "string"
  ) {
    issues.push({
      code: "WORKSPACE_ID_INVALID",
      message: "workspaceId 必须是字符串",
      severity: "blocking",
    });
  }
  if (
    manifest.workspaceRevision !== undefined &&
    typeof manifest.workspaceRevision !== "number"
  ) {
    issues.push({
      code: "WORKSPACE_REVISION_INVALID",
      message: "workspaceRevision 必须是数字",
      severity: "blocking",
    });
  }
  if (
    manifest.workspaceRootHash !== undefined &&
    typeof manifest.workspaceRootHash !== "string"
  ) {
    issues.push({
      code: "WORKSPACE_ROOT_HASH_INVALID",
      message: "workspaceRootHash 必须是字符串",
      severity: "blocking",
    });
  }
  if (!Array.isArray(manifest.pages)) {
    issues.push({
      code: "PAGES_INVALID",
      message: "pages 必须是数组",
      severity: "blocking",
    });
  }
  if (!Array.isArray(manifest.folders)) {
    issues.push({
      code: "FOLDERS_INVALID",
      message: "folders 必须是数组",
      severity: "blocking",
    });
  }
  if (manifest.appGraph !== null && typeof manifest.appGraph !== "string") {
    issues.push({
      code: "APP_GRAPH_INVALID",
      message: "appGraph 必须是字符串或 null",
      severity: "blocking",
    });
  }
  if (!manifest.assetsDir || typeof manifest.assetsDir !== "string") {
    issues.push({
      code: "ASSETS_DIR_INVALID",
      message: "assetsDir 必须是字符串",
      severity: "blocking",
    });
  }
  if (
    manifest.knowledgeDir !== undefined &&
    manifest.knowledgeDir !== null &&
    (!manifest.knowledgeDir || typeof manifest.knowledgeDir !== "string")
  ) {
    issues.push({
      code: "KNOWLEDGE_DIR_INVALID",
      message: "knowledgeDir 必须是字符串或 null",
      severity: "blocking",
    });
  }
  return issues;
}

function localAssetFileToWorkspacePath(
  manifest: LocalProjectManifest,
  file: string,
): string {
  const prefix = `${manifest.assetsDir.replace(/\/$/, "")}/`;
  return `assets/${file.slice(prefix.length)}`;
}

function localKnowledgeFileToWorkspacePath(
  manifest: LocalProjectManifest,
  file: string,
): string {
  const knowledgeDir = manifest.knowledgeDir ?? DEFAULT_LOCAL_KNOWLEDGE_DIR;
  const prefix = `${knowledgeDir.replace(/\/$/, "")}/`;
  return `${WORKSPACE_KNOWLEDGE_DIR}/${file.slice(prefix.length)}`;
}

function writeWorkspaceKnowledgeFile(
  workspacePath: string,
  relativePath: string,
  data: Buffer,
): void {
  const normalized = relativePath.split(/[\\/]+/).filter(Boolean);
  if (
    normalized[0] !== WORKSPACE_KNOWLEDGE_DIR ||
    normalized.some((segment) => segment === "..")
  ) {
    throw new Error(`Invalid knowledge path: ${relativePath}`);
  }
  const targetPath = path.join(workspacePath, ...normalized);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, data);
}

function deleteWorkspaceKnowledgeFile(
  workspacePath: string,
  relativePath: string,
): void {
  const normalized = relativePath.split(/[\\/]+/).filter(Boolean);
  if (
    normalized[0] !== WORKSPACE_KNOWLEDGE_DIR ||
    normalized.some((segment) => segment === "..")
  ) {
    throw new Error(`Invalid knowledge path: ${relativePath}`);
  }
  fs.rmSync(path.join(workspacePath, ...normalized), { force: true });
}

function mimeTypeForFile(file: string): string | undefined {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return undefined;
}

function discardAndFail<T>(
  service: ProjectAdminService,
  editId: string,
  code: string,
  message: string,
  extras: Omit<ProjectAdminResult<T>, "ok" | "error"> = {},
): ProjectAdminResult<T> {
  service.discardEdit(editId);
  return fail(code, message, extras);
}

function validateSchemaFile(
  projectDir: string,
  relativePath: string,
  resourceId: string,
): ValidationIssue[] {
  const filePath = path.join(projectDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return [
      {
        code: "SCHEMA_FILE_MISSING",
        message: `Schema 文件不存在: ${relativePath}`,
        resourceId,
        severity: "blocking",
      },
    ];
  }
  try {
    JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return [];
  } catch {
    return [
      {
        code: "SCHEMA_JSON_INVALID",
        message: `Schema 不是合法 JSON: ${relativePath}`,
        resourceId,
        severity: "blocking",
      },
    ];
  }
}

function validateRequiredFile(
  projectDir: string,
  relativePath: string | undefined,
  resourceId: string,
  code: string,
  label: string,
): ValidationIssue[] {
  if (!relativePath || !fs.existsSync(path.join(projectDir, relativePath))) {
    return [
      {
        code,
        message: `${label} 文件不存在: ${relativePath ?? "(未配置)"}`,
        resourceId,
        severity: "blocking",
      },
    ];
  }
  return [];
}

function validateKnowledgeManifest(
  projectDir: string,
  knowledgeDir: string,
): ValidationIssue[] {
  const manifestPath = path.join(projectDir, knowledgeDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return [];
  } catch {
    return [
      {
        code: "KNOWLEDGE_MANIFEST_INVALID",
        message: `${knowledgeDir}/manifest.json 不是合法 JSON`,
        resourceId: "knowledge/manifest.json",
        severity: "blocking",
      },
    ];
  }
}

function normalizeEntryPath(entryPath: string): string {
  return entryPath.split(path.sep).join("/").replace(/^\/+/, "");
}

function buildProjectScaffoldPackageJson(
  manifest: LocalProjectManifest,
): Record<string, unknown> {
  return {
    private: true,
    name: manifest.projectId,
    packageManager: "pnpm@8.15.0",
    devDependencies: {
      playwright: "^1.42.0",
    },
    scripts: {
      dev: "node scripts/dev-server.mjs",
      validate: "ow validate --json",
      diff: "ow diff --json",
      submit: "ow submit --json",
      build: "node scripts/dev-server.mjs --check",
      "preview:check": "node scripts/dev-server.mjs --preview-check",
      "preview:screenshot": "node scripts/dev-server.mjs --screenshot",
    },
  };
}

function buildScaffoldManagedEntries(
  manifest: LocalProjectManifest,
): ProjectScaffoldEntry[] {
  return [
    {
      path: "package.json",
      data: jsonBuffer(buildProjectScaffoldPackageJson(manifest)),
    },
    {
      path: "scripts/dev-server.mjs",
      data: Buffer.from(buildDevServerScript(), "utf-8"),
    },
  ];
}

function buildDevServerScript(): string {
  return LOCAL_PREVIEW_DEV_SERVER_SCRIPT;
  /* Legacy script body below is intentionally unreachable and kept only until
     the scaffold template is fully split from this module. */
  return `import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import url from "node:url";

const root = process.cwd();
const manifestPath = path.join(root, "workbench.project.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function schemaDefaults(schemaText) {
  if (!schemaText || !schemaText.trim()) return {};
  try {
    const schema = JSON.parse(schemaText);
    const defaults = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      if (value && typeof value === "object" && "default" in value) {
        defaults[key] = value.default;
      }
    }
    return defaults;
  } catch {
    return {};
  }
}

function loadProject() {
  const manifest = readJson(manifestPath);
  const projectSchemaText = manifest.projectConfig
    ? readTextIfExists(path.join(root, manifest.projectConfig))
    : "";
  const appGraphText = manifest.appGraph
    ? readTextIfExists(path.join(root, manifest.appGraph))
    : "";
  const projectDefaults = schemaDefaults(projectSchemaText);
  const pages = manifest.pages.map((page) => {
    const pageSchemaText = readTextIfExists(path.join(root, page.schema));
    return {
      ...page,
      code: readTextIfExists(path.join(root, page.entry)),
      schema: pageSchemaText,
      configData: {
        ...projectDefaults,
        ...schemaDefaults(pageSchemaText),
      },
    };
  });
  return {
    manifest,
    projectSchema: projectSchemaText,
    appGraph: appGraphText ? JSON.parse(appGraphText) : null,
    pages,
  };
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHtml(project) {
  const firstPage = project.pages[0];
  const pageButtons = project.pages.map((page) =>
    "<button data-page-id=\\"" + htmlEscape(page.id) + "\\">" + htmlEscape(page.name || page.id) + "</button>"
  ).join("");
  return \`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>\${htmlEscape(project.manifest.name)} - workbench Local Preview</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; color: #17202a; background: #f5f7fb; }
      main { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
      aside { border-right: 1px solid #d8dee9; background: #fff; padding: 18px; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      h2 { font-size: 14px; margin: 18px 0 8px; color: #4b5563; }
      button { width: 100%; margin: 0 0 8px; padding: 9px 10px; border: 1px solid #d1d5db; background: #fff; text-align: left; border-radius: 6px; cursor: pointer; }
      button[aria-current="true"] { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
      section { padding: 22px; min-width: 0; }
      .grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 16px; }
      .panel { background: #fff; border: 1px solid #d8dee9; border-radius: 8px; overflow: hidden; }
      .panel h2 { margin: 0; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; }
      pre { margin: 0; padding: 14px; overflow: auto; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .meta { display: flex; gap: 12px; flex-wrap: wrap; color: #4b5563; font-size: 13px; margin-bottom: 14px; }
      @media (max-width: 860px) { main { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid #d8dee9; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <aside>
        <h1>\${htmlEscape(project.manifest.name)}</h1>
        <div class="meta">
          <span>\${htmlEscape(project.manifest.projectId)}</span>
          <span>\${htmlEscape(project.manifest.baseVersion)}</span>
        </div>
        <h2>Pages</h2>
        <nav>\${pageButtons}</nav>
      </aside>
      <section>
        <div class="meta" id="page-meta"></div>
        <div class="grid">
          <div class="panel"><h2>Source</h2><pre><code id="source"></code></pre></div>
          <div class="panel"><h2>Merged Config Defaults</h2><pre><code id="config"></code></pre></div>
          <div class="panel"><h2>Page Schema</h2><pre><code id="schema"></code></pre></div>
          <div class="panel"><h2>Project Schema</h2><pre><code id="project-schema"></code></pre></div>
          <div class="panel"><h2>App Graph</h2><pre><code id="app-graph"></code></pre></div>
        </div>
      </section>
    </main>
    <script type="application/json" id="project-data">\${htmlEscape(JSON.stringify(project))}</script>
    <script>
      const project = JSON.parse(document.getElementById("project-data").textContent);
      const buttons = Array.from(document.querySelectorAll("button[data-page-id]"));
      function selectPage(pageId) {
        const page = project.pages.find((item) => item.id === pageId) || project.pages[0];
        if (!page) return;
        for (const button of buttons) button.setAttribute("aria-current", button.dataset.pageId === page.id ? "true" : "false");
        document.getElementById("page-meta").textContent = page.name + " / " + page.id + " / " + page.entry;
        document.getElementById("source").textContent = page.code || "";
        document.getElementById("config").textContent = JSON.stringify(page.configData || {}, null, 2);
        document.getElementById("schema").textContent = page.schema || "";
        document.getElementById("project-schema").textContent = project.projectSchema || "";
        document.getElementById("app-graph").textContent = JSON.stringify(project.appGraph || {}, null, 2);
      }
      for (const button of buttons) button.addEventListener("click", () => selectPage(button.dataset.pageId));
      selectPage(\${JSON.stringify(firstPage?.id || "")});
    </script>
  </body>
</html>\`;
}

function checkProject() {
  const project = loadProject();
  if (!project.manifest.projectId) throw new Error("projectId is missing");
  for (const page of project.manifest.pages || []) {
    if (!fs.existsSync(path.join(root, page.entry))) throw new Error("missing page entry: " + page.entry);
    if (!fs.existsSync(path.join(root, page.schema))) throw new Error("missing page schema: " + page.schema);
  }
  if (project.manifest.appGraph && !fs.existsSync(path.join(root, project.manifest.appGraph))) {
    throw new Error("missing app graph: " + project.manifest.appGraph);
  }
  return project;
}

if (process.argv.includes("--check")) {
  const project = checkProject();
  console.log(JSON.stringify({ ok: true, projectId: project.manifest.projectId, pages: project.pages.length }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--preview-check") || process.argv.includes("--screenshot")) {
  const project = checkProject();
  const outputDir = path.join(root, "test-results", "local-preview");
  fs.mkdirSync(outputDir, { recursive: true });
  const pages = project.pages.map((page) => {
    const content = [page.code, page.schema].join("\\n").replace(/<[^>]*>/g, " ").trim();
    const nonblank = content.length > 12;
    const screenshotPath = path.join(outputDir, page.id + ".svg");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="375" height="812"><rect width="100%" height="100%" fill="' + (nonblank ? "#f8fafc" : "#fff1f2") + '"/><text x="24" y="48" font-family="Arial" font-size="18">' + htmlEscape(page.name || page.id) + '</text><text x="24" y="78" font-family="Arial" font-size="12">' + (nonblank ? "nonblank" : "blank") + '</text></svg>';
    fs.writeFileSync(screenshotPath, svg, "utf-8");
    return { pageId: page.id, nonblank, screenshotPath };
  });
  const report = {
    ok: pages.every((page) => page.nonblank),
    projectId: project.manifest.projectId,
    outputDir,
    pages,
    summary: {
      total: pages.length,
      passed: pages.filter((page) => page.nonblank).length,
      failed: pages.filter((page) => !page.nonblank).length,
    },
  };
  const reportPath = path.join(outputDir, "preview-check-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, reportPath }, null, 2) + "\\n", "utf-8");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (process.env.OW_DEV_ONCE === "1") {
  const project = checkProject();
  console.log("workbench local preview check: " + project.manifest.projectId + " (" + project.pages.length + " pages)");
  process.exit(0);
}

const port = Number(process.env.PORT || process.env.OW_DEV_PORT || 4173);
const server = http.createServer((request, response) => {
  try {
    const parsed = url.parse(request.url || "/");
    const project = loadProject();
    if (parsed.pathname === "/api/project") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(project, null, 2));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderHtml(project));
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, () => {
  console.log("workbench local preview: http://localhost:" + port);
});
`;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildProjectScaffoldZip(
  entries: ProjectScaffoldEntry[],
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedPath = normalizeEntryPath(entry.path);
    const nameBuffer = Buffer.from(normalizedPath, "utf-8");
    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(10, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(10, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function exportProjectScaffoldEntries(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: { projectId: string; includeDataDir?: boolean },
): ProjectAdminResult<ProjectScaffoldExport> {
  const projectPackage = service.exportProjectPackage(input.projectId, actor);
  if (!projectPackage.ok || !projectPackage.data) {
    return fail(
      projectPackage.error?.code ?? "PROJECT_EXPORT_FAILED",
      projectPackage.error?.message ?? "项目导出失败",
    );
  }

  const manifest: LocalProjectManifest = {
    schemaVersion: 1,
    scaffoldVersion: SCAFFOLD_VERSION,
    projectId: projectPackage.data.project.id,
    baseVersion: projectPackage.data.baseVersion,
    workspaceId: projectPackage.data.workspaceId,
    workspaceRevision: projectPackage.data.workspaceRevision,
    workspaceRootHash: projectPackage.data.workspaceRootHash,
    name: projectPackage.data.project.name,
    pages: projectPackage.data.pages.map((page) => {
      const runtimeType = page.meta.runtimeType ?? "high-fidelity-react";
      return {
        id: page.meta.id,
        name: page.meta.name,
        routeKey: page.meta.routeKey,
        runtimeType,
        parentId: page.meta.parentId,
        order: page.meta.order,
        entry: `src/pages/${page.meta.id}/index.tsx`,
        schema: `src/pages/${page.meta.id}/config.schema.json`,
        ...(runtimeType === "prototype-html-css"
          ? {
              prototypeHtml: `src/pages/${page.meta.id}/prototype.html`,
              prototypeCss: `src/pages/${page.meta.id}/prototype.css`,
              prototypeMeta: `src/pages/${page.meta.id}/prototype.meta.json`,
            }
          : {}),
        ...(runtimeType === "sketch-scene"
          ? {
              sketchScene: `src/pages/${page.meta.id}/sketch.scene.json`,
              sketchMeta: `src/pages/${page.meta.id}/sketch.meta.json`,
            }
          : {}),
      };
    }),
    folders: projectPackage.data.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      order: folder.order,
    })),
    appGraph: projectPackage.data.appGraph ? "src/app.graph.json" : null,
    projectConfig: projectPackage.data.projectConfigSchema
      ? "src/project.config.schema.json"
      : null,
    assetsDir: "src/assets",
    knowledgeDir: DEFAULT_LOCAL_KNOWLEDGE_DIR,
  };

  const entries: ProjectScaffoldEntry[] = [
    { path: PROJECT_FILE, data: jsonBuffer(manifest) },
    {
      path: REMOTE_FILE,
      data: jsonBuffer({
        projectId: manifest.projectId,
        workspaceId: manifest.workspaceId,
        workspaceRevision: manifest.workspaceRevision,
        workspaceRootHash: manifest.workspaceRootHash,
        ...(input.includeDataDir ? { dataDir: service.dataDir } : {}),
        pulledAt: new Date().toISOString(),
      }),
    },
    {
      path: "package.json",
      data: jsonBuffer(buildProjectScaffoldPackageJson(manifest)),
    },
    {
      path: "scripts/dev-server.mjs",
      data: Buffer.from(buildDevServerScript(), "utf-8"),
    },
  ];

  for (const page of projectPackage.data.pages) {
    const localPage = manifest.pages.find((item) => item.id === page.meta.id);
    if (!localPage) continue;
    entries.push(
      { path: localPage.entry, data: Buffer.from(page.files.code, "utf-8") },
      { path: localPage.schema, data: Buffer.from(page.files.schema, "utf-8") },
    );
    if (localPage.runtimeType === "prototype-html-css") {
      if (localPage.prototypeHtml) {
        entries.push({
          path: localPage.prototypeHtml,
          data: Buffer.from(page.files.prototypeHtml ?? "", "utf-8"),
        });
      }
      if (localPage.prototypeCss) {
        entries.push({
          path: localPage.prototypeCss,
          data: Buffer.from(page.files.prototypeCss ?? "", "utf-8"),
        });
      }
      if (localPage.prototypeMeta) {
        entries.push({
          path: localPage.prototypeMeta,
          data: jsonBuffer(page.files.prototypeMeta ?? {}),
        });
      }
    }
    if (localPage.runtimeType === "sketch-scene") {
      if (localPage.sketchScene) {
        entries.push({
          path: localPage.sketchScene,
          data: Buffer.from(page.files.sketchScene ?? "", "utf-8"),
        });
      }
      if (localPage.sketchMeta) {
        entries.push({
          path: localPage.sketchMeta,
          data: jsonBuffer(page.files.sketchMeta ?? {}),
        });
      }
    }
  }
  if (manifest.projectConfig && projectPackage.data.projectConfigSchema) {
    entries.push({
      path: manifest.projectConfig,
      data: Buffer.from(projectPackage.data.projectConfigSchema, "utf-8"),
    });
  }
  if (manifest.appGraph && projectPackage.data.appGraph) {
    entries.push({
      path: manifest.appGraph,
      data: jsonBuffer(projectPackage.data.appGraph),
    });
  }
  for (const asset of projectPackage.data.assets) {
    entries.push({
      path: `src/${asset.path}`,
      data: Buffer.from(asset.dataBase64, "base64"),
    });
  }
  for (const knowledgeFile of projectPackage.data.knowledgeFiles) {
    const relativeKnowledgePath = knowledgeFile.path.replace(
      /^knowledge\//,
      "",
    );
    entries.push({
      path: `${DEFAULT_LOCAL_KNOWLEDGE_DIR}/${relativeKnowledgePath}`,
      data: Buffer.from(knowledgeFile.dataBase64, "base64"),
    });
  }
  entries.push({
    path: SYNC_STATE_FILE,
    data: jsonBuffer(computeSyncStateFromEntries(entries, manifest)),
  });

  return ok({
    projectId: manifest.projectId,
    baseVersion: manifest.baseVersion,
    workspaceId: manifest.workspaceId,
    workspaceRevision: manifest.workspaceRevision,
    workspaceRootHash: manifest.workspaceRootHash,
    pages: manifest.pages.length,
    assets: projectPackage.data.assets.length,
    knowledgeFiles: projectPackage.data.knowledgeFiles.length,
    entries,
  });
}

export function pullProjectScaffold(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: { projectId: string; targetDir: string; force?: boolean },
): ProjectAdminResult<{
  projectDir: string;
  projectId: string;
  baseVersion: string;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  pages: number;
  assets: number;
}> {
  const exported = exportProjectScaffoldEntries(service, actor, {
    projectId: input.projectId,
    includeDataDir: true,
  });
  if (!exported.ok || !exported.data) {
    return fail(
      exported.error?.code ?? "PROJECT_EXPORT_FAILED",
      exported.error?.message ?? "项目导出失败",
      {
        validation: exported.validation,
        nextActions: exported.nextActions,
      },
    );
  }

  const projectDir = path.resolve(input.targetDir);
  if (
    fs.existsSync(projectDir) &&
    fs.readdirSync(projectDir).length > 0 &&
    !input.force
  ) {
    return fail("TARGET_DIR_NOT_EMPTY", `目标目录非空: ${projectDir}`, {
      nextActions: ["选择空目录", "追加 --force 覆盖本地项目包文件"],
    });
  }
  ensureDir(projectDir);

  for (const entry of exported.data.entries) {
    const targetPath = path.join(projectDir, entry.path);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, entry.data);
  }

  return ok(
    {
      projectDir,
      projectId: exported.data.projectId,
      baseVersion: exported.data.baseVersion,
      workspaceId: exported.data.workspaceId,
      workspaceRevision: exported.data.workspaceRevision,
      workspaceRootHash: exported.data.workspaceRootHash,
      pages: exported.data.pages,
      assets: exported.data.assets,
    },
    {
      nextActions: [
        `cd ${projectDir}`,
        "pnpm install",
        "pnpm dev",
        "pnpm build",
        "pnpm preview:check",
        "pnpm preview:screenshot",
        "ow validate --json",
        "ow diff --summary --json",
        "ow submit --json",
      ],
    },
  );
}

export function validateProjectScaffold(
  projectDir: string,
): ProjectAdminResult<{ projectDir: string }> {
  const resolvedDir = path.resolve(projectDir);
  const manifest = readManifest(resolvedDir);
  const issues = validateManifestShape(manifest);
  if (manifest) {
    const seenPageIds = new Set<string>();
    const folderIds = new Set(manifest.folders.map((folder) => folder.id));
    for (const page of manifest.pages) {
      if (!page.id)
        issues.push({
          code: "PAGE_ID_MISSING",
          message: "页面 id 不能为空",
          severity: "blocking",
        });
      if (seenPageIds.has(page.id)) {
        issues.push({
          code: "PAGE_ID_DUPLICATED",
          message: `页面 id 重复: ${page.id}`,
          resourceId: page.id,
          severity: "blocking",
        });
      }
      seenPageIds.add(page.id);
      if (page.parentId && !folderIds.has(page.parentId)) {
        issues.push({
          code: "PARENT_FOLDER_MISSING",
          message: `父文件夹不存在: ${page.parentId}`,
          resourceId: page.id,
          severity: "blocking",
        });
      }
      if (!fs.existsSync(path.join(resolvedDir, page.entry))) {
        issues.push({
          code: "PAGE_ENTRY_MISSING",
          message: `页面入口不存在: ${page.entry}`,
          resourceId: page.id,
          severity: "blocking",
        });
      }
      issues.push(...validateSchemaFile(resolvedDir, page.schema, page.id));
      if (pageRuntimeType(page) === "prototype-html-css") {
        issues.push(
          ...validateRequiredFile(
            resolvedDir,
            page.prototypeHtml,
            page.id,
            "PROTOTYPE_HTML_FILE_MISSING",
            "原型 HTML",
          ),
        );
        if (page.prototypeCss) {
          issues.push(
            ...validateRequiredFile(
              resolvedDir,
              page.prototypeCss,
              page.id,
              "PROTOTYPE_CSS_FILE_MISSING",
              "原型 CSS",
            ),
          );
        }
      }
      if (pageRuntimeType(page) === "sketch-scene") {
        issues.push(
          ...validateRequiredFile(
            resolvedDir,
            page.sketchScene,
            page.id,
            "SKETCH_SCENE_FILE_MISSING",
            "草图 Scene",
          ),
        );
      }
    }
    if (manifest.projectConfig) {
      issues.push(
        ...validateSchemaFile(resolvedDir, manifest.projectConfig, "project"),
      );
    }
    if (manifest.knowledgeDir) {
      issues.push(
        ...validateKnowledgeManifest(resolvedDir, manifest.knowledgeDir),
      );
    }
    if (!readSyncState(resolvedDir)) {
      issues.push({
        code: "SYNC_STATE_MISSING",
        message: ".workbench/sync-state.json 不存在或不是合法 JSON",
        severity: "warning",
      });
    }
  }

  const validation = {
    ok: issues.every((issue) => issue.severity !== "blocking"),
    issues,
  };
  return ok(
    { projectDir: resolvedDir },
    {
      validation,
      nextActions: validation.ok
        ? [
            "pnpm preview:check",
            "ow diff --summary --json",
            "提交前运行服务侧 edit validate/project verify",
          ]
        : ["修复 validation.issues 后重试"],
    },
  );
}

export function upgradeProjectScaffold(
  projectDir: string,
  input: { dryRun?: boolean } = {},
): ProjectAdminResult<ProjectScaffoldUpgradeResult> {
  const resolvedDir = path.resolve(projectDir);
  const manifest = readManifest(resolvedDir);
  const manifestIssues = validateManifestShape(manifest);
  if (
    !manifest ||
    manifestIssues.some((issue) => issue.severity === "blocking")
  ) {
    return fail("PROJECT_PACKAGE_INVALID", "本地项目包无效，不能升级脚手架", {
      validation: { ok: false, issues: manifestIssues },
      nextActions: ["ow validate --json"],
    });
  }

  const nextManifest: LocalProjectManifest = {
    ...manifest,
    scaffoldVersion: SCAFFOLD_VERSION,
  };
  const manifestText = `${JSON.stringify(nextManifest, null, 2)}\n`;
  const desiredEntries: ProjectScaffoldEntry[] = [
    { path: PROJECT_FILE, data: Buffer.from(manifestText, "utf-8") },
    ...buildScaffoldManagedEntries(nextManifest),
  ];
  const fileExistsBefore = new Map(
    desiredEntries.map((entry) => [
      entry.path,
      fs.existsSync(path.join(resolvedDir, entry.path)),
    ]),
  );
  fileExistsBefore.set(
    SYNC_STATE_FILE,
    fs.existsSync(path.join(resolvedDir, SYNC_STATE_FILE)),
  );
  const changedFiles = desiredEntries
    .filter((entry) => {
      const targetPath = path.join(resolvedDir, entry.path);
      return (
        !fs.existsSync(targetPath) ||
        !fs.readFileSync(targetPath).equals(entry.data)
      );
    })
    .map((entry) => entry.path);

  const syncState = readSyncState(resolvedDir);
  if (
    syncState &&
    syncState.scaffoldVersion !== SCAFFOLD_VERSION &&
    !changedFiles.includes(SYNC_STATE_FILE)
  ) {
    changedFiles.push(SYNC_STATE_FILE);
  }

  if (!input.dryRun) {
    for (const entry of desiredEntries) {
      const targetPath = path.join(resolvedDir, entry.path);
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, entry.data);
    }
    if (syncState) {
      const nextSyncState: SyncState = {
        ...syncState,
        scaffoldVersion: SCAFFOLD_VERSION,
        files: {
          ...syncState.files,
          [PROJECT_FILE]: hashText(manifestText),
        },
      };
      writeJson(path.join(resolvedDir, SYNC_STATE_FILE), nextSyncState);
    }
  }

  const result: ProjectScaffoldUpgradeResult = {
    projectDir: resolvedDir,
    projectId: manifest.projectId,
    previousVersion: manifest.scaffoldVersion,
    currentVersion: SCAFFOLD_VERSION,
    changedFiles,
    alreadyCurrent: changedFiles.length === 0,
    dryRun: Boolean(input.dryRun),
  };
  return ok(result, {
    diffSummary: {
      created: changedFiles.filter((file) => !fileExistsBefore.get(file)),
      updated: changedFiles.filter((file) => fileExistsBefore.get(file)),
      notes: changedFiles.length === 0 ? ["脚手架已是最新版本"] : [],
    },
    nextActions: input.dryRun
      ? ["ow upgrade --json"]
      : ["ow validate --json", "ow diff --json"],
  });
}

export function diffProjectScaffold(projectDir: string): ProjectAdminResult<{
  projectDir: string;
  created: string[];
  updated: string[];
  deleted: string[];
}> {
  const resolvedDir = path.resolve(projectDir);
  const manifest = readManifest(resolvedDir);
  const manifestIssues = validateManifestShape(manifest);
  if (
    !manifest ||
    manifestIssues.some((issue) => issue.severity === "blocking")
  ) {
    return fail("PROJECT_PACKAGE_INVALID", "本地项目包无效", {
      validation: { ok: false, issues: manifestIssues },
      nextActions: ["ow validate --json"],
    });
  }
  const syncState = readSyncState(resolvedDir);
  if (!syncState) {
    return fail(
      "SYNC_STATE_MISSING",
      ".workbench/sync-state.json 不存在或不是合法 JSON",
      {
        nextActions: ["ow project pull <projectId> <dir> --json"],
      },
    );
  }
  const currentFiles = Object.fromEntries(
    managedFiles(resolvedDir, manifest).map((file) => [
      file,
      hashFile(path.join(resolvedDir, file)),
    ]),
  );
  const created = Object.keys(currentFiles).filter(
    (file) => !syncState.files[file],
  );
  const updated = Object.keys(currentFiles).filter((file) => {
    const previous = syncState.files[file];
    return previous && previous.sha256 !== currentFiles[file]?.sha256;
  });
  const deleted = Object.keys(syncState.files).filter(
    (file) => !currentFiles[file],
  );
  return ok(
    { projectDir: resolvedDir, created, updated, deleted },
    {
      diffSummary: {
        created,
        updated,
        deleted,
        notes:
          created.length + updated.length + deleted.length === 0
            ? ["本地项目包没有变更"]
            : [],
      },
      nextActions: ["ow validate --json", "ow submit --json"],
    },
  );
}

export function submitProjectScaffold(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: { projectDir: string; note?: string },
): ProjectAdminResult<{
  projectDir: string;
  projectId: string;
  versionId: string;
}> {
  const resolvedDir = path.resolve(input.projectDir);
  const validation = validateProjectScaffold(resolvedDir);
  if (!validation.validation?.ok) {
    return fail("VALIDATION_BLOCKED", "本地项目包校验未通过，不能提交", {
      validation: validation.validation,
      nextActions: ["ow validate --json"],
    });
  }
  const manifest = readManifest(resolvedDir);
  if (!manifest) {
    return fail(
      "PROJECT_PACKAGE_INVALID",
      "workbench.project.json 不存在或不是合法 JSON",
    );
  }

  const remote = service.getProject(manifest.projectId, actor);
  if (!remote.ok || !remote.data) {
    return fail(
      remote.error?.code ?? "PROJECT_NOT_FOUND",
      remote.error?.message ?? "项目不存在",
    );
  }
  const currentVersion = remote.data.versions[0]?.versionId ?? "v0";
  if (currentVersion !== manifest.baseVersion) {
    return fail("EDIT_CONFLICT", "线上项目版本已变化，请先重新拉取", {
      validation: {
        ok: false,
        issues: [
          {
            code: "EDIT_CONFLICT",
            message: `当前版本 ${currentVersion} 与本地基线 ${manifest.baseVersion} 不一致`,
            severity: "blocking",
          },
        ],
      },
      nextActions: [
        `ow project pull ${manifest.projectId} ${resolvedDir} --force --json`,
      ],
    });
  }

  const diff = diffProjectScaffold(resolvedDir);
  if (!diff.ok) {
    return fail(
      diff.error?.code ?? "PROJECT_DIFF_FAILED",
      diff.error?.message ?? "本地项目包 diff 失败",
      {
        validation: diff.validation,
        nextActions: diff.nextActions,
      },
    );
  }
  const assetPrefix = `${manifest.assetsDir.replace(/\/$/, "")}/`;
  const createdAssets = (diff.diffSummary?.created ?? []).filter((file) =>
    file.startsWith(assetPrefix),
  );
  const updatedAssets = (diff.diffSummary?.updated ?? []).filter((file) =>
    file.startsWith(assetPrefix),
  );
  const deletedAssets = (diff.diffSummary?.deleted ?? []).filter((file) =>
    file.startsWith(assetPrefix),
  );
  const knowledgePrefix = manifest.knowledgeDir
    ? `${manifest.knowledgeDir.replace(/\/$/, "")}/`
    : null;
  const createdKnowledgeFiles = knowledgePrefix
    ? (diff.diffSummary?.created ?? []).filter((file) =>
        file.startsWith(knowledgePrefix),
      )
    : [];
  const updatedKnowledgeFiles = knowledgePrefix
    ? (diff.diffSummary?.updated ?? []).filter((file) =>
        file.startsWith(knowledgePrefix),
      )
    : [];
  const deletedKnowledgeFiles = knowledgePrefix
    ? (diff.diffSummary?.deleted ?? []).filter((file) =>
        file.startsWith(knowledgePrefix),
      )
    : [];

  const edit = service.beginEdit(manifest.projectId, actor);
  if (!edit.ok || !edit.data) {
    return fail(
      edit.error?.code ?? "EDIT_BEGIN_FAILED",
      edit.error?.message ?? "编辑事务打开失败",
    );
  }
  const editId = edit.data.editId;
  const editWorkspacePath = edit.data.workspacePath;

  const remotePageIds = new Set(remote.data.pages.map((page) => page.id));
  const localPageIds = new Set(manifest.pages.map((page) => page.id));
  const remoteFolderIds = new Set(
    remote.data.folders.map((folder) => folder.id),
  );
  const localFolderIds = new Set(manifest.folders.map((folder) => folder.id));

  const pendingFolders = manifest.folders.filter(
    (folder) => !remoteFolderIds.has(folder.id),
  );
  const availableFolderIds = new Set(remoteFolderIds);
  while (pendingFolders.length > 0) {
    const index = pendingFolders.findIndex(
      (folder) => !folder.parentId || availableFolderIds.has(folder.parentId),
    );
    if (index === -1) {
      return discardAndFail(
        service,
        editId,
        "FOLDER_TREE_INVALID",
        "本地文件夹层级无法按父子顺序创建",
        {
          nextActions: [
            "修复 workbench.project.json 中的 folders 顺序或父级引用后重试",
          ],
        },
      );
    }
    const [folder] = pendingFolders.splice(index, 1);
    if (!folder) continue;
    const createdFolder = service.createFolder(
      editId,
      folder.name,
      folder.parentId,
      actor,
      {
        folderId: folder.id,
        order: folder.order,
      },
    );
    if (!createdFolder.ok) {
      return discardAndFail(
        service,
        editId,
        createdFolder.error?.code ?? "FOLDER_CREATE_FAILED",
        createdFolder.error?.message ?? `文件夹创建失败: ${folder.id}`,
        { validation: createdFolder.validation },
      );
    }
    availableFolderIds.add(folder.id);
  }

  for (const page of manifest.pages.filter(
    (item) => !remotePageIds.has(item.id),
  )) {
    const createdPage = service.createPage(
      {
        editId,
        pageId: page.id,
        name: page.name,
        routeKey: page.routeKey,
        parentId: page.parentId,
        order: page.order,
        code: fs.readFileSync(path.join(resolvedDir, page.entry), "utf-8"),
        schema: fs.readFileSync(path.join(resolvedDir, page.schema), "utf-8"),
      },
      actor,
    );
    if (!createdPage.ok) {
      return discardAndFail(
        service,
        editId,
        createdPage.error?.code ?? "PAGE_CREATE_FAILED",
        createdPage.error?.message ?? `页面创建失败: ${page.id}`,
        { validation: createdPage.validation },
      );
    }
  }

  for (const folder of manifest.folders.filter((item) =>
    remoteFolderIds.has(item.id),
  )) {
    const updatedFolder = service.updateFolder(
      {
        editId,
        folderId: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        order: folder.order,
      },
      actor,
    );
    if (!updatedFolder.ok) {
      return discardAndFail(
        service,
        editId,
        updatedFolder.error?.code ?? "FOLDER_UPDATE_FAILED",
        updatedFolder.error?.message ?? `文件夹提交失败: ${folder.id}`,
        { validation: updatedFolder.validation },
      );
    }
  }

  for (const page of manifest.pages) {
    const updated = service.updatePage(
      {
        editId,
        pageId: page.id,
        code: fs.readFileSync(path.join(resolvedDir, page.entry), "utf-8"),
        schema: fs.readFileSync(path.join(resolvedDir, page.schema), "utf-8"),
        name: page.name,
        routeKey: page.routeKey,
        parentId: page.parentId,
        order: page.order,
      },
      actor,
    );
    if (!updated.ok) {
      return discardAndFail(
        service,
        editId,
        updated.error?.code ?? "PAGE_UPDATE_FAILED",
        updated.error?.message ?? `页面提交失败: ${page.id}`,
        {
          validation: updated.validation,
        },
      );
    }
  }

  const deletedPageIds = remote.data.pages
    .filter((page) => !localPageIds.has(page.id))
    .map((page) => page.id);
  if (deletedPageIds.length > 0) {
    const preview = service.deletePagePreview(editId, deletedPageIds);
    if (!preview.ok || !preview.data) {
      return discardAndFail(
        service,
        editId,
        preview.error?.code ?? "PAGE_DELETE_PREVIEW_FAILED",
        preview.error?.message ?? "页面删除预览失败",
      );
    }
    const executed = service.deletePageExecute(
      preview.data.planId,
      preview.data.confirmToken,
      actor,
    );
    if (!executed.ok) {
      return discardAndFail(
        service,
        editId,
        executed.error?.code ?? "PAGE_DELETE_FAILED",
        executed.error?.message ?? "页面删除失败",
      );
    }
  }

  for (const folder of remote.data.folders.filter(
    (item) => !localFolderIds.has(item.id),
  )) {
    const preview = service.deleteFolderPreview(editId, folder.id);
    if (!preview.ok || !preview.data) {
      return discardAndFail(
        service,
        editId,
        preview.error?.code ?? "FOLDER_DELETE_PREVIEW_FAILED",
        preview.error?.message ?? `文件夹删除预览失败: ${folder.id}`,
      );
    }
    const executed = service.deleteFolderExecute(
      preview.data.planId,
      preview.data.confirmToken,
      "move_to_root",
      actor,
    );
    if (!executed.ok) {
      return discardAndFail(
        service,
        editId,
        executed.error?.code ?? "FOLDER_DELETE_FAILED",
        executed.error?.message ?? `文件夹删除失败: ${folder.id}`,
      );
    }
  }

  const projectConfig = manifest.projectConfig
    ? fs.readFileSync(path.join(resolvedDir, manifest.projectConfig), "utf-8")
    : undefined;
  const configResult =
    projectConfig !== undefined
      ? service.setProjectConfig({ editId, schema: projectConfig }, actor)
      : service.deleteProjectConfig(editId, false, actor);
  if (!configResult.ok) {
    return discardAndFail(
      service,
      editId,
      configResult.error?.code ?? "CONFIG_UPDATE_FAILED",
      configResult.error?.message ?? "项目配置提交失败",
      {
        validation: configResult.validation,
      },
    );
  }

  try {
    for (const file of [...createdKnowledgeFiles, ...updatedKnowledgeFiles]) {
      writeWorkspaceKnowledgeFile(
        editWorkspacePath,
        localKnowledgeFileToWorkspacePath(manifest, file),
        fs.readFileSync(path.join(resolvedDir, file)),
      );
    }
    for (const file of deletedKnowledgeFiles) {
      deleteWorkspaceKnowledgeFile(
        editWorkspacePath,
        localKnowledgeFileToWorkspacePath(manifest, file),
      );
    }
  } catch (error) {
    return discardAndFail(
      service,
      editId,
      "KNOWLEDGE_SYNC_FAILED",
      error instanceof Error ? error.message : "知识文档同步失败",
    );
  }

  for (const file of [...createdAssets, ...updatedAssets]) {
    const assetResult = service.uploadAsset(
      {
        editId,
        filename: path.basename(file),
        targetPath: localAssetFileToWorkspacePath(manifest, file),
        mimeType: mimeTypeForFile(file),
        dataBase64: fs
          .readFileSync(path.join(resolvedDir, file))
          .toString("base64"),
      },
      actor,
    );
    if (!assetResult.ok) {
      return discardAndFail(
        service,
        editId,
        assetResult.error?.code ?? "ASSET_UPLOAD_FAILED",
        assetResult.error?.message ?? `资产提交失败: ${file}`,
        { validation: assetResult.validation },
      );
    }
  }

  for (const file of deletedAssets) {
    const assetPath = localAssetFileToWorkspacePath(manifest, file);
    const preview = service.deleteAssetPreview(editId, assetPath);
    if (!preview.ok || !preview.data) {
      return discardAndFail(
        service,
        editId,
        preview.error?.code ?? "ASSET_DELETE_PREVIEW_FAILED",
        preview.error?.message ?? `资产删除预览失败: ${file}`,
      );
    }
    const executed = service.deleteAssetExecute(
      preview.data.planId,
      preview.data.confirmToken,
      actor,
    );
    if (!executed.ok) {
      return discardAndFail(
        service,
        editId,
        executed.error?.code ?? "ASSET_DELETE_FAILED",
        executed.error?.message ?? `资产删除失败: ${file}`,
      );
    }
  }

  const committed = service.commitEdit(editId, input.note, actor);
  if (!committed.ok || !committed.data) {
    return fail(
      committed.error?.code ?? "EDIT_COMMIT_FAILED",
      committed.error?.message ?? "编辑事务提交失败",
      {
        validation: committed.validation,
        nextActions: committed.nextActions,
      },
    );
  }

  const nextManifest: LocalProjectManifest = {
    ...manifest,
    baseVersion: committed.data.version.versionId,
  };
  writeJson(path.join(resolvedDir, PROJECT_FILE), nextManifest);
  writeJson(
    path.join(resolvedDir, SYNC_STATE_FILE),
    computeSyncState(resolvedDir, nextManifest),
  );

  return ok(
    {
      projectDir: resolvedDir,
      projectId: manifest.projectId,
      versionId: committed.data.version.versionId,
    },
    {
      auditId: committed.auditId,
      diffSummary: committed.diffSummary,
      validation: committed.validation,
      nextActions: [
        "ow diff --json",
        `ow project get ${manifest.projectId} --json`,
      ],
    },
  );
}

export function initTemplateScaffold(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: {
    templateId: string;
    targetDir: string;
    name?: string;
    force?: boolean;
  },
): ProjectAdminResult<{
  projectDir: string;
  projectId: string;
  templateId: string;
  baseVersion: string;
  pages: number;
  assets: number;
}> {
  const created = service.instantiateTemplate(
    input.templateId,
    input.name ?? `template-${input.templateId}`,
    actor,
  );
  if (!created.ok || !created.data) {
    return fail(
      created.error?.code ?? "TEMPLATE_INIT_FAILED",
      created.error?.message ?? "模板实例化失败",
      {
        validation: created.validation,
        nextActions: created.nextActions,
      },
    );
  }
  const pulled = pullProjectScaffold(service, actor, {
    projectId: created.data.id,
    targetDir: input.targetDir,
    force: input.force,
  });
  if (!pulled.ok || !pulled.data) {
    return fail(
      pulled.error?.code ?? "PROJECT_PULL_FAILED",
      pulled.error?.message ?? "模板项目拉取失败",
      {
        validation: pulled.validation,
        nextActions: pulled.nextActions,
      },
    );
  }
  return ok(
    {
      ...pulled.data,
      templateId: input.templateId,
    },
    {
      auditId: created.auditId,
      warnings: [
        "template init 会创建一个基于模板的项目作为本地开发和后续提交目标",
      ],
      nextActions: [
        "ow validate --json",
        "ow diff --json",
        "ow template submit --json",
      ],
    },
  );
}

export function submitTemplateScaffold(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: { projectDir: string; meta: TemplateMetaInput; note?: string },
): ProjectAdminResult<{
  projectDir: string;
  projectId: string;
  templateId: string;
}> {
  if (
    !input.meta.category.trim() ||
    !input.meta.name.trim() ||
    !input.meta.description.trim()
  ) {
    return fail(
      "TEMPLATE_META_INVALID",
      "模板提交需要提供 category、name 和 description",
      {
        nextActions: [
          "ow template submit --category <分类> --name <模板名> --description <描述> --json",
        ],
      },
    );
  }
  const submitted = submitProjectScaffold(service, actor, {
    projectDir: input.projectDir,
    note: input.note ?? "提交本地模板项目包",
  });
  if (!submitted.ok || !submitted.data) {
    return fail(
      submitted.error?.code ?? "PROJECT_SUBMIT_FAILED",
      submitted.error?.message ?? "本地模板项目提交失败",
      {
        validation: submitted.validation,
        nextActions: submitted.nextActions,
      },
    );
  }
  const template = service.createTemplateFromProject(
    submitted.data.projectId,
    input.meta,
    actor,
  );
  if (!template.ok || !template.data) {
    return fail(
      template.error?.code ?? "TEMPLATE_CREATE_FAILED",
      template.error?.message ?? "模板快照创建失败",
      {
        validation: template.validation,
        nextActions: template.nextActions,
      },
    );
  }
  return ok(
    {
      projectDir: submitted.data.projectDir,
      projectId: submitted.data.projectId,
      templateId: template.data.id,
    },
    {
      auditId: template.auditId,
      diffSummary: template.diffSummary,
      validation: submitted.validation,
      nextActions: [
        `ow template get ${template.data.id} --json`,
        `ow template health-check ${template.data.id} --json`,
      ],
    },
  );
}

export interface WorkspaceMergeBarrierResult {
  ok: boolean;
  error?: { code: string; message: string };
}

/**
 * Merge barrier for branch workspace submissions.
 *
 * 在提交本地项目包前，检查工作区 revision 是否已经变化。
 * 当 service 配置了 workspaceAuthorityPort 且目标 workspace 是 live 时，
 * 通过 Authority 查询当前 revision，与本地 manifest 记录的 workspaceRevision 对比。
 * 如果 revision 已变化，拒绝合并以防止并发写入冲突。
 */
export async function checkWorkspaceMergeBarrier(
  service: ProjectAdminService,
  projectDir: string,
): Promise<WorkspaceMergeBarrierResult> {
  const resolvedDir = path.resolve(projectDir);
  const manifest = readManifest(resolvedDir);
  if (!manifest?.workspaceId || manifest.workspaceRevision === undefined) {
    return { ok: true };
  }

  const port = service.getWorkspaceAuthorityPort();
  if (!port) return { ok: true };

  try {
    const state = await port.getState(manifest.workspaceId);
    if (state.revision > manifest.workspaceRevision) {
      return {
        ok: false,
        error: {
          code: "WORKSPACE_REVISION_CONFLICT",
          message: `工作区 revision 已变化（本地基线 ${manifest.workspaceRevision}，当前 ${state.revision}），请先重新拉取`,
        },
      };
    }
    if (
      manifest.workspaceRootHash &&
      state.revision === manifest.workspaceRevision &&
      state.rootHash !== manifest.workspaceRootHash
    ) {
      return {
        ok: false,
        error: {
          code: "WORKSPACE_REVISION_CONFLICT",
          message: `工作区 revision ${state.revision} 的 rootHash 不一致，请先重新拉取`,
        },
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "WORKSPACE_AUTHORITY_REQUIRED",
        message:
          error instanceof Error
            ? error.message
            : "Workspace Authority 不可用，无法确认工作区状态",
      },
    };
  }
}
