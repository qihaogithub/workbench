#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as processStdin, stdout as processStdout, stderr as processStderr } from "node:process";

import { ProjectAdminService } from "../../project-core/src/service.js";
import {
  diffProjectScaffold,
  initTemplateScaffold,
  pullProjectScaffold,
  submitProjectScaffold,
  submitTemplateScaffold,
  upgradeProjectScaffold,
  validateProjectScaffold,
} from "../../project-scaffold/src/index.js";
import type {
  AssetReplaceInput,
  AssetUploadInput,
  ConfigUpdateInput,
  CreateProjectInput,
  FolderUpdateInput,
  PageCreateInput,
  PageUpdateInput,
  ProjectAdminActor,
  ProjectAdminConfig,
  ProjectAdminResult,
  TemplateScope,
} from "../../project-core/src/types.js";

type JsonObject = Record<string, unknown>;
type CommandResult = ProjectAdminResult<unknown> | JsonObject | string;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface AuthorSitePublishResult {
  projectId: string;
  publishedVersion: string;
  publishedAt: number;
  demoCount: number;
  duration: number;
  artifactSummary?: {
    demoCount: number;
    projectJsonPath?: string;
    indexJsonPath?: string;
    entryPaths: string[];
  };
  accessUrls?: {
    viewerUrl?: string;
    dataUrl?: string;
    embedUrls?: Array<{ pageId: string; url: string }>;
  };
  cloudflareSync?: {
    success: boolean;
    message: string;
  };
}

interface ParsedCli {
  json: boolean;
  help: boolean;
  dataDir?: string;
  commandWords: string[];
  positionals: string[];
  options: JsonObject;
}

interface CommandContext {
  service: ProjectAdminService;
  actor: ProjectAdminActor;
}

interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  run: (args: JsonObject, positionals: string[], context: CommandContext) => CommandResult | Promise<CommandResult>;
}

const commands: CommandDefinition[] = [];

function register(
  name: string,
  description: string,
  run: CommandDefinition["run"],
  aliases: string[] = [],
): void {
  commands.push({
    name,
    aliases: [name, name.replace(/\s+/g, "_"), ...aliases],
    description,
    run,
  });
}

function toCamelCase(value: string): string {
  return value.replace(/[-_]([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());
}

function optionKey(key: string): string {
  return toCamelCase(key.replace(/^--?/, ""));
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseJsonValue(value: string): unknown {
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

function parseArgv(argv: string[]): ParsedCli {
  const commandWords: string[] = [];
  const positionals: string[] = [];
  const options: JsonObject = {};
  let json = false;
  let help = false;
  let dataDir: string | undefined;
  let scanningCommand = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") {
      scanningCommand = false;
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token.startsWith("--no-")) {
      options[optionKey(token.slice(5))] = false;
      scanningCommand = false;
      continue;
    }
    if (token.startsWith("--")) {
      scanningCommand = false;
      const equalsIndex = token.indexOf("=");
      const rawKey = equalsIndex === -1 ? token.slice(2) : token.slice(2, equalsIndex);
      const key = optionKey(rawKey);
      const rawValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
      const next = argv[index + 1];
      const value =
        rawValue !== undefined
          ? rawValue
          : next && !next.startsWith("-")
            ? argv[++index]
            : "true";
      const parsed = parseScalar(value ?? "true");
      if (key === "dataDir") {
        dataDir = typeof parsed === "string" ? parsed : undefined;
      } else {
        options[key] = parsed;
      }
      continue;
    }
    if (scanningCommand) {
      commandWords.push(token);
    } else {
      positionals.push(token);
    }
  }

  return { json, help, dataDir, commandWords, positionals, options };
}

function aliasWords(alias: string): string[] {
  return alias.trim().split(/\s+/);
}

function findCommand(words: string[]): { command?: CommandDefinition; consumed: number } {
  let match: { command?: CommandDefinition; consumed: number } = { consumed: 0 };
  for (const command of commands) {
    for (const alias of command.aliases) {
      const parts = aliasWords(alias);
      if (parts.length > words.length) continue;
      if (parts.every((part, index) => words[index] === part) && parts.length > match.consumed) {
        match = { command, consumed: parts.length };
      }
    }
  }
  return match;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of processStdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function readTextValue(value: unknown): string {
  if (typeof value !== "string") return "";
  if (value.startsWith("@")) {
    return fs.readFileSync(path.resolve(value.slice(1)), "utf-8");
  }
  return value;
}

async function applyJsonInput(options: JsonObject): Promise<JsonObject> {
  const merged: JsonObject = { ...options };
  const inputJson = merged.inputJson;
  delete merged.inputJson;
  const stdinRequested = merged.stdin === true;
  delete merged.stdin;

  const payloads: unknown[] = [];
  if (typeof inputJson === "string") {
    payloads.push(JSON.parse(readTextValue(inputJson)) as unknown);
  }
  if (stdinRequested) {
    payloads.push(JSON.parse(await readStdin()) as unknown);
  }
  for (const payload of payloads) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      Object.assign(merged, payload);
    }
  }
  return merged;
}

function hasArg(args: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function stringArg(args: JsonObject, key: string, positional?: string): string {
  const value = args[key];
  if (typeof value === "string") return readTextValue(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return positional ?? "";
}

function optionalStringArg(args: JsonObject, key: string, positional?: string): string | undefined {
  const value = stringArg(args, key, positional);
  return value || undefined;
}

function booleanArg(args: JsonObject, key: string, fallback = false): boolean {
  const value = args[key];
  return typeof value === "boolean" ? value : fallback;
}

function numberArg(args: JsonObject, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

function scopeArg(args: JsonObject): TemplateScope | undefined {
  const value = stringArg(args, "scope");
  return value === "personal" || value === "team" || value === "official" ? value : undefined;
}

function stringArrayArg(args: JsonObject, key: string): string[] {
  const value = args[key];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    const parsed = parseJsonValue(readTextValue(value));
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function objectArg(args: JsonObject, key: string): JsonObject {
  const value = args[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value === "string") {
    const parsed = parseJsonValue(readTextValue(value));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
  }
  return {};
}

function objectArrayArg(args: JsonObject, key: string): Array<{ id: string; order: number; parentId: string | null }> {
  const value = args[key];
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseJsonValue(readTextValue(value))
      : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: stringArg(item, "id"),
      order: numberArg(item, "order") ?? 0,
      parentId: stringArg(item, "parentId") || null,
    }));
}

function readAssetInput(args: JsonObject): Pick<AssetUploadInput, "filename" | "dataBase64" | "mimeType"> {
  const filePath = optionalStringArg(args, "file");
  if (!filePath) {
    return {
      filename: stringArg(args, "filename"),
      dataBase64: stringArg(args, "dataBase64"),
      mimeType: optionalStringArg(args, "mimeType"),
    };
  }
  const resolved = path.resolve(filePath);
  return {
    filename: optionalStringArg(args, "filename") ?? path.basename(resolved),
    dataBase64: fs.readFileSync(resolved).toString("base64"),
    mimeType: optionalStringArg(args, "mimeType"),
  };
}

function actorFromEnv(): ProjectAdminActor {
  const role = process.env.PROJECT_ADMIN_ROLE;
  const normalizedRole = role === "creator" || role === "readonly" || role === "admin" ? role : "admin";
  const allowedProjectIds = (process.env.PROJECT_ADMIN_ALLOWED_PROJECTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    id: process.env.USER ?? "local-codex",
    name: process.env.USER ?? "Local Codex",
    role: normalizedRole,
    source: "project-admin-cli",
    allowedProjectIds: allowedProjectIds.length > 0 ? allowedProjectIds : undefined,
  };
}

function normalizeResult(result: CommandResult): CommandResult {
  if (typeof result === "string") return { ok: true, data: result };
  if (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    result.ok === false &&
    (!Array.isArray(result.nextActions) || result.nextActions.length === 0)
  ) {
    return {
      ...result,
      nextActions: ["ow commands --json", "ow doctor --json"],
    };
  }
  return result;
}

function isFailedResult(result: CommandResult): boolean {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return false;
  return result.ok === false;
}

function printJson(result: CommandResult): void {
  processStdout.write(`${JSON.stringify(normalizeResult(result), null, 2)}\n`);
}

function printHuman(result: CommandResult): void {
  const normalized = normalizeResult(result);
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    processStdout.write(`${String(normalized)}\n`);
    return;
  }
  const ok = normalized.ok !== false;
  processStdout.write(`${ok ? "OK" : "ERROR"}\n`);
  if (normalized.error && typeof normalized.error === "object") {
    processStdout.write(`${JSON.stringify(normalized.error, null, 2)}\n`);
  }
  if (normalized.data !== undefined) {
    processStdout.write(`${JSON.stringify(normalized.data, null, 2)}\n`);
  }
  if (Array.isArray(normalized.warnings) && normalized.warnings.length > 0) {
    processStdout.write(`warnings: ${normalized.warnings.join("; ")}\n`);
  }
  if (Array.isArray(normalized.nextActions) && normalized.nextActions.length > 0) {
    processStdout.write(`nextActions: ${normalized.nextActions.join("; ")}\n`);
  }
}

function cliFail<T>(
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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function viewerBaseUrlFromEnv(args: JsonObject): string {
  return normalizeBaseUrl(
    optionalStringArg(args, "viewerUrl") ??
      process.env.VIEWER_CLOUDFLARE_URL ??
      process.env.VIEWER_LAN_URL ??
      "",
  );
}

function withPublishAccessSummary(
  result: AuthorSitePublishResult,
  args: JsonObject,
): AuthorSitePublishResult {
  const viewerBaseUrl = viewerBaseUrlFromEnv(args);
  const dataBase = viewerBaseUrl ? `${viewerBaseUrl}/data/${result.projectId}` : `/data/${result.projectId}`;
  const viewerUrl = viewerBaseUrl ? `${viewerBaseUrl}/projects/${result.projectId}` : `/projects/${result.projectId}`;
  return {
    ...result,
    artifactSummary: result.artifactSummary ?? {
      demoCount: result.demoCount,
      projectJsonPath: "project.json",
      indexJsonPath: "../projects-index.json",
      entryPaths: ["project.json", "../projects-index.json"],
    },
    accessUrls: result.accessUrls ?? {
      viewerUrl,
      dataUrl: `${dataBase}/project.json`,
      embedUrls: [],
    },
  };
}

async function publishViaAuthorSite(
  projectId: string,
  args: JsonObject,
): Promise<ProjectAdminResult<AuthorSitePublishResult>> {
  const authorSiteUrl = optionalStringArg(args, "authorSiteUrl") ?? process.env.AUTHOR_SITE_URL;
  const authToken = optionalStringArg(args, "authToken") ?? process.env.AUTHOR_SITE_AUTH_TOKEN;
  if (!authorSiteUrl) {
    return cliFail("AUTHOR_SITE_URL_MISSING", "未配置 author-site 地址", {
      nextActions: ["传入 --author-site-url <url> 或设置 AUTHOR_SITE_URL"],
    });
  }
  if (!authToken) {
    return cliFail("AUTHOR_SITE_AUTH_TOKEN_MISSING", "未配置 author-site 登录 token", {
      nextActions: ["传入 --auth-token <auth_token> 或设置 AUTHOR_SITE_AUTH_TOKEN"],
    });
  }

  const response = await fetch(`${normalizeBaseUrl(authorSiteUrl)}/api/projects/${encodeURIComponent(projectId)}/publish`, {
    method: "POST",
    headers: {
      Cookie: `auth_token=${encodeURIComponent(authToken)}`,
    },
  });
  const payload = await response.json() as ApiResponse<AuthorSitePublishResult>;
  if (!response.ok || !payload.success || !payload.data) {
    return cliFail(
      payload.error?.code ?? `HTTP_${response.status}`,
      payload.error?.message ?? "author-site 发布失败",
      {
        nextActions: ["确认 author-site 正在运行", "确认 auth token 未过期", `ow publish check ${projectId} --json`],
      },
    );
  }
  const data = withPublishAccessSummary(payload.data, args);
  return {
    ok: true,
    data,
    warnings: data.cloudflareSync && !data.cloudflareSync.success
      ? [data.cloudflareSync.message]
      : undefined,
    nextActions: [`ow publish status ${projectId} --json`],
  };
}

function helpText(): string {
  const rows = commands
    .map((command) => `  ${command.name.padEnd(34)} ${command.description}`)
    .join("\n");
  return [
    "ow - opencode-workbench project admin CLI",
    "",
    "Usage:",
    "  ow <command> [args] [--json] [--data-dir <dir>]",
    "  ow <legacy_snake_case_command> [--json]",
    "",
    "Common input:",
    "  --input-json '<json>'       Merge JSON object into command args",
    "  --input-json @file.json     Read args from a JSON file",
    "  --stdin                     Read args JSON from stdin",
    "  @file                       For code/schema string values, read file content",
    "",
    "Commands:",
    rows,
  ].join("\n");
}

register("admin capabilities", "查看当前操作者权限和 CLI 能力", (_args, _pos, { service, actor }) =>
  service.capabilities(actor),
  ["capabilities", "admin_capabilities"],
);

register("doctor", "诊断本地 CLI 环境", (_args, _pos, { service, actor }) => ({
  ok: true,
  data: {
    cwd: process.cwd(),
    dataDir: service.dataDir,
    actor,
    node: process.version,
    package: "@opencode-workbench/project-cli",
  },
  nextActions: ["project list --json", "template list --json"],
}));

register("commands", "列出 CLI 命令", () => ({
  ok: true,
  data: commands.map(({ name, aliases, description }) => ({ name, aliases, description })),
}));

register("validate", "校验本地项目包协议与文件", (args, pos) =>
  validateProjectScaffold(stringArg(args, "dir", pos[0] ?? process.cwd())),
);

register("diff", "对比本地项目包与拉取基线", (args, pos) =>
  diffProjectScaffold(stringArg(args, "dir", pos[0] ?? process.cwd())),
);

register("upgrade", "升级本地项目脚手架托管文件", (args, pos) =>
  upgradeProjectScaffold(optionalStringArg(args, "dir", pos[0]) ?? process.cwd(), {
    dryRun: booleanArg(args, "dryRun"),
  }),
  ["scaffold upgrade", "scaffold_upgrade"],
);

register("submit", "提交本地项目包变更", (args, pos, { service, actor }) =>
  submitProjectScaffold(service, actor, {
    projectDir: stringArg(args, "dir", pos[0] ?? process.cwd()),
    note: optionalStringArg(args, "note"),
  }),
);

register("project list", "列出项目", (_args, _pos, { service, actor }) => service.listProjects(actor), [
  "project_list",
]);

register("project get", "获取项目详情", (args, pos, { service, actor }) =>
  service.getProject(stringArg(args, "projectId", pos[0]), actor),
  ["project_get"],
);

register("project pull", "拉取项目到本地项目包", (args, pos, { service, actor }) => {
  const projectId = stringArg(args, "projectId", pos[0]);
  return pullProjectScaffold(service, actor, {
    projectId,
    targetDir: stringArg(args, "dir", pos[1] ?? projectId),
    force: booleanArg(args, "force"),
  });
});

register("project create", "创建空白项目或从模板创建", (args, _pos, { service, actor }) => {
  const input: CreateProjectInput = {
    name: stringArg(args, "name"),
    templateId: optionalStringArg(args, "templateId"),
    description: optionalStringArg(args, "description"),
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.createProject(input, actor);
}, ["project_create"]);

register("project update", "修改项目名称或描述", (args, pos, { service, actor }) =>
  service.updateProject(
    {
      projectId: stringArg(args, "projectId", pos[0]),
      name: optionalStringArg(args, "name", pos[1]),
      description: hasArg(args, "description") ? stringArg(args, "description") : undefined,
      dryRun: booleanArg(args, "dryRun"),
    },
    actor,
  ),
  ["project_rename"],
);

register("project duplicate", "复制项目为独立项目", (args, pos, { service, actor }) =>
  service.duplicateProject(stringArg(args, "projectId", pos[0]), optionalStringArg(args, "name", pos[1]), undefined, actor),
  ["project_duplicate"],
);

register("project delete-preview", "预览删除项目影响", (args, pos, { service, actor }) =>
  service.deleteProjectPreview(stringArg(args, "projectId", pos[0]), actor),
  ["project_delete_preview"],
);

register("project delete-execute", "执行项目删除预览计划", (args, pos, { service, actor }) =>
  service.deleteProjectExecute(
    stringArg(args, "planId", pos[0]),
    stringArg(args, "confirmToken", pos[1]),
    actor,
  ),
  ["project_delete_execute"],
);

register("project set-cover", "设置项目封面路径", (args, pos, { service, actor }) =>
  service.setProjectCover(stringArg(args, "projectId", pos[0]), stringArg(args, "thumbnail", pos[1]), actor),
  ["project_set_cover"],
);

register("project delete-cover", "删除项目封面", (args, pos, { service, actor }) =>
  service.setProjectCover(stringArg(args, "projectId", pos[0]), undefined, actor),
  ["project_delete_cover"],
);

register("template list", "列出模板", (args, _pos, { service }) =>
  service.listTemplates({
    scope: scopeArg(args),
    official: hasArg(args, "official") ? booleanArg(args, "official") : undefined,
  }),
  ["template_list"],
);

register("template get", "获取模板详情", (args, pos, { service }) =>
  service.getTemplate(stringArg(args, "templateId", pos[0])),
  ["template_get"],
);

register("template create-from-project", "将项目保存为模板快照", (args, pos, { service, actor }) =>
  service.createTemplateFromProject(
    stringArg(args, "projectId", pos[0]),
    {
      category: stringArg(args, "category"),
      name: stringArg(args, "name"),
      description: stringArg(args, "description"),
      thumbnail: optionalStringArg(args, "thumbnail"),
      scope: scopeArg(args),
      official: booleanArg(args, "official"),
    },
    actor,
  ),
  ["template_create_from_project"],
);

register("template update-meta", "修改模板元数据", (args, pos, { service, actor }) =>
  service.updateTemplateMeta(
    stringArg(args, "templateId", pos[0]),
    {
      category: optionalStringArg(args, "category"),
      name: optionalStringArg(args, "name"),
      description: optionalStringArg(args, "description"),
      thumbnail: optionalStringArg(args, "thumbnail"),
      scope: scopeArg(args),
      official: hasArg(args, "official") ? booleanArg(args, "official") : undefined,
    },
    actor,
  ),
  ["template_update_meta"],
);

register("template health-check", "检查模板健康度", (args, pos, { service }) =>
  service.checkTemplateHealth(optionalStringArg(args, "templateId", pos[0])),
  ["template_health_check"],
);

register("template delete-preview", "预览模板删除影响", (args, pos, { service }) =>
  service.deleteTemplatePreview(stringArg(args, "templateId", pos[0])),
  ["template_delete_preview"],
);

register("template delete-execute", "删除模板", (args, pos, { service, actor }) =>
  service.deleteTemplateExecute(
    stringArg(args, "planId", pos[0]),
    stringArg(args, "confirmToken", pos[1]),
    actor,
  ),
  ["template_delete_execute"],
);

register("template recommend", "基于描述推荐模板", (args, pos, { service }) =>
  service.recommendTemplate(stringArg(args, "description", pos.join(" "))),
  ["template_recommend"],
);

register("template instantiate", "从模板创建项目", (args, pos, { service, actor }) =>
  service.instantiateTemplate(
    stringArg(args, "templateId", pos[0]),
    stringArg(args, "name", pos[1]),
    actor,
  ),
  ["template_instantiate"],
);

register("template init", "从模板创建项目并拉取为本地项目包", (args, pos, { service, actor }) => {
  const templateId = stringArg(args, "templateId", pos[0]);
  return initTemplateScaffold(service, actor, {
    templateId,
    targetDir: stringArg(args, "dir", pos[1] ?? templateId),
    name: optionalStringArg(args, "name"),
    force: booleanArg(args, "force"),
  });
}, ["template_init"]);

register("template submit", "提交本地项目包并保存为模板快照", (args, pos, { service, actor }) =>
  submitTemplateScaffold(service, actor, {
    projectDir: stringArg(args, "dir", pos[0] ?? process.cwd()),
    note: optionalStringArg(args, "note"),
    meta: {
      category: stringArg(args, "category"),
      name: stringArg(args, "name"),
      description: stringArg(args, "description"),
      thumbnail: optionalStringArg(args, "thumbnail"),
      scope: scopeArg(args),
      official: hasArg(args, "official") ? booleanArg(args, "official") : undefined,
    },
  }),
  ["template_submit"],
);

register("edit begin", "打开项目编辑事务", (args, pos, { service, actor }) =>
  service.beginEdit(stringArg(args, "projectId", pos[0]), actor),
  ["edit_begin"],
);

register("edit status", "查看事务状态", (args, pos, { service }) =>
  service.editStatus(stringArg(args, "editId", pos[0])),
  ["edit_status"],
);

register("edit diff", "查看事务差异", (args, pos, { service }) =>
  service.editDiff(stringArg(args, "editId", pos[0])),
  ["edit_diff"],
);

register("edit validate", "校验事务工作区", (args, pos, { service }) =>
  service.editValidate(stringArg(args, "editId", pos[0])),
  ["edit_validate"],
);

register("edit commit", "提交编辑事务并生成版本", (args, pos, { service, actor }) =>
  service.commitEdit(stringArg(args, "editId", pos[0]), optionalStringArg(args, "note", pos[1]), actor),
  ["edit_commit"],
);

register("edit discard", "丢弃编辑事务", (args, pos, { service, actor }) =>
  service.discardEdit(stringArg(args, "editId", pos[0]), actor),
  ["edit_discard"],
);

register("edit extend", "延长事务有效期", (args, pos, { service }) =>
  service.extendEdit(stringArg(args, "editId", pos[0])),
  ["edit_extend"],
);

register("page list", "列出页面和文件夹树", (args, pos, { service }) =>
  service.listPages(stringArg(args, "editId", pos[0])),
  ["page_list"],
);

register("page get", "获取单页代码、Schema 和元信息", (args, pos, { service }) =>
  service.getPage(stringArg(args, "editId", pos[0]), stringArg(args, "pageId", pos[1])),
  ["page_get"],
);

register("page create", "新建页面", (args, _pos, { service, actor }) => {
  const input: PageCreateInput = {
    editId: stringArg(args, "editId"),
    name: stringArg(args, "name"),
    parentId: optionalStringArg(args, "parentId") ?? null,
    code: optionalStringArg(args, "code"),
    schema: optionalStringArg(args, "schema"),
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.createPage(input, actor);
}, ["page_create"]);

register("page duplicate", "复制页面", (args, pos, { service, actor }) =>
  service.duplicatePage(
    stringArg(args, "editId", pos[0]),
    stringArg(args, "pageId", pos[1]),
    optionalStringArg(args, "name", pos[2]),
    actor,
  ),
  ["page_duplicate"],
);

register("page update-code", "更新页面代码", (args, pos, { service, actor }) =>
  service.updatePage(
    {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      code: stringArg(args, "code", pos[2]),
      dryRun: booleanArg(args, "dryRun"),
    },
    actor,
  ),
  ["page_update_code"],
);

register("page update-schema", "更新页面 Schema", (args, pos, { service, actor }) =>
  service.updatePage(
    {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      schema: stringArg(args, "schema", pos[2]),
      dryRun: booleanArg(args, "dryRun"),
    },
    actor,
  ),
  ["page_update_schema"],
);

register("page update-meta", "修改页面名称、父文件夹和排序", (args, pos, { service, actor }) => {
  const input: PageUpdateInput = {
    editId: stringArg(args, "editId", pos[0]),
    pageId: stringArg(args, "pageId", pos[1]),
    name: optionalStringArg(args, "name"),
    parentId: hasArg(args, "parentId") ? stringArg(args, "parentId") || null : undefined,
    order: numberArg(args, "order"),
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.updatePage(input, actor);
}, ["page_update_meta"]);

register("page delete-preview", "预览页面删除影响", (args, pos, { service }) =>
  service.deletePagePreview(
    stringArg(args, "editId", pos[0]),
    stringArrayArg(args, "pageIds").length > 0 ? stringArrayArg(args, "pageIds") : pos.slice(1),
  ),
  ["page_delete_preview"],
);

register("page delete-execute", "执行页面删除计划", (args, pos, { service, actor }) =>
  service.deletePageExecute(
    stringArg(args, "planId", pos[0]),
    stringArg(args, "confirmToken", pos[1]),
    actor,
  ),
  ["page_delete_execute"],
);

register("page reorder", "页面和文件夹混合排序", (args, pos, { service, actor }) =>
  service.reorderPages(
    stringArg(args, "editId", pos[0]),
    {
      pages: objectArrayArg(args, "pages"),
      folders: objectArrayArg(args, "folders"),
    },
    actor,
  ),
  ["page_reorder"],
);

register("page restore-version", "恢复页面历史版本", (args, pos, { service, actor }) =>
  service.restorePageVersion(
    stringArg(args, "projectId", pos[0]),
    stringArg(args, "pageId", pos[1]),
    stringArg(args, "versionId", pos[2]),
    actor,
  ),
  ["page_restore_version"],
);

register("folder create", "创建虚拟文件夹", (args, pos, { service, actor }) =>
  service.createFolder(
    stringArg(args, "editId", pos[0]),
    stringArg(args, "name", pos[1]),
    optionalStringArg(args, "parentId") ?? null,
    actor,
  ),
  ["folder_create"],
);

register("folder update", "重命名、移动或调整排序", (args, pos, { service, actor }) => {
  const input: FolderUpdateInput = {
    editId: stringArg(args, "editId", pos[0]),
    folderId: stringArg(args, "folderId", pos[1]),
    name: optionalStringArg(args, "name"),
    parentId: hasArg(args, "parentId") ? stringArg(args, "parentId") || null : undefined,
    order: numberArg(args, "order"),
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.updateFolder(input, actor);
}, ["folder_update"]);

register("folder delete-preview", "预览文件夹删除影响", (args, pos, { service }) =>
  service.deleteFolderPreview(stringArg(args, "editId", pos[0]), stringArg(args, "folderId", pos[1])),
  ["folder_delete_preview"],
);

register("folder delete-execute", "删除文件夹", (args, pos, { service, actor }) =>
  service.deleteFolderExecute(
    stringArg(args, "planId", pos[0]),
    stringArg(args, "confirmToken", pos[1]),
    stringArg(args, "strategy") === "delete_contents" ? "delete_contents" : "move_to_root",
    actor,
  ),
  ["folder_delete_execute"],
);

register("config get-project-schema", "读取项目级配置 Schema", (args, pos, { service }) =>
  service.getProjectConfig(stringArg(args, "editId", pos[0])),
  ["config_get_project_schema"],
);

register("config set-project-schema", "创建或更新项目级配置 Schema", (args, pos, { service, actor }) => {
  const input: ConfigUpdateInput = {
    editId: stringArg(args, "editId", pos[0]),
    schema: stringArg(args, "schema", pos[1]),
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.setProjectConfig(input, actor);
}, ["config_set_project_schema"]);

register("config delete-project-schema", "删除项目级配置 Schema", (args, pos, { service, actor }) =>
  service.deleteProjectConfig(stringArg(args, "editId", pos[0]), booleanArg(args, "dryRun"), actor),
  ["config_delete_project_schema"],
);

register("config validate-page-schema", "校验页面 Schema", (args, pos, { service }) =>
  service.validatePageSchema(stringArg(args, "editId", pos[0]), stringArg(args, "pageId", pos[1])),
  ["config_validate_page_schema"],
);

register("config validate-merged-schema", "校验项目级和页面级 Schema 合并结果", (args, pos, { service }) =>
  service.validateMergedSchema(stringArg(args, "editId", pos[0])),
  ["config_validate_merged_schema"],
);

register("config generate-from-code", "从页面代码生成候选 Schema", (args, pos, { service }) =>
  service.generateSchemaFromCode(stringArg(args, "editId", pos[0]), stringArg(args, "pageId", pos[1])),
  ["config_generate_from_code"],
);

register("config apply-visual-patch", "应用可视化配置补丁候选", (args, pos, { service }) =>
  service.applyVisualPatch(
    stringArg(args, "editId", pos[0]),
    stringArg(args, "pageId", pos[1]),
    objectArg(args, "patch"),
  ),
  ["config_apply_visual_patch"],
);

register("asset list", "列出项目图片和引用摘要", (args, pos, { service }) =>
  service.listAssets(stringArg(args, "editId", pos[0])),
  ["asset_list"],
);

register("asset upload", "上传图片资产到事务工作区", (args, pos, { service, actor }) => {
  const asset = readAssetInput(args);
  const input: AssetUploadInput = {
    editId: stringArg(args, "editId", pos[0]),
    filename: asset.filename,
    dataBase64: asset.dataBase64,
    mimeType: asset.mimeType,
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.uploadAsset(input, actor);
}, ["asset_upload"]);

register("asset delete-preview", "预览删除图片影响", (args, pos, { service }) =>
  service.deleteAssetPreview(stringArg(args, "editId", pos[0]), stringArg(args, "assetPath", pos[1])),
  ["asset_delete_preview"],
);

register("asset delete-execute", "执行图片删除计划", (args, pos, { service, actor }) =>
  service.deleteAssetExecute(
    stringArg(args, "planId", pos[0]),
    stringArg(args, "confirmToken", pos[1]),
    actor,
  ),
  ["asset_delete_execute"],
);

register("asset replace", "替换图片并更新文本引用", (args, pos, { service, actor }) => {
  const asset = readAssetInput(args);
  const input: AssetReplaceInput = {
    editId: stringArg(args, "editId", pos[0]),
    oldPath: stringArg(args, "oldPath", pos[1]),
    filename: asset.filename,
    dataBase64: asset.dataBase64,
    mimeType: asset.mimeType,
    dryRun: booleanArg(args, "dryRun"),
  };
  return service.replaceAsset(input, actor);
}, ["asset_replace"]);

register("preview compile", "编译指定页面或全项目的静态预检", (args, pos, { service }) =>
  service.previewCompile(stringArg(args, "editId", pos[0]), optionalStringArg(args, "pageId", pos[1])),
  ["preview_compile"],
);

register("preview render", "获取可访问预览 URL", (args, pos, { service }) =>
  service.previewRender(stringArg(args, "editId", pos[0]), stringArg(args, "pageId", pos[1])),
  ["preview_render"],
);

register("preview screenshot", "捕获页面截图服务状态", (_args, _pos, { service }) => service.previewScreenshot(), [
  "preview_screenshot",
]);

register("preview console-logs", "读取页面控制台日志", (_args, _pos, { service }) => service.previewLogs(), [
  "preview_console_logs",
]);

register("preview runtime-errors", "读取运行时错误", (_args, _pos, { service }) => service.previewLogs(), [
  "preview_runtime_errors",
]);

register("preview healthcheck", "检查预览相关服务健康度", (_args, _pos, { service }) => service.previewHealthcheck(), [
  "preview_healthcheck",
]);

register("publish check", "发布前检查", (args, pos, { service, actor }) =>
  service.publishCheck(stringArg(args, "projectId", pos[0]), actor),
  ["publish_check"],
);

register("publish project", "发布项目", async (args, pos, { service, actor }) => {
  const projectId = stringArg(args, "projectId", pos[0]);
  if (optionalStringArg(args, "authorSiteUrl") || process.env.AUTHOR_SITE_URL) {
    return publishViaAuthorSite(projectId, args);
  }
  const result = service.publishProject(projectId, actor);
  return result.ok
    ? {
        ...result,
        nextActions: [
          ...(result.nextActions ?? []),
          "配置 AUTHOR_SITE_URL 和 AUTHOR_SITE_AUTH_TOKEN 后可调用 author-site 正式发布产物链路",
        ],
      }
    : result;
},
  ["publish_project", "publish"],
);

register("publish status", "查询发布状态", (args, pos, { service, actor }) =>
  service.publishStatus(stringArg(args, "projectId", pos[0]), actor),
  ["publish_status"],
);

register("publish rollback", "回滚到上一发布版本", (args, pos, { service, actor }) =>
  service.publishRollback(stringArg(args, "projectId", pos[0]), actor),
  ["publish_rollback"],
);

register("publish artifacts", "查看发布产物摘要", (args, pos, { service, actor }) =>
  service.publishStatus(stringArg(args, "projectId", pos[0]), actor),
  ["publish_artifacts"],
);

register("ai session-list", "列出项目相关 AI 会话摘要", (args, pos, { service }) =>
  service.aiSessionList(stringArg(args, "projectId", pos[0])),
  ["ai_session_list"],
);

register("ai session-get", "读取 AI 会话摘要", (args, pos, { service }) =>
  service.aiSessionGet(stringArg(args, "sessionId", pos[0])),
  ["ai_session_get"],
);

register("ai run-logs", "读取 AI 会话关联运行日志", (args, pos, { service }) =>
  service.aiRunLogs(stringArg(args, "sessionId", pos[0])),
  ["ai_run_logs"],
);

register("ai workspace-context", "读取 AI 会话关联工作区文件列表", (args, pos, { service }) =>
  service.aiWorkspaceContext(stringArg(args, "sessionId", pos[0])),
  ["ai_workspace_context"],
);

register("ai send-message", "向 agent-service 在线 AI 会话发送指令", (args, pos, { service, actor }) =>
  service.sendAiMessage(
    {
      sessionId: stringArg(args, "sessionId", pos[0]),
      content: stringArg(args, "content", pos.slice(1).join(" ")),
      projectId: optionalStringArg(args, "projectId"),
      workingDir: optionalStringArg(args, "workingDir"),
      model: optionalStringArg(args, "model"),
      stream: booleanArg(args, "stream"),
      timeout: numberArg(args, "timeout"),
    },
    actor,
  ),
  ["ai_send_message"],
);

register("audit list", "查询项目操作记录", (args, pos, { service }) =>
  service.auditList(optionalStringArg(args, "projectId", pos[0])),
  ["audit_list"],
);

register("audit get", "查看单次操作详情", (args, pos, { service }) =>
  service.auditGet(stringArg(args, "auditId", pos[0])),
  ["audit_get"],
);

register("admin lock-project", "临时锁定项目", (args, pos, { service, actor }) =>
  service.lockProject(stringArg(args, "projectId", pos[0]), actor),
  ["admin_lock_project"],
);

register("admin unlock-project", "解除项目锁", (args, pos, { service, actor }) =>
  service.unlockProject(stringArg(args, "projectId", pos[0]), actor),
  ["admin_unlock_project"],
);

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);
  if (parsed.help || parsed.commandWords.length === 0) {
    processStdout.write(`${helpText()}\n`);
    return 0;
  }

  const match = findCommand(parsed.commandWords);
  if (!match.command) {
    const result: ProjectAdminResult<never> = {
      ok: false,
      error: {
        code: "UNKNOWN_COMMAND",
        message: `未知命令: ${parsed.commandWords.join(" ")}`,
        recoverable: true,
      },
      nextActions: ["ow commands --json", "ow --help"],
    };
    if (parsed.json) printJson(result);
    else printHuman(result);
    return 1;
  }

  const config: ProjectAdminConfig = parsed.dataDir ? { dataDir: parsed.dataDir } : {};
  const service = new ProjectAdminService(config);
  const actor = actorFromEnv();
  const positionals = [...parsed.commandWords.slice(match.consumed), ...parsed.positionals];
  const args = await applyJsonInput(parsed.options);
  const result = await match.command.run(args, positionals, { service, actor });
  if (parsed.json) printJson(result);
  else printHuman(result);
  return isFailedResult(normalizeResult(result)) ? 1 : 0;
}

const isCliEntrypoint = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    processStderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
