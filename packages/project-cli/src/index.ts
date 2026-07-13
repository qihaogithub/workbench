#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  stdin as processStdin,
  stdout as processStdout,
  stderr as processStderr,
} from "node:process";

import { ProjectAdminService } from "../../project-core/src/service.js";
import { getAgentServiceUrl } from "../../project-core/src/config.js";
import {
  checkWorkspaceMergeBarrier,
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
  AgentRunReportInput,
  ConfigUpdateInput,
  CreateProjectInput,
  FolderUpdateInput,
  PageCreateInput,
  PageSwitchRuntimeInput,
  PageUpdatePrototypeInput,
  PageUpdateInput,
  ProjectAdminActor,
  ProjectAdminConfig,
  ProjectAuthoringPreferences,
  ProjectAdminResult,
  ProjectResourceKind,
  TemplateScope,
  WorkspaceMutationPort,
} from "../../project-core/src/types.js";

export {
  ProjectWorkspaceAuthorityClient,
  ProjectWorkspaceAuthorityClientError,
} from "./workspace-authority-client.js";
import {
  ProjectWorkspaceAuthorityClient,
  ProjectWorkspaceAuthorityClientError,
} from "./workspace-authority-client.js";

type JsonObject = Record<string, unknown>;
type CommandResult = ProjectAdminResult<unknown> | JsonObject | string;

interface PrototypeManifestPage {
  pageId?: string;
  name?: string;
  routeKey?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PageCreateInput["prototypeMeta"];
  schema?: string;
  order?: number;
  parentId?: string | null;
}

interface PrototypeManifest {
  pages: PrototypeManifestPage[];
}

interface BatchCommandItemFailure {
  item: string;
  code: string;
  message: string;
  resumeCommand?: string;
}

interface LocalizedRemoteAsset {
  replacement: string;
}

interface RecipeDefinition {
  id: string;
  title: string;
  commands: string[];
  evidence: string[];
}

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
  commitId?: string;
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
  run: (
    args: JsonObject,
    positionals: string[],
    context: CommandContext,
  ) => CommandResult | Promise<CommandResult>;
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
  return value.replace(/[-_]([a-zA-Z0-9])/g, (_, char: string) =>
    char.toUpperCase(),
  );
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
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
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
      const rawKey =
        equalsIndex === -1 ? token.slice(2) : token.slice(2, equalsIndex);
      const key = optionKey(rawKey);
      const rawValue =
        equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
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

function findCommand(words: string[]): {
  command?: CommandDefinition;
  consumed: number;
} {
  let match: { command?: CommandDefinition; consumed: number } = {
    consumed: 0,
  };
  for (const command of commands) {
    for (const alias of command.aliases) {
      const parts = aliasWords(alias);
      if (parts.length > words.length) continue;
      if (
        parts.every((part, index) => words[index] === part) &&
        parts.length > match.consumed
      ) {
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
    const fileReference = value.slice(1);
    if (
      !/^(?:\/|\.\/|\.\.\/)/.test(fileReference) ||
      fileReference.length > 512 ||
      /[\r\n{};]/.test(fileReference)
    ) {
      return value;
    }
    return fs.readFileSync(path.resolve(fileReference), "utf-8");
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
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return positional ?? "";
}

function optionalStringArg(
  args: JsonObject,
  key: string,
  positional?: string,
): string | undefined {
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
  return value === "personal" || value === "team" || value === "official"
    ? value
    : undefined;
}

function resourceKindArg(
  args: JsonObject,
  key: string,
  positional?: string,
): ProjectResourceKind {
  const value = stringArg(args, key, positional);
  if (
    value === "page" ||
    value === "knowledge_document" ||
    value === "canvas" ||
    value === "asset" ||
    value === "project_config"
  ) {
    return value;
  }
  return "page";
}

function stringArrayArg(args: JsonObject, key: string): string[] {
  const value = args[key];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    const parsed = parseJsonValue(readTextValue(value));
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function objectArg(args: JsonObject, key: string): JsonObject {
  const value = args[key];
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as JsonObject;
  if (typeof value === "string") {
    const parsed = parseJsonValue(readTextValue(value));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as JsonObject;
  }
  return {};
}

function objectArrayArg(
  args: JsonObject,
  key: string,
): Array<{ id: string; order: number; parentId: string | null }> {
  const value = args[key];
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseJsonValue(readTextValue(value))
      : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is JsonObject =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      id: stringArg(item, "id"),
      order: numberArg(item, "order") ?? 0,
      parentId: stringArg(item, "parentId") || null,
    }));
}

function readAssetInput(
  args: JsonObject,
): Pick<AssetUploadInput, "filename" | "dataBase64" | "mimeType"> {
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
  const normalizedRole =
    role === "creator" || role === "readonly" || role === "admin"
      ? role
      : "admin";
  const allowedProjectIds = (process.env.PROJECT_ADMIN_ALLOWED_PROJECTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    id: process.env.USER ?? "local-codex",
    name: process.env.USER ?? "Local Codex",
    role: normalizedRole,
    source: "project-admin-cli",
    allowedProjectIds:
      allowedProjectIds.length > 0 ? allowedProjectIds : undefined,
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
  if (typeof result !== "object" || result === null || Array.isArray(result))
    return false;
  return result.ok === false;
}

function printJson(result: CommandResult): void {
  processStdout.write(`${JSON.stringify(normalizeResult(result), null, 2)}\n`);
}

function printHuman(result: CommandResult): void {
  const normalized = normalizeResult(result);
  if (
    typeof normalized !== "object" ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
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
  if (
    Array.isArray(normalized.nextActions) &&
    normalized.nextActions.length > 0
  ) {
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

function cliOk<T>(
  data: T,
  extras: Omit<ProjectAdminResult<T>, "ok" | "data"> = {},
): ProjectAdminResult<T> {
  return { ok: true, data, ...extras };
}

function createAuthorityPort(
  client: ProjectWorkspaceAuthorityClient,
  projectId: string,
  workspaceId: string,
): WorkspaceMutationPort {
  return {
    commitMutation: async (request) =>
      client.mutate({
        ...request,
        projectId,
        workspaceId,
        actor: "project-cli",
      }),
    getState: async () => client.getState(projectId, workspaceId),
  };
}

function readScaffoldWorkspaceId(
  projectDir: string,
): { projectId: string; workspaceId?: string } | null {
  const manifestPath = path.join(projectDir, "workbench.project.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      projectId?: string;
      workspaceId?: string;
    };
    if (!manifest.projectId) return null;
    return { projectId: manifest.projectId, workspaceId: manifest.workspaceId };
  } catch {
    return null;
  }
}

function findWorkspaceMetadata(
  dataDir: string,
  workspaceId: string,
): { scope?: string } | null {
  if (!workspaceId) return null;
  const candidates = [path.join(dataDir, "workspaces")];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    try {
      for (const userDir of fs.readdirSync(base, { withFileTypes: true })) {
        if (!userDir.isDirectory()) continue;
        const wsPath = path.join(base, userDir.name);
        try {
          for (const projDir of fs.readdirSync(wsPath, {
            withFileTypes: true,
          })) {
            if (!projDir.isDirectory()) continue;
            const candidatePath = path.join(wsPath, projDir.name, workspaceId);
            const metaPath = path.join(candidatePath, ".workspace.json");
            if (fs.existsSync(metaPath)) {
              return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
                scope?: string;
              };
            }
          }
        } catch {
          /* skip unreadable dir */
        }
      }
    } catch {
      /* skip unreadable dir */
    }
  }
  return null;
}

async function tryCreateAuthorityService(
  service: ProjectAdminService,
  projectDir: string,
  actor: ProjectAdminActor,
): Promise<ProjectAdminService | null> {
  const scaffoldInfo = readScaffoldWorkspaceId(projectDir);
  if (!scaffoldInfo?.workspaceId) return null;

  const metadata = findWorkspaceMetadata(
    service.dataDir,
    scaffoldInfo.workspaceId,
  );
  if (metadata?.scope !== "live") return null;

  const sessionId = `cli-${actor.id}-${Date.now()}`;
  const baseUrl = getAgentServiceUrl();
  const client = new ProjectWorkspaceAuthorityClient({ baseUrl, sessionId });

  try {
    await client.getState(scaffoldInfo.projectId, scaffoldInfo.workspaceId);
  } catch (error) {
    if (error instanceof ProjectWorkspaceAuthorityClientError) {
      return null;
    }
    throw error;
  }

  const port = createAuthorityPort(
    client,
    scaffoldInfo.projectId,
    scaffoldInfo.workspaceId,
  );
  const authorityService = new ProjectAdminService({
    dataDir: service.dataDir,
    auditDir: service.auditDir,
    maxBatchSize: service.maxBatchSize,
    workspaceAuthorityPort: port,
  });
  return authorityService;
}

function projectAuthoringPreferencesArg(
  args: JsonObject,
): ProjectAdminResult<ProjectAuthoringPreferences | undefined> {
  const clearPreferences = booleanArg(args, "clearAuthoringPreferences");
  const rawPreferences = args.authoringPreferences;
  const sketchEditorEngine = optionalStringArg(args, "sketchEditorEngine");

  if (
    clearPreferences &&
    (rawPreferences !== undefined || sketchEditorEngine !== undefined)
  ) {
    return cliFail(
      "INVALID_REQUEST",
      "--clear-authoring-preferences 不能与 --authoring-preferences 或 --sketch-editor-engine 同时使用",
    );
  }

  if (
    !clearPreferences &&
    rawPreferences === undefined &&
    sketchEditorEngine === undefined
  ) {
    return cliOk(undefined);
  }

  if (clearPreferences) {
    return cliOk({});
  }

  let record: JsonObject = {};
  if (rawPreferences !== undefined) {
    if (
      rawPreferences &&
      typeof rawPreferences === "object" &&
      !Array.isArray(rawPreferences)
    ) {
      record = rawPreferences as JsonObject;
    } else if (typeof rawPreferences === "string") {
      const parsed = parseJsonValue(readTextValue(rawPreferences));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record = parsed as JsonObject;
      } else {
        return cliFail(
          "INVALID_REQUEST",
          "authoringPreferences 必须是 JSON object",
        );
      }
    } else {
      return cliFail(
        "INVALID_REQUEST",
        "authoringPreferences 必须是 JSON object",
      );
    }
  }

  if (sketchEditorEngine !== undefined) {
    record = { ...record, sketchEditorEngine };
  }

  const unknownKeys = Object.keys(record).filter(
    (key) => key !== "sketchEditorEngine",
  );
  if (unknownKeys.length > 0) {
    return cliFail(
      "INVALID_REQUEST",
      `authoringPreferences 仅支持 sketchEditorEngine，收到: ${unknownKeys.join(", ")}`,
    );
  }

  const resolvedSketchEditorEngine = record.sketchEditorEngine;
  if (
    resolvedSketchEditorEngine === undefined ||
    resolvedSketchEditorEngine === null ||
    resolvedSketchEditorEngine === ""
  ) {
    return cliOk({});
  }

  if (resolvedSketchEditorEngine !== "native") {
    return cliFail("INVALID_REQUEST", "sketchEditorEngine 仅支持 native");
  }

  return cliOk({ sketchEditorEngine: resolvedSketchEditorEngine });
}

function withAssetListSummary(
  result: ProjectAdminResult<{
    assets: Array<{ path: string; size: number; references: string[] }>;
  }>,
): ProjectAdminResult<unknown> {
  if (!result.ok || !result.data) return result;
  const totalBytes = result.data.assets.reduce(
    (sum, asset) => sum + asset.size,
    0,
  );
  return {
    ...result,
    data: {
      summary: {
        count: result.data.assets.length,
        totalBytes,
        referenced: result.data.assets.filter(
          (asset) => asset.references.length > 0,
        ).length,
        unreferenced: result.data.assets.filter(
          (asset) => asset.references.length === 0,
        ).length,
      },
      assets: result.data.assets.map((asset) => ({
        path: asset.path,
        size: asset.size,
        referenceCount: asset.references.length,
      })),
    },
  };
}

function withDiffSummary(
  result: ProjectAdminResult<unknown>,
): ProjectAdminResult<unknown> {
  if (
    !result.ok ||
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  )
    return result;
  const data = result.data as {
    created?: string[];
    updated?: string[];
    deleted?: string[];
    unchanged?: string[];
    notes?: string[];
  };
  return {
    ...result,
    data: {
      summary: {
        created: data.created?.length ?? 0,
        updated: data.updated?.length ?? 0,
        deleted: data.deleted?.length ?? 0,
        unchanged: data.unchanged?.length ?? 0,
        notes: data.notes ?? [],
      },
      diff: data,
    },
  };
}

function withPageListSummary(
  result: ProjectAdminResult<{
    pages: Array<{ runtimeType?: string }>;
    folders: unknown[];
  }>,
): ProjectAdminResult<unknown> {
  if (!result.ok || !result.data) return result;
  const runtimeTypes: Record<string, number> = {};
  for (const page of result.data.pages) {
    const runtimeType = page.runtimeType ?? "high-fidelity-react";
    runtimeTypes[runtimeType] = (runtimeTypes[runtimeType] ?? 0) + 1;
  }
  return {
    ...result,
    data: {
      summary: {
        pages: result.data.pages.length,
        folders: result.data.folders.length,
        runtimeTypes,
      },
      pages: result.data.pages,
      folders: result.data.folders,
    },
  };
}

function withRuntimeSummary(
  result: ProjectAdminResult<unknown>,
): ProjectAdminResult<unknown> {
  if (
    !result.ok ||
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  )
    return result;
  const data = result.data as {
    ok?: boolean;
    pageIds?: string[];
    issues?: Array<{ severity: string; code: string; pageId: string }>;
  };
  return {
    ...result,
    data: {
      summary: {
        ok: data.ok === true,
        pages: data.pageIds?.length ?? 0,
        issues: data.issues?.length ?? 0,
        errors:
          data.issues?.filter((issue) => issue.severity === "error").length ??
          0,
        warnings:
          data.issues?.filter((issue) => issue.severity === "warning").length ??
          0,
      },
      runtimeValidation: data,
    },
  };
}

const INPUT_HELP = {
  rules: [
    "@file expansion only runs when the whole string starts with @/abs/path, @./rel/path, or @../rel/path.",
    "CSS at-rules such as @media, @supports, @keyframes, @font-face, @container, and @layer are treated as literal content.",
    "Use --input-json @./args.json for structured arguments and --stdin for piped JSON.",
  ],
  examples: [
    "ow page update-code <editId> <pageId> --code @./src/page.tsx --json",
    "ow page update-prototype <editId> <pageId> --input-json @./prototype.json --json",
  ],
};

const RECIPES: RecipeDefinition[] = [
  {
    id: "create-empty-project",
    title: "Create an empty project through a transaction",
    commands: [
      "ow doctor --json",
      "ow project create --name <name> --json",
      "ow edit begin <projectId> --json",
    ],
    evidence: ["projectId", "editId", "auditId"],
  },
  {
    id: "import-prototype-project",
    title: "Import external HTML/CSS prototype pages",
    commands: [
      "ow project import-prototype --name <name> --source <dir> --pages @./prototype-pages.json --assets assets:assets --commit --json",
    ],
    evidence: ["projectId", "editId", "diff summary", "validation summary"],
  },
  {
    id: "edit-existing-project",
    title: "Edit an existing project safely",
    commands: [
      "ow edit begin <projectId> --json",
      "ow page list <editId> --summary --json",
      "ow edit verify <editId> --json",
      "ow edit commit <editId> --json",
    ],
    evidence: ["editId", "versionId", "auditId"],
  },
  {
    id: "local-project-package-dev",
    title: "Develop through the local project package path",
    commands: [
      "ow project pull <projectId> <dir> --json",
      "pnpm install",
      "pnpm dev",
      "pnpm preview:check",
      "ow validate --json",
      "ow diff --summary --json",
      "ow submit --json",
    ],
    evidence: ["projectDir", "diff summary", "submit auditId"],
  },
  {
    id: "publish-project",
    title: "Check and publish a project",
    commands: [
      "ow publish check <projectId> --json",
      "ow publish project <projectId> --json",
      "ow publish status <projectId> --json",
    ],
    evidence: ["publishedVersion", "artifactSummary"],
  },
  {
    id: "recover-edit",
    title: "Recover or inspect an edit transaction",
    commands: [
      "ow edit status <editId> --json",
      "ow edit diff <editId> --summary --json",
      "ow edit validate <editId> --json",
      "ow edit discard <editId> --json",
    ],
    evidence: ["editId", "changedFiles", "validation issues"],
  },
];

function recipeById(id: string): RecipeDefinition | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}

function parsePrototypeManifest(
  args: JsonObject,
): ProjectAdminResult<PrototypeManifest> {
  const raw = args.manifest ?? args.pages;
  if (raw === undefined)
    return cliFail("MANIFEST_REQUIRED", "必须提供 --manifest 或 --pages");
  const parsed =
    typeof raw === "string" ? (JSON.parse(readTextValue(raw)) as unknown) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return cliFail("INVALID_MANIFEST", "manifest 必须是 JSON object");
  }
  const pages = (parsed as { pages?: unknown }).pages;
  if (!Array.isArray(pages))
    return cliFail("INVALID_MANIFEST", "manifest.pages 必须是数组");
  const normalizedPages = pages
    .filter(
      (item): item is JsonObject =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      pageId: optionalStringArg(item, "pageId"),
      name: optionalStringArg(item, "name"),
      routeKey: optionalStringArg(item, "routeKey"),
      prototypeHtml:
        optionalStringArg(item, "prototypeHtml") ??
        optionalStringArg(item, "html"),
      prototypeCss:
        optionalStringArg(item, "prototypeCss") ??
        optionalStringArg(item, "css"),
      prototypeMeta:
        item.prototypeMeta &&
        typeof item.prototypeMeta === "object" &&
        !Array.isArray(item.prototypeMeta)
          ? (item.prototypeMeta as PageCreateInput["prototypeMeta"])
          : undefined,
      schema: optionalStringArg(item, "schema"),
      order: numberArg(item, "order"),
      parentId: hasArg(item, "parentId")
        ? stringArg(item, "parentId") || null
        : undefined,
    }));
  return cliOk({ pages: normalizedPages });
}

function walkLocalFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkLocalFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

function includeFile(filePath: string, include: string | undefined): boolean {
  if (!include) return /\.(png|jpe?g|gif|webp|svg|svga)$/i.test(filePath);
  const parts = include
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  return parts.some((part) => {
    if (part.startsWith("*."))
      return filePath.toLowerCase().endsWith(part.slice(1).toLowerCase());
    if (part.startsWith("."))
      return filePath.toLowerCase().endsWith(part.toLowerCase());
    return filePath.includes(part);
  });
}

function parseAssetSpecs(
  args: JsonObject,
): Array<{ from: string; to: string }> {
  const values = stringArrayArg(args, "assets");
  const positional = optionalStringArg(args, "asset");
  const raw = values.length > 0 ? values : positional ? [positional] : [];
  return raw
    .map((item) => {
      const [from, to] = item.split(":");
      return from && to ? { from, to } : null;
    })
    .filter((item): item is { from: string; to: string } => item !== null);
}

function uploadAssetDirectory(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: {
    editId: string;
    from: string;
    to: string;
    include?: string;
    dryRun?: boolean;
  },
): ProjectAdminResult<{
  editId: string;
  uploaded: Array<{ path: string; size: number }>;
  skipped: string[];
  failed: BatchCommandItemFailure[];
  totalBytes: number;
  dryRun: boolean;
  resumeCommand: string;
}> {
  const sourceDir = path.resolve(input.from);
  if (!fs.existsSync(sourceDir)) {
    return cliFail("SOURCE_DIR_NOT_FOUND", `资产目录不存在: ${sourceDir}`, {
      nextActions: ["检查 --from 路径", "使用绝对路径重试"],
    });
  }
  const uploaded: Array<{ path: string; size: number }> = [];
  const skipped: string[] = [];
  const failed: BatchCommandItemFailure[] = [];
  for (const file of walkLocalFiles(sourceDir)) {
    const relative = path.relative(sourceDir, file).split(path.sep).join("/");
    if (!includeFile(file, input.include)) {
      skipped.push(relative);
      continue;
    }
    const targetPath = path.join(input.to, relative).split(path.sep).join("/");
    const result = service.uploadAsset(
      {
        editId: input.editId,
        filename: path.basename(file),
        dataBase64: fs.readFileSync(file).toString("base64"),
        mimeType: mimeTypeForLocalFile(file),
        targetPath,
        dryRun: input.dryRun,
      },
      actor,
    );
    if (result.ok && result.data) {
      uploaded.push({ path: result.data.path, size: result.data.size });
    } else {
      failed.push({
        item: relative,
        code: result.error?.code ?? "UPLOAD_FAILED",
        message: result.error?.message ?? "资产上传失败",
        resumeCommand: `ow asset upload-dir ${input.editId} --from ${sourceDir} --to ${input.to} --resume --json`,
      });
    }
  }
  const resumeCommand = `ow asset upload-dir ${input.editId} --from ${sourceDir} --to ${input.to} --resume --json`;
  return cliOk(
    {
      editId: input.editId,
      uploaded,
      skipped,
      failed,
      totalBytes: uploaded.reduce((sum, item) => sum + item.size, 0),
      dryRun: input.dryRun === true,
      resumeCommand,
    },
    {
      nextActions:
        failed.length > 0
          ? [resumeCommand]
          : [`ow edit verify ${input.editId} --checks assets --json`],
      warnings:
        failed.length > 0 ? [`${failed.length} 个资产上传失败`] : undefined,
    },
  );
}

function mimeTypeForLocalFile(file: string): string | undefined {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return undefined;
}

const IMPORT_REMOTE_IMAGE_RE =
  /https?:\/\/[^\s"'()<>\\]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s"'()<>\\]*)?/gi;
const IMPORT_REMOTE_IMAGE_TIMEOUT_MS = 10_000;
const IMPORT_REMOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function imageExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("gif")) return ".gif";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("svg")) return ".svg";
  return ".png";
}

function filenameFromRemoteImageUrl(url: string, mimeType: string): string {
  try {
    const parsed = new URL(url);
    const basename = path.basename(parsed.pathname);
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(basename)) return basename;
  } catch {
    // Fall through to a deterministic generic name.
  }
  return `remote-image${imageExtensionFromMime(mimeType)}`;
}

async function downloadImportImage(url: string): Promise<{
  dataBase64?: string;
  filename?: string;
  mimeType?: string;
  warning?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    IMPORT_REMOTE_IMAGE_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      return { warning: `${url} 下载失败: HTTP ${response.status}` };
    const mimeType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
    if (!mimeType.startsWith("image/")) {
      return {
        warning: `${url} 不是图片资源: ${mimeType || "unknown content-type"}`,
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > IMPORT_REMOTE_IMAGE_MAX_BYTES) {
      return { warning: `${url} 超过 10MB，已保留外链` };
    }
    const buffer = Buffer.from(arrayBuffer);
    return {
      dataBase64: buffer.toString("base64"),
      filename: filenameFromRemoteImageUrl(url, mimeType),
      mimeType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return { warning: `${url} 下载异常: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function localizeRemoteImageUrl(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  editId: string,
  url: string,
  cache: Map<string, LocalizedRemoteAsset>,
): Promise<{ replacement?: string; warning?: string }> {
  const cached = cache.get(url);
  if (cached) return { replacement: cached.replacement };
  const downloaded = await downloadImportImage(url);
  if (!downloaded.dataBase64 || !downloaded.filename || !downloaded.mimeType) {
    return { warning: downloaded.warning ?? `${url} 无法本地化，已保留外链` };
  }
  const sourceType = url.includes("r2-asset-worker")
    ? "r2_worker"
    : "remote_url";
  const uploaded = service.uploadAsset(
    {
      editId,
      filename: downloaded.filename,
      dataBase64: downloaded.dataBase64,
      mimeType: downloaded.mimeType,
      originalUrl: url,
      sourceType,
      createdBy: sourceType === "r2_worker" ? "figma" : "system",
    },
    actor,
  );
  if (!uploaded.ok || !uploaded.data) {
    return {
      warning: `${url} 写入项目资产失败: ${uploaded.error?.message ?? "未知错误"}`,
    };
  }
  const replacement = `../../${uploaded.data.path}`;
  cache.set(url, { replacement });
  return { replacement };
}

async function rewriteRemoteImagesInText(
  text: string | undefined,
  input: {
    service: ProjectAdminService;
    actor: ProjectAdminActor;
    editId: string;
    cache: Map<string, LocalizedRemoteAsset>;
  },
): Promise<{ text?: string; warnings: string[] }> {
  if (!text) return { text, warnings: [] };
  const urls = [
    ...new Set(
      [...text.matchAll(IMPORT_REMOTE_IMAGE_RE)].map((match) => match[0]),
    ),
  ];
  if (urls.length === 0) return { text, warnings: [] };
  let next = text;
  const warnings: string[] = [];
  for (const url of urls) {
    const localized = await localizeRemoteImageUrl(
      input.service,
      input.actor,
      input.editId,
      url,
      input.cache,
    );
    if (localized.replacement) {
      next = next.split(url).join(localized.replacement);
    } else if (localized.warning) {
      warnings.push(localized.warning);
    }
  }
  return { text: next, warnings };
}

async function localizePrototypeManifestPage(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  editId: string,
  page: PrototypeManifestPage,
  cache: Map<string, LocalizedRemoteAsset>,
): Promise<{ page: PrototypeManifestPage; warnings: string[] }> {
  const html = await rewriteRemoteImagesInText(page.prototypeHtml, {
    service,
    actor,
    editId,
    cache,
  });
  const css = await rewriteRemoteImagesInText(page.prototypeCss, {
    service,
    actor,
    editId,
    cache,
  });
  const schema = await rewriteRemoteImagesInText(page.schema, {
    service,
    actor,
    editId,
    cache,
  });
  return {
    page: {
      ...page,
      prototypeHtml: html.text,
      prototypeCss: css.text,
      schema: schema.text,
    },
    warnings: [...html.warnings, ...css.warnings, ...schema.warnings],
  };
}

async function updatePrototypePages(
  service: ProjectAdminService,
  actor: ProjectAdminActor,
  input: {
    editId: string;
    manifest: PrototypeManifest;
    noConfig?: boolean;
    dryRun?: boolean;
  },
): Promise<
  ProjectAdminResult<{
    editId: string;
    created: string[];
    updated: string[];
    failed: BatchCommandItemFailure[];
    total: number;
    dryRun: boolean;
    resumeCommand: string;
  }>
> {
  const created: string[] = [];
  const updated: string[] = [];
  const failed: BatchCommandItemFailure[] = [];
  const warnings: string[] = [];
  const remoteAssetCache = new Map<string, LocalizedRemoteAsset>();
  for (const manifestPage of input.manifest.pages) {
    const localized = input.dryRun
      ? { page: manifestPage, warnings: [] }
      : await localizePrototypeManifestPage(
          service,
          actor,
          input.editId,
          manifestPage,
          remoteAssetCache,
        );
    warnings.push(...localized.warnings);
    const page = localized.page;
    const pageId = page.pageId;
    const existing = pageId ? service.getPage(input.editId, pageId) : undefined;
    const name = page.name ?? pageId ?? "原型页";
    const result = existing?.ok
      ? service.updatePrototypePage(
          {
            editId: input.editId,
            pageId: pageId ?? "",
            prototypeHtml: page.prototypeHtml,
            prototypeCss: page.prototypeCss,
            prototypeMeta: page.prototypeMeta,
            dryRun: input.dryRun,
          },
          actor,
        )
      : service.createPage(
          {
            editId: input.editId,
            pageId,
            name,
            routeKey: page.routeKey,
            runtimeType: "prototype-html-css",
            prototypeHtml: page.prototypeHtml,
            prototypeCss: page.prototypeCss,
            prototypeMeta: page.prototypeMeta,
            schema: input.noConfig ? undefined : page.schema,
            order: page.order,
            parentId: page.parentId,
            dryRun: input.dryRun,
          },
          actor,
        );
    if (result.ok && result.data) {
      if (existing?.ok) updated.push(result.data.meta.id);
      else created.push(result.data.meta.id);
    } else {
      failed.push({
        item: pageId ?? name,
        code: result.error?.code ?? "PROTOTYPE_UPDATE_FAILED",
        message: result.error?.message ?? "原型页写入失败",
        resumeCommand: `ow page update-prototypes ${input.editId} --manifest <manifest> --resume --json`,
      });
    }
  }
  const resumeCommand = `ow page update-prototypes ${input.editId} --manifest <manifest> --resume --json`;
  return cliOk(
    {
      editId: input.editId,
      created,
      updated,
      failed,
      total: input.manifest.pages.length,
      dryRun: input.dryRun === true,
      resumeCommand,
    },
    {
      nextActions:
        failed.length > 0
          ? [resumeCommand]
          : [
              `ow edit verify ${input.editId} --checks runtime,prototype-placeholders,metadata --json`,
            ],
      warnings: [
        ...warnings,
        ...(failed.length > 0 ? [`${failed.length} 个页面写入失败`] : []),
      ],
    },
  );
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
  const dataBase = viewerBaseUrl
    ? `${viewerBaseUrl}/data/${result.projectId}`
    : `/data/${result.projectId}`;
  const viewerUrl = viewerBaseUrl
    ? `${viewerBaseUrl}/projects/${result.projectId}`
    : `/projects/${result.projectId}`;
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
  const authorSiteUrl =
    optionalStringArg(args, "authorSiteUrl") ?? process.env.AUTHOR_SITE_URL;
  const authToken =
    optionalStringArg(args, "authToken") ?? process.env.AUTHOR_SITE_AUTH_TOKEN;
  if (!authorSiteUrl) {
    return cliFail("AUTHOR_SITE_URL_MISSING", "未配置 author-site 地址", {
      nextActions: ["传入 --author-site-url <url> 或设置 AUTHOR_SITE_URL"],
    });
  }
  if (!authToken) {
    return cliFail(
      "AUTHOR_SITE_AUTH_TOKEN_MISSING",
      "未配置 author-site 登录 token",
      {
        nextActions: [
          "传入 --auth-token <auth_token> 或设置 AUTHOR_SITE_AUTH_TOKEN",
        ],
      },
    );
  }

  const response = await fetch(
    `${normalizeBaseUrl(authorSiteUrl)}/api/projects/${encodeURIComponent(projectId)}/publish`,
    {
      method: "POST",
      headers: {
        Cookie: `auth_token=${encodeURIComponent(authToken)}`,
      },
    },
  );
  const payload =
    (await response.json()) as ApiResponse<AuthorSitePublishResult>;
  if (!response.ok || !payload.success || !payload.data) {
    return cliFail(
      payload.error?.code ?? `HTTP_${response.status}`,
      payload.error?.message ?? "author-site 发布失败",
      {
        nextActions: [
          "确认 author-site 正在运行",
          "确认 auth token 未过期",
          `ow publish check ${projectId} --json`,
        ],
      },
    );
  }
  const data = withPublishAccessSummary(payload.data, args);
  return {
    ok: true,
    data,
    warnings:
      data.cloudflareSync && !data.cloudflareSync.success
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
    "ow - workbench project admin CLI",
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

register(
  "admin capabilities",
  "查看当前操作者权限和 CLI 能力",
  (_args, _pos, { service, actor }) => service.capabilities(actor),
  ["capabilities", "admin_capabilities"],
);

register("doctor", "诊断本地 CLI 环境", (_args, _pos, { service, actor }) => ({
  ok: true,
  data: {
    cwd: process.cwd(),
    dataDir: service.dataDir,
    actor,
    node: process.version,
    package: "@workbench/project-cli",
  },
  nextActions: ["project list --json", "template list --json"],
}));

register("commands", "列出 CLI 命令", () => ({
  ok: true,
  data: commands.map(({ name, aliases, description }) => ({
    name,
    aliases,
    description,
  })),
}));

register(
  "help input",
  "说明 @file、--input-json 和 CSS at-rule 输入规则",
  () => cliOk(INPUT_HELP),
  ["help_input"],
);

register("validate", "校验本地项目包协议与文件", (args, pos) =>
  validateProjectScaffold(stringArg(args, "dir", pos[0] ?? process.cwd())),
);

register("diff", "对比本地项目包与拉取基线", (args, pos) => {
  const result = diffProjectScaffold(
    stringArg(args, "dir", pos[0] ?? process.cwd()),
  );
  return booleanArg(args, "summary") ? withDiffSummary(result) : result;
});

register(
  "upgrade",
  "升级本地项目脚手架托管文件",
  (args, pos) =>
    upgradeProjectScaffold(
      optionalStringArg(args, "dir", pos[0]) ?? process.cwd(),
      {
        dryRun: booleanArg(args, "dryRun"),
      },
    ),
  ["scaffold upgrade", "scaffold_upgrade"],
);

register(
  "submit",
  "提交本地项目包变更",
  async (args, pos, { service, actor }) => {
    const projectDir = stringArg(args, "dir", pos[0] ?? process.cwd());
    const resolvedDir = path.resolve(projectDir);
    const authorityService = await tryCreateAuthorityService(
      service,
      resolvedDir,
      actor,
    );
    const effectiveService = authorityService ?? service;
    const barrier = await checkWorkspaceMergeBarrier(
      effectiveService,
      resolvedDir,
    );
    if (!barrier.ok) {
      return cliFail(
        barrier.error?.code ?? "WORKSPACE_REVISION_CONFLICT",
        barrier.error?.message ?? "工作区合并屏障检查失败",
        { nextActions: [`ow project pull --json`] },
      );
    }
    return submitProjectScaffold(effectiveService, actor, {
      projectDir: resolvedDir,
      note: optionalStringArg(args, "note"),
    });
  },
);

register(
  "project list",
  "列出项目",
  (_args, _pos, { service, actor }) => service.listProjects(actor),
  ["project_list"],
);

register(
  "project get",
  "获取项目详情",
  (args, pos, { service, actor }) =>
    service.getProject(stringArg(args, "projectId", pos[0]), actor),
  ["project_get"],
);

register(
  "project pull",
  "拉取项目到本地项目包",
  (args, pos, { service, actor }) => {
    const projectId = stringArg(args, "projectId", pos[0]);
    return pullProjectScaffold(service, actor, {
      projectId,
      targetDir: stringArg(args, "dir", pos[1] ?? projectId),
      force: booleanArg(args, "force"),
    });
  },
);

register(
  "project create",
  "创建空白项目或从模板创建",
  (args, _pos, { service, actor }) => {
    const input: CreateProjectInput = {
      name: stringArg(args, "name"),
      category: optionalStringArg(args, "category"),
      templateId: optionalStringArg(args, "templateId"),
      description: optionalStringArg(args, "description"),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.createProject(input, actor);
  },
  ["project_create"],
);

register(
  "project update",
  "修改项目名称、分类、描述和创作偏好",
  (args, pos, { service, actor }) => {
    const preferences = projectAuthoringPreferencesArg(args);
    if (!preferences.ok) return preferences;
    return service.updateProject(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        name: optionalStringArg(args, "name", pos[1]),
        category: hasArg(args, "category")
          ? stringArg(args, "category")
          : undefined,
        description: hasArg(args, "description")
          ? stringArg(args, "description")
          : undefined,
        authoringPreferences: preferences.data,
        dryRun: booleanArg(args, "dryRun"),
      },
      actor,
    );
  },
  ["project_rename"],
);

register(
  "project validate-runtime",
  "校验项目当前版本页面是否符合创作端预览运行契约",
  (args, pos, { service, actor }) => {
    const result = service.validateProjectRuntime(
      stringArg(args, "projectId", pos[0]),
      actor,
    );
    return booleanArg(args, "summary") ? withRuntimeSummary(result) : result;
  },
  ["project_validate_runtime"],
);

register(
  "project verify",
  "聚合验证项目当前版本的 runtime、资产、原型占位和元数据",
  (args, pos, { service, actor }) =>
    service.projectVerify(
      stringArg(args, "projectId", pos[0]),
      stringArrayArg(args, "checks"),
      actor,
    ),
  ["project_verify"],
);

register(
  "project visual-check",
  "生成项目页面效果离线检查报告和截图工件",
  (args, pos, { service, actor }) =>
    service.visualCheck(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        pages: stringArrayArg(args, "pages"),
        viewport: optionalStringArg(args, "viewport"),
        checks: stringArrayArg(args, "checks"),
        outputDir: stringArg(
          args,
          "output",
          pos[1] ??
            path.join(process.cwd(), "test-results", "project-visual-check"),
        ),
      },
      actor,
    ),
  ["project_visual_check"],
);

register(
  "project import-prototype",
  "从外部目录导入 HTML/CSS 原型项目工作流",
  async (args, _pos, { service, actor }) => {
    const manifestResult = parsePrototypeManifest(args);
    if (!manifestResult.ok || !manifestResult.data) return manifestResult;
    const sourceDir = path.resolve(stringArg(args, "source", process.cwd()));
    const dryRun = booleanArg(args, "dryRun");
    const shouldCommit = booleanArg(args, "commit");
    const stages: Array<{ name: string; ok: boolean; data?: unknown }> = [
      { name: "doctor", ok: true, data: { dataDir: service.dataDir, actor } },
    ];
    if (dryRun) {
      stages.push({
        name: "plan",
        ok: true,
        data: {
          projectId: optionalStringArg(args, "projectId"),
          name: optionalStringArg(args, "name"),
          source: sourceDir,
          pages: manifestResult.data.pages.length,
          assets: parseAssetSpecs(args),
          commit: shouldCommit,
        },
      });
      return cliOk(
        {
          dryRun: true,
          stages,
          nextCommand: "ow project import-prototype ... --commit --json",
        },
        {
          nextActions: ["确认 manifest 与资产映射后去掉 --dry-run 重试"],
        },
      );
    }

    let projectId = optionalStringArg(args, "projectId");
    if (!projectId) {
      const created = service.createProject(
        {
          name: stringArg(args, "name") || "导入原型项目",
          description: optionalStringArg(args, "description"),
        },
        actor,
      );
      stages.push({
        name: "project create",
        ok: created.ok,
        data: created.ok ? created.data : created.error,
      });
      if (!created.ok || !created.data)
        return cliFail(
          created.error?.code ?? "PROJECT_CREATE_FAILED",
          created.error?.message ?? "项目创建失败",
          {
            nextActions: ["修复项目名称或权限后重试"],
          },
        );
      projectId = created.data.id;
    } else {
      const project = service.getProject(projectId, actor);
      stages.push({
        name: "project get",
        ok: project.ok,
        data: project.ok ? { projectId } : project.error,
      });
      if (!project.ok)
        return cliFail(
          project.error?.code ?? "PROJECT_NOT_FOUND",
          project.error?.message ?? "项目不存在",
          {
            nextActions: ["确认 --project-id 后重试"],
          },
        );
    }

    const edit = service.beginEdit(projectId, actor);
    stages.push({
      name: "edit begin",
      ok: edit.ok,
      data: edit.ok ? edit.data : edit.error,
    });
    if (!edit.ok || !edit.data)
      return cliFail(
        edit.error?.code ?? "EDIT_BEGIN_FAILED",
        edit.error?.message ?? "无法打开编辑事务",
      );
    const editId = edit.data.editId;

    for (const spec of parseAssetSpecs(args)) {
      const uploaded = uploadAssetDirectory(service, actor, {
        editId,
        from: path.resolve(sourceDir, spec.from),
        to: spec.to,
        include: optionalStringArg(args, "include"),
        dryRun: false,
      });
      stages.push({
        name: "asset upload-dir",
        ok: uploaded.ok,
        data: uploaded.ok ? uploaded.data : uploaded.error,
      });
      if (!uploaded.ok || (uploaded.data && uploaded.data.failed.length > 0)) {
        return cliFail(
          uploaded.error?.code ?? "IMPORT_ASSET_FAILED",
          uploaded.error?.message ?? "资产导入失败",
          {
            nextActions: [
              `ow project import-prototype --project-id ${projectId} --resume --json`,
            ],
            warnings: [`editId=${editId}`],
          },
        );
      }
    }

    const pages = await updatePrototypePages(service, actor, {
      editId,
      manifest: manifestResult.data,
      noConfig: booleanArg(args, "noConfig"),
      dryRun: false,
    });
    stages.push({
      name: "page update-prototypes",
      ok: pages.ok,
      data: pages.ok
        ? { ...pages.data, warnings: pages.warnings ?? [] }
        : pages.error,
    });
    if (!pages.ok || (pages.data && pages.data.failed.length > 0)) {
      return cliFail(
        pages.error?.code ?? "IMPORT_PAGES_FAILED",
        pages.error?.message ?? "原型页导入失败",
        {
          nextActions: [
            `ow page update-prototypes ${editId} --manifest <manifest> --resume --json`,
          ],
          warnings: [`editId=${editId}`],
        },
      );
    }

    const validation = service.editValidate(editId);
    const diff = service.editDiff(editId);
    const runtime = service.validateProjectRuntime(projectId, actor);
    stages.push(
      { name: "edit validate", ok: validation.ok, data: validation.data },
      {
        name: "edit diff --summary",
        ok: diff.ok,
        data: withDiffSummary(diff).data,
      },
      {
        name: "project validate-runtime",
        ok: runtime.ok,
        data: withRuntimeSummary(runtime).data,
      },
    );
    if (!validation.ok || validation.validation?.ok === false) {
      return cliFail("VALIDATION_BLOCKED", "导入后事务校验未通过", {
        validation: validation.validation,
        nextActions: [
          `ow edit verify ${editId} --json`,
          `ow edit diff ${editId} --summary --json`,
        ],
        warnings: [`editId=${editId}`],
      });
    }

    const committed = shouldCommit
      ? service.commitEdit(
          editId,
          optionalStringArg(args, "note") ?? "导入原型项目",
          actor,
        )
      : undefined;
    if (committed)
      stages.push({
        name: "edit commit",
        ok: committed.ok,
        data: committed.ok ? committed.data : committed.error,
      });
    if (committed && (!committed.ok || !committed.data)) {
      return cliFail(
        committed.error?.code ?? "COMMIT_FAILED",
        committed.error?.message ?? "提交失败",
        {
          nextActions: [
            `ow edit status ${editId} --json`,
            `ow edit diff ${editId} --summary --json`,
          ],
          warnings: [`editId=${editId}`],
        },
      );
    }

    return cliOk(
      {
        projectId,
        editId,
        versionId: committed?.data?.version.versionId,
        auditId: committed?.auditId,
        committed: committed?.ok === true,
        stages,
        summary: {
          pages: manifestResult.data.pages.length,
          assets: parseAssetSpecs(args).length,
          validationOk: validation.validation?.ok ?? validation.ok,
        },
      },
      {
        nextActions: committed?.ok
          ? [
              `ow report agent-run --project-id ${projectId} --edit-id ${editId} --version-id ${committed.data?.version.versionId} --audit-id ${committed.auditId ?? ""} --json`,
            ]
          : [
              `ow edit diff ${editId} --summary --json`,
              `ow edit commit ${editId} --json`,
            ],
        warnings: pages.warnings,
      },
    );
  },
  ["project_import_prototype"],
);

register(
  "project commit-list",
  "列出项目内容图提交",
  (args, pos, { service, actor }) =>
    service.projectCommitList(
      stringArg(args, "projectId", pos[0]),
      booleanArg(args, "includeDraft"),
      actor,
    ),
  ["project_commit_list"],
);

register(
  "project materialize",
  "从内容图提交物化项目基准工作区",
  (args, pos, { service, actor }) =>
    service.projectMaterialize(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        commitId: optionalStringArg(args, "commit", pos[1]),
        checkOnly: booleanArg(args, "check"),
      },
      actor,
    ),
  ["project_materialize"],
);

register(
  "project content-gc",
  "扫描或清理内容图未引用 blob",
  (args, pos, { service, actor }) =>
    service.contentBlobGarbageCollect(
      stringArg(args, "projectId", pos[0]),
      { dryRun: hasArg(args, "dryRun") ? booleanArg(args, "dryRun") : true },
      actor,
    ),
  ["project_content_gc"],
);

register(
  "project duplicate",
  "复制项目为独立项目",
  (args, pos, { service, actor }) =>
    service.duplicateProject(
      stringArg(args, "projectId", pos[0]),
      optionalStringArg(args, "name", pos[1]),
      undefined,
      actor,
    ),
  ["project_duplicate"],
);

register(
  "project delete-preview",
  "预览删除项目影响",
  (args, pos, { service, actor }) =>
    service.deleteProjectPreview(stringArg(args, "projectId", pos[0]), actor),
  ["project_delete_preview"],
);

register(
  "project delete-execute",
  "执行项目删除预览计划",
  (args, pos, { service, actor }) =>
    service.deleteProjectExecute(
      stringArg(args, "planId", pos[0]),
      stringArg(args, "confirmToken", pos[1]),
      actor,
    ),
  ["project_delete_execute"],
);

register(
  "project set-cover",
  "设置项目封面路径",
  (args, pos, { service, actor }) =>
    service.setProjectCover(
      stringArg(args, "projectId", pos[0]),
      stringArg(args, "thumbnail", pos[1]),
      actor,
    ),
  ["project_set_cover"],
);

register(
  "project delete-cover",
  "删除项目封面",
  (args, pos, { service, actor }) =>
    service.setProjectCover(
      stringArg(args, "projectId", pos[0]),
      undefined,
      actor,
    ),
  ["project_delete_cover"],
);

register(
  "template list",
  "列出模板",
  (args, _pos, { service }) =>
    service.listTemplates({
      scope: scopeArg(args),
      official: hasArg(args, "official")
        ? booleanArg(args, "official")
        : undefined,
    }),
  ["template_list"],
);

register(
  "template get",
  "获取模板详情",
  (args, pos, { service }) =>
    service.getTemplate(stringArg(args, "templateId", pos[0])),
  ["template_get"],
);

register(
  "template create-from-project",
  "将项目保存为模板快照",
  (args, pos, { service, actor }) =>
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

register(
  "template update-meta",
  "修改模板元数据",
  (args, pos, { service, actor }) =>
    service.updateTemplateMeta(
      stringArg(args, "templateId", pos[0]),
      {
        category: optionalStringArg(args, "category"),
        name: optionalStringArg(args, "name"),
        description: optionalStringArg(args, "description"),
        thumbnail: optionalStringArg(args, "thumbnail"),
        scope: scopeArg(args),
        official: hasArg(args, "official")
          ? booleanArg(args, "official")
          : undefined,
      },
      actor,
    ),
  ["template_update_meta"],
);

register(
  "template health-check",
  "检查模板健康度",
  (args, pos, { service }) =>
    service.checkTemplateHealth(optionalStringArg(args, "templateId", pos[0])),
  ["template_health_check"],
);

register(
  "template delete-preview",
  "预览模板删除影响",
  (args, pos, { service }) =>
    service.deleteTemplatePreview(stringArg(args, "templateId", pos[0])),
  ["template_delete_preview"],
);

register(
  "template delete-execute",
  "删除模板",
  (args, pos, { service, actor }) =>
    service.deleteTemplateExecute(
      stringArg(args, "planId", pos[0]),
      stringArg(args, "confirmToken", pos[1]),
      actor,
    ),
  ["template_delete_execute"],
);

register(
  "template recommend",
  "基于描述推荐模板",
  (args, pos, { service }) =>
    service.recommendTemplate(stringArg(args, "description", pos.join(" "))),
  ["template_recommend"],
);

register(
  "template instantiate",
  "从模板创建项目",
  (args, pos, { service, actor }) =>
    service.instantiateTemplate(
      stringArg(args, "templateId", pos[0]),
      stringArg(args, "name", pos[1]),
      actor,
    ),
  ["template_instantiate"],
);

register(
  "template init",
  "从模板创建项目并拉取为本地项目包",
  (args, pos, { service, actor }) => {
    const templateId = stringArg(args, "templateId", pos[0]);
    return initTemplateScaffold(service, actor, {
      templateId,
      targetDir: stringArg(args, "dir", pos[1] ?? templateId),
      name: optionalStringArg(args, "name"),
      force: booleanArg(args, "force"),
    });
  },
  ["template_init"],
);

register(
  "template submit",
  "提交本地项目包并保存为模板快照",
  async (args, pos, { service, actor }) => {
    const projectDir = stringArg(args, "dir", pos[0] ?? process.cwd());
    const resolvedDir = path.resolve(projectDir);
    const authorityService = await tryCreateAuthorityService(
      service,
      resolvedDir,
      actor,
    );
    const effectiveService = authorityService ?? service;
    return submitTemplateScaffold(effectiveService, actor, {
      projectDir: resolvedDir,
      note: optionalStringArg(args, "note"),
      meta: {
        category: stringArg(args, "category"),
        name: stringArg(args, "name"),
        description: stringArg(args, "description"),
        thumbnail: optionalStringArg(args, "thumbnail"),
        scope: scopeArg(args),
        official: hasArg(args, "official")
          ? booleanArg(args, "official")
          : undefined,
      },
    });
  },
  ["template_submit"],
);

register(
  "edit begin",
  "打开项目编辑事务",
  (args, pos, { service, actor }) =>
    service.beginEdit(stringArg(args, "projectId", pos[0]), actor),
  ["edit_begin"],
);

register(
  "edit status",
  "查看事务状态",
  (args, pos, { service }) =>
    service.editStatus(stringArg(args, "editId", pos[0])),
  ["edit_status"],
);

register(
  "edit diff",
  "查看事务差异",
  (args, pos, { service }) => {
    const result = service.editDiff(stringArg(args, "editId", pos[0]));
    return booleanArg(args, "summary") ? withDiffSummary(result) : result;
  },
  ["edit_diff"],
);

register(
  "edit validate",
  "校验事务工作区",
  (args, pos, { service }) =>
    service.editValidate(stringArg(args, "editId", pos[0])),
  ["edit_validate"],
);

register(
  "edit verify",
  "聚合验证事务工作区的 runtime、资产、原型占位和元数据",
  (args, pos, { service }) =>
    service.editVerify(
      stringArg(args, "editId", pos[0]),
      stringArrayArg(args, "checks"),
    ),
  ["edit_verify"],
);

register(
  "edit commit",
  "提交编辑事务并生成版本",
  (args, pos, { service, actor }) =>
    service.commitEdit(
      stringArg(args, "editId", pos[0]),
      optionalStringArg(args, "note", pos[1]),
      actor,
    ),
  ["edit_commit"],
);

register(
  "edit discard",
  "丢弃编辑事务",
  (args, pos, { service, actor }) =>
    service.discardEdit(stringArg(args, "editId", pos[0]), actor),
  ["edit_discard"],
);

register(
  "edit extend",
  "延长事务有效期",
  (args, pos, { service }) =>
    service.extendEdit(stringArg(args, "editId", pos[0])),
  ["edit_extend"],
);

register(
  "page list",
  "列出页面和文件夹树",
  (args, pos, { service }) => {
    const result = service.listPages(stringArg(args, "editId", pos[0]));
    return booleanArg(args, "summary") ? withPageListSummary(result) : result;
  },
  ["page_list"],
);

register(
  "page get",
  "获取单页代码、Schema 和元信息",
  (args, pos, { service }) =>
    service.getPage(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
    ),
  ["page_get"],
);

register(
  "resource version-list",
  "列出资源历史版本",
  (args, pos, { service, actor }) =>
    service.resourceVersionList(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        kind: resourceKindArg(args, "kind", pos[1]),
        resourceId: stringArg(args, "resourceId", pos[2]),
        includeDraft: booleanArg(args, "includeDraft"),
      },
      actor,
    ),
  ["resource_version_list"],
);

register(
  "resource version-get",
  "读取资源历史版本内容",
  (args, pos, { service, actor }) =>
    service.resourceVersionGet(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        kind: resourceKindArg(args, "kind", pos[1]),
        resourceId: stringArg(args, "resourceId", pos[2]),
        versionId: stringArg(args, "versionId", pos[3]),
      },
      actor,
    ),
  ["resource_version_get"],
);

register(
  "resource version-create",
  "创建资源历史版本",
  (args, pos, { service, actor }) =>
    service.resourceVersionCreate(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        kind: resourceKindArg(args, "kind", pos[1]),
        resourceId: stringArg(args, "resourceId", pos[2]),
        editId: optionalStringArg(args, "editId"),
        note: optionalStringArg(args, "note", pos.slice(3).join(" ")),
      },
      actor,
    ),
  ["resource_version_create"],
);

register(
  "resource restore-version",
  "恢复单个资源到历史版本",
  (args, pos, { service, actor }) =>
    service.resourceRestore(
      {
        projectId: stringArg(args, "projectId", pos[0]),
        kind: resourceKindArg(args, "kind", pos[1]),
        resourceId: stringArg(args, "resourceId", pos[2]),
        versionId: stringArg(args, "versionId", pos[3]),
      },
      actor,
    ),
  ["resource_restore_version"],
);

register(
  "page create",
  "新建页面",
  (args, _pos, { service, actor }) => {
    const input: PageCreateInput = {
      editId: stringArg(args, "editId"),
      name: stringArg(args, "name"),
      pageId: optionalStringArg(args, "pageId"),
      routeKey: optionalStringArg(args, "routeKey"),
      parentId: optionalStringArg(args, "parentId") ?? null,
      runtimeType: optionalStringArg(
        args,
        "runtimeType",
      ) as PageCreateInput["runtimeType"],
      order: numberArg(args, "order"),
      code: optionalStringArg(args, "code"),
      schema: optionalStringArg(args, "schema"),
      prototypeHtml: optionalStringArg(args, "prototypeHtml"),
      prototypeCss: optionalStringArg(args, "prototypeCss"),
      prototypeMeta:
        args.prototypeMeta && typeof args.prototypeMeta === "object"
          ? (args.prototypeMeta as PageCreateInput["prototypeMeta"])
          : undefined,
      sketchScene: optionalStringArg(args, "sketchScene"),
      sketchMeta:
        args.sketchMeta && typeof args.sketchMeta === "object"
          ? (args.sketchMeta as PageCreateInput["sketchMeta"])
          : undefined,
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.createPage(input, actor);
  },
  ["page_create"],
);

register(
  "page duplicate",
  "复制页面",
  (args, pos, { service, actor }) =>
    service.duplicatePage(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
      optionalStringArg(args, "name", pos[2]),
      actor,
    ),
  ["page_duplicate"],
);

register(
  "page update-code",
  "更新页面代码",
  (args, pos, { service, actor }) =>
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

register(
  "page update-prototype",
  "更新 HTML/CSS 原型页内容",
  (args, pos, { service, actor }) => {
    const input: PageUpdatePrototypeInput = {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      prototypeHtml: optionalStringArg(args, "prototypeHtml"),
      prototypeCss: optionalStringArg(args, "prototypeCss"),
      prototypeMeta:
        args.prototypeMeta && typeof args.prototypeMeta === "object"
          ? (args.prototypeMeta as PageUpdatePrototypeInput["prototypeMeta"])
          : undefined,
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.updatePrototypePage(input, actor);
  },
  ["page_update_prototype"],
);

register(
  "page update-prototypes",
  "按 manifest 批量创建或更新 HTML/CSS 原型页",
  (args, pos, { service, actor }) => {
    const manifest = parsePrototypeManifest(args);
    if (!manifest.ok || !manifest.data) return manifest;
    return updatePrototypePages(service, actor, {
      editId: stringArg(args, "editId", pos[0]),
      manifest: manifest.data,
      noConfig: booleanArg(args, "noConfig"),
      dryRun: booleanArg(args, "dryRun"),
    });
  },
  ["page_update_prototypes"],
);

register(
  "page update-sketch",
  "更新草图页 scene 内容",
  (args, pos, { service, actor }) => {
    const input: PageSwitchRuntimeInput = {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      targetRuntimeType: "sketch-scene",
      sketchScene: optionalStringArg(args, "sketchScene", pos[2]),
      sketchMeta:
        args.sketchMeta && typeof args.sketchMeta === "object"
          ? (args.sketchMeta as PageSwitchRuntimeInput["sketchMeta"])
          : undefined,
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.switchPageRuntime(input, actor);
  },
  ["page_update_sketch"],
);

register(
  "page switch-runtime",
  "切换页面运行时类型",
  (args, pos, { service, actor }) => {
    const input: PageSwitchRuntimeInput = {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      targetRuntimeType: stringArg(
        args,
        "targetRuntimeType",
        pos[2],
      ) as PageSwitchRuntimeInput["targetRuntimeType"],
      code: optionalStringArg(args, "code"),
      schema: optionalStringArg(args, "schema"),
      prototypeHtml: optionalStringArg(args, "prototypeHtml"),
      prototypeCss: optionalStringArg(args, "prototypeCss"),
      prototypeMeta:
        args.prototypeMeta && typeof args.prototypeMeta === "object"
          ? (args.prototypeMeta as PageSwitchRuntimeInput["prototypeMeta"])
          : undefined,
      sketchScene: optionalStringArg(args, "sketchScene"),
      sketchMeta:
        args.sketchMeta && typeof args.sketchMeta === "object"
          ? (args.sketchMeta as PageSwitchRuntimeInput["sketchMeta"])
          : undefined,
      reason: optionalStringArg(args, "reason"),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.switchPageRuntime(input, actor);
  },
  ["page_switch_runtime"],
);

register(
  "page validate-runtime",
  "校验页面是否符合创作端预览运行契约",
  (args, pos, { service }) =>
    service.validatePageRuntime(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
    ),
  ["page_validate_runtime"],
);

register(
  "page update-schema",
  "更新页面 Schema",
  (args, pos, { service, actor }) =>
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

register(
  "page update-meta",
  "修改页面名称、父文件夹和排序",
  (args, pos, { service, actor }) => {
    const input: PageUpdateInput = {
      editId: stringArg(args, "editId", pos[0]),
      pageId: stringArg(args, "pageId", pos[1]),
      name: optionalStringArg(args, "name"),
      parentId: hasArg(args, "parentId")
        ? stringArg(args, "parentId") || null
        : undefined,
      order: numberArg(args, "order"),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.updatePage(input, actor);
  },
  ["page_update_meta"],
);

register(
  "page delete-preview",
  "预览页面删除影响",
  (args, pos, { service }) =>
    service.deletePagePreview(
      stringArg(args, "editId", pos[0]),
      stringArrayArg(args, "pageIds").length > 0
        ? stringArrayArg(args, "pageIds")
        : pos.slice(1),
    ),
  ["page_delete_preview"],
);

register(
  "page delete-execute",
  "执行页面删除计划",
  (args, pos, { service, actor }) =>
    service.deletePageExecute(
      stringArg(args, "planId", pos[0]),
      stringArg(args, "confirmToken", pos[1]),
      actor,
    ),
  ["page_delete_execute"],
);

register(
  "page reorder",
  "页面和文件夹混合排序",
  (args, pos, { service, actor }) =>
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

register(
  "folder create",
  "创建虚拟文件夹",
  (args, pos, { service, actor }) =>
    service.createFolder(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "name", pos[1]),
      optionalStringArg(args, "parentId") ?? null,
      actor,
    ),
  ["folder_create"],
);

register(
  "folder update",
  "重命名、移动或调整排序",
  (args, pos, { service, actor }) => {
    const input: FolderUpdateInput = {
      editId: stringArg(args, "editId", pos[0]),
      folderId: stringArg(args, "folderId", pos[1]),
      name: optionalStringArg(args, "name"),
      parentId: hasArg(args, "parentId")
        ? stringArg(args, "parentId") || null
        : undefined,
      order: numberArg(args, "order"),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.updateFolder(input, actor);
  },
  ["folder_update"],
);

register(
  "folder delete-preview",
  "预览文件夹删除影响",
  (args, pos, { service }) =>
    service.deleteFolderPreview(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "folderId", pos[1]),
    ),
  ["folder_delete_preview"],
);

register(
  "folder delete-execute",
  "删除文件夹",
  (args, pos, { service, actor }) =>
    service.deleteFolderExecute(
      stringArg(args, "planId", pos[0]),
      stringArg(args, "confirmToken", pos[1]),
      stringArg(args, "strategy") === "delete_contents"
        ? "delete_contents"
        : "move_to_root",
      actor,
    ),
  ["folder_delete_execute"],
);

register(
  "config get-project-schema",
  "读取项目级配置 Schema",
  (args, pos, { service }) =>
    service.getProjectConfig(stringArg(args, "editId", pos[0])),
  ["config_get_project_schema"],
);

register(
  "config set-project-schema",
  "创建或更新项目级配置 Schema",
  (args, pos, { service, actor }) => {
    const input: ConfigUpdateInput = {
      editId: stringArg(args, "editId", pos[0]),
      schema: stringArg(args, "schema", pos[1]),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.setProjectConfig(input, actor);
  },
  ["config_set_project_schema"],
);

register(
  "config delete-project-schema",
  "删除项目级配置 Schema",
  (args, pos, { service, actor }) =>
    service.deleteProjectConfig(
      stringArg(args, "editId", pos[0]),
      booleanArg(args, "dryRun"),
      actor,
    ),
  ["config_delete_project_schema"],
);

register(
  "config validate-page-schema",
  "校验页面 Schema",
  (args, pos, { service }) =>
    service.validatePageSchema(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
    ),
  ["config_validate_page_schema"],
);

register(
  "config validate-merged-schema",
  "校验项目级和页面级 Schema 合并结果",
  (args, pos, { service }) =>
    service.validateMergedSchema(stringArg(args, "editId", pos[0])),
  ["config_validate_merged_schema"],
);

register(
  "config generate-from-code",
  "从页面代码生成候选 Schema",
  (args, pos, { service }) =>
    service.generateSchemaFromCode(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
    ),
  ["config_generate_from_code"],
);

register(
  "config apply-visual-patch",
  "应用可视化配置补丁候选",
  (args, pos, { service }) =>
    service.applyVisualPatch(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
      objectArg(args, "patch"),
    ),
  ["config_apply_visual_patch"],
);

register(
  "asset list",
  "列出项目图片和引用摘要",
  (args, pos, { service }) => {
    const result = service.listAssets(stringArg(args, "editId", pos[0]));
    return booleanArg(args, "summary") ? withAssetListSummary(result) : result;
  },
  ["asset_list"],
);

register(
  "asset upload",
  "上传图片资产到事务工作区",
  (args, pos, { service, actor }) => {
    const asset = readAssetInput(args);
    const input: AssetUploadInput = {
      editId: stringArg(args, "editId", pos[0]),
      filename: asset.filename,
      dataBase64: asset.dataBase64,
      mimeType: asset.mimeType,
      targetPath: optionalStringArg(args, "targetPath"),
      dryRun: booleanArg(args, "dryRun"),
    };
    return service.uploadAsset(input, actor);
  },
  ["asset_upload"],
);

register(
  "asset upload-dir",
  "批量上传目录内图片资产到事务工作区",
  (args, pos, { service, actor }) =>
    uploadAssetDirectory(service, actor, {
      editId: stringArg(args, "editId", pos[0]),
      from: stringArg(args, "from"),
      to: stringArg(args, "to") || "assets/images",
      include: optionalStringArg(args, "include"),
      dryRun: booleanArg(args, "dryRun"),
    }),
  ["asset_upload_dir"],
);

register(
  "asset delete-preview",
  "预览删除图片影响",
  (args, pos, { service }) =>
    service.deleteAssetPreview(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "assetPath", pos[1]),
    ),
  ["asset_delete_preview"],
);

register(
  "asset delete-execute",
  "执行图片删除计划",
  (args, pos, { service, actor }) =>
    service.deleteAssetExecute(
      stringArg(args, "planId", pos[0]),
      stringArg(args, "confirmToken", pos[1]),
      actor,
    ),
  ["asset_delete_execute"],
);

register(
  "asset replace",
  "替换图片并更新文本引用",
  (args, pos, { service, actor }) => {
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
  },
  ["asset_replace"],
);

register(
  "preview compile",
  "编译指定页面或全项目的静态预检",
  (args, pos, { service }) =>
    service.previewCompile(
      stringArg(args, "editId", pos[0]),
      optionalStringArg(args, "pageId", pos[1]),
    ),
  ["preview_compile"],
);

register(
  "preview render",
  "获取可访问预览 URL",
  (args, pos, { service }) =>
    service.previewRender(
      stringArg(args, "editId", pos[0]),
      stringArg(args, "pageId", pos[1]),
    ),
  ["preview_render"],
);

register(
  "preview screenshot",
  "捕获页面截图服务状态",
  (_args, _pos, { service }) => service.previewScreenshot(),
  ["preview_screenshot"],
);

register(
  "preview console-logs",
  "读取页面控制台日志",
  (_args, _pos, { service }) => service.previewLogs(),
  ["preview_console_logs"],
);

register(
  "preview runtime-errors",
  "读取运行时错误",
  (_args, _pos, { service }) => service.previewLogs(),
  ["preview_runtime_errors"],
);

register(
  "preview healthcheck",
  "检查预览相关服务健康度",
  (_args, _pos, { service }) => service.previewHealthcheck(),
  ["preview_healthcheck"],
);

register(
  "publish check",
  "发布前检查",
  (args, pos, { service, actor }) =>
    service.publishCheck(stringArg(args, "projectId", pos[0]), actor),
  ["publish_check"],
);

register(
  "publish project",
  "发布项目",
  async (args, pos, { service, actor }) => {
    const projectId = stringArg(args, "projectId", pos[0]);
    if (
      optionalStringArg(args, "authorSiteUrl") ||
      process.env.AUTHOR_SITE_URL
    ) {
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

register(
  "publish status",
  "查询发布状态",
  (args, pos, { service, actor }) =>
    service.publishStatus(stringArg(args, "projectId", pos[0]), actor),
  ["publish_status"],
);

register(
  "publish rollback",
  "回滚到上一发布版本",
  (args, pos, { service, actor }) =>
    service.publishRollback(stringArg(args, "projectId", pos[0]), actor),
  ["publish_rollback"],
);

register(
  "publish artifacts",
  "查看发布产物摘要",
  (args, pos, { service, actor }) =>
    service.publishStatus(stringArg(args, "projectId", pos[0]), actor),
  ["publish_artifacts"],
);

register(
  "ai session-list",
  "列出项目相关 AI 会话摘要",
  (args, pos, { service }) =>
    service.aiSessionList(stringArg(args, "projectId", pos[0])),
  ["ai_session_list"],
);

register(
  "ai session-get",
  "读取 AI 会话摘要",
  (args, pos, { service }) =>
    service.aiSessionGet(stringArg(args, "sessionId", pos[0])),
  ["ai_session_get"],
);

register(
  "ai run-logs",
  "读取 AI 会话关联运行日志",
  (args, pos, { service }) =>
    service.aiRunLogs(stringArg(args, "sessionId", pos[0])),
  ["ai_run_logs"],
);

register(
  "ai workspace-context",
  "读取 AI 会话关联工作区文件列表",
  (args, pos, { service }) =>
    service.aiWorkspaceContext(stringArg(args, "sessionId", pos[0])),
  ["ai_workspace_context"],
);

register(
  "ai send-message",
  "向 agent-service 在线 AI 会话发送指令",
  (args, pos, { service, actor }) =>
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

register(
  "audit list",
  "查询项目操作记录",
  (args, pos, { service }) =>
    service.auditList(optionalStringArg(args, "projectId", pos[0])),
  ["audit_list"],
);

register(
  "audit get",
  "查看单次操作详情",
  (args, pos, { service }) =>
    service.auditGet(stringArg(args, "auditId", pos[0])),
  ["audit_get"],
);

register(
  "report agent-run",
  "生成 Agent 本次运行证据包摘要",
  (args, _pos, { service, actor }) => {
    const input: AgentRunReportInput = {
      projectId: optionalStringArg(args, "projectId"),
      editId: optionalStringArg(args, "editId"),
      versionId: optionalStringArg(args, "versionId"),
      auditId: optionalStringArg(args, "auditId"),
      visualReportPath: optionalStringArg(args, "visualReportPath"),
    };
    return service.agentRunReport(input, actor);
  },
  ["report_agent_run"],
);

register(
  "recipe list",
  "列出 Agent 工作流配方",
  () =>
    cliOk({
      recipes: RECIPES.map(({ id, title }) => ({ id, title })),
    }),
  ["recipe_list"],
);

register(
  "recipe show",
  "查看单个 Agent 工作流配方",
  (args, pos) => {
    const recipe = recipeById(stringArg(args, "recipeId", pos[0]));
    return recipe
      ? cliOk(recipe)
      : cliFail("RECIPE_NOT_FOUND", "配方不存在", {
          nextActions: ["ow recipe list --json"],
        });
  },
  ["recipe_show"],
);

register(
  "admin lock-project",
  "临时锁定项目",
  (args, pos, { service, actor }) =>
    service.lockProject(stringArg(args, "projectId", pos[0]), actor),
  ["admin_lock_project"],
);

register(
  "admin unlock-project",
  "解除项目锁",
  (args, pos, { service, actor }) =>
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

  const config: ProjectAdminConfig = parsed.dataDir
    ? { dataDir: parsed.dataDir }
    : {};
  const service = new ProjectAdminService(config);
  const actor = actorFromEnv();
  const positionals = [
    ...parsed.commandWords.slice(match.consumed),
    ...parsed.positionals,
  ];
  const args = await applyJsonInput(parsed.options);
  const result = await match.command.run(args, positionals, { service, actor });
  if (parsed.json) printJson(result);
  else printHuman(result);
  return isFailedResult(normalizeResult(result)) ? 1 : 0;
}

const isCliEntrypoint =
  process.env.PROJECT_CLI_DISABLE_AUTO_RUN !== "1" &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      processStderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
