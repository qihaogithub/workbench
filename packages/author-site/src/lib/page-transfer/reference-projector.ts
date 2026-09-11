import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  PageTransferStore,
  normalizeHtmlImport,
} from "@workbench/project-core";
import {
  extractDeclaredRegionIds,
  resolvePagePresentation,
  type DemoPageMeta,
  type HtmlImportMeta,
} from "@workbench/shared";

import { compileCode } from "@/lib/compiler";
import {
  getDataDir,
  getProjectPath,
  getProjectConfigSchema,
  getProjectConfigValues,
  listDemoPages,
  projectExists,
} from "@/lib/fs-utils";
import {
  createHtmlSandboxExecution,
  HTML_SANDBOX_POLICY_VERSION,
  resolveHtmlSandboxPublicOrigin,
} from "@/lib/html-sandbox-execution";
import type {
  PublishedDemoPage,
  PublishedProject,
} from "@/lib/publish-manager";
import { buildGrantedPagePackage } from "./adapters";

const DATA_DIR = getDataDir();
const PUBLISHED_DIR = path.join(DATA_DIR, "published");
const PRIVATE_DIR = path.join(
  DATA_DIR,
  ".project-admin",
  "page-reference-materializations",
);

export class ReferenceProjectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "ReferenceProjectionError";
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readText(filePath: string): string | undefined {
  return fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : undefined;
}

function hashFiles(files: Array<[string, string | undefined]>): string {
  const value = files
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, content]) =>
        `${name}\0${crypto.createHash("sha256").update(content).digest("hex")}`,
    )
    .join("\n");
  return crypto.createHash("sha256").update(value).digest("hex");
}

function publishedProject(
  targetProjectId: string,
  version: string,
): PublishedProject {
  const file = path.join(PUBLISHED_DIR, targetProjectId, "project.json");
  if (!fs.existsSync(file))
    throw new ReferenceProjectionError(
      "PUBLISHED_PROJECT_NOT_FOUND",
      "目标项目尚未发布",
      404,
    );
  const project = readJson<PublishedProject>(file);
  if (project.publishedVersion !== version)
    throw new ReferenceProjectionError(
      "PUBLISHED_VERSION_MISMATCH",
      "目标发布版本不匹配",
      404,
    );
  return project;
}

function targetReferencePage(
  project: PublishedProject,
  grantId: string,
): PublishedDemoPage {
  const page = project.demoPages.find(
    (candidate) => candidate.referenceId === grantId,
  );
  if (!page)
    throw new ReferenceProjectionError(
      "REFERENCE_NOT_PUBLISHED",
      "引用未包含在目标发布清单中",
      404,
    );
  return page;
}

function materializationPaths(
  targetProjectId: string,
  grantId: string,
  materializationId: string,
) {
  const publicDir = path.join(
    PUBLISHED_DIR,
    targetProjectId,
    "references",
    grantId,
    materializationId,
  );
  const privateDir = path.join(PRIVATE_DIR, grantId, materializationId);
  return {
    publicDir,
    privateDir,
    pageFile: path.join(privateDir, "page.json"),
  };
}

function loadMaterializedPage(
  targetProjectId: string,
  grantId: string,
  materializationId: string,
): PublishedDemoPage {
  const { pageFile } = materializationPaths(
    targetProjectId,
    grantId,
    materializationId,
  );
  if (!fs.existsSync(pageFile))
    throw new ReferenceProjectionError(
      "REFERENCE_MATERIALIZATION_MISSING",
      "最近可用引用产物缺失",
      503,
    );
  return readJson<PublishedDemoPage>(pageFile);
}

function pageSourceFiles(sourceWorkspacePath: string, sourcePageId: string) {
  const demoDir = path.join(sourceWorkspacePath, "demos", sourcePageId);
  return {
    demoDir,
    code: readText(path.join(demoDir, "index.tsx")),
    schema: readText(path.join(demoDir, "config.schema.json")),
    values: readText(path.join(demoDir, "config.values.json")),
    prototypeHtml: readText(path.join(demoDir, "prototype.html")),
    prototypeCss: readText(path.join(demoDir, "prototype.css")),
    prototypeMeta: readText(path.join(demoDir, "prototype.meta.json")),
    sandboxHtml: readText(path.join(demoDir, "sandbox.html")),
    htmlImportMeta: readText(path.join(demoDir, "html-import.meta.json")),
    sketchScene: readText(path.join(demoDir, "sketch.scene.json")),
    sketchMeta: readText(path.join(demoDir, "sketch.meta.json")),
    requirements: readText(path.join(demoDir, "requirements.md")),
    projectSchema: getProjectConfigSchema(sourceWorkspacePath) ?? undefined,
    projectValues: JSON.stringify(
      getProjectConfigValues(sourceWorkspacePath) ?? {},
    ),
  };
}

function buildMaterialization(input: {
  targetProjectId: string;
  targetPage: PublishedDemoPage;
  grantId: string;
  sourcePage: DemoPageMeta;
  sourceWorkspacePath: string;
  projectConfigSchema?: string;
  projectConfigValues?: string;
}): { page: PublishedDemoPage; materializationId: string } {
  const files = pageSourceFiles(input.sourceWorkspacePath, input.sourcePage.id);
  files.projectSchema = input.projectConfigSchema;
  files.projectValues = input.projectConfigValues ?? "{}";
  if (!files.schema)
    throw new ReferenceProjectionError(
      "REFERENCE_SCHEMA_MISSING",
      "源页面配置 Schema 缺失",
    );
  const materializationId = hashFiles(
    Object.entries(files).filter(
      (entry): entry is [string, string | undefined] => entry[0] !== "demoDir",
    ) as Array<[string, string | undefined]>,
  );
  const dirs = materializationPaths(
    input.targetProjectId,
    input.grantId,
    materializationId,
  );
  fs.mkdirSync(dirs.publicDir, { recursive: true });
  fs.mkdirSync(dirs.privateDir, { recursive: true });
  fs.writeFileSync(
    path.join(dirs.publicDir, "config.schema.json"),
    files.schema,
    "utf8",
  );
  const base: PublishedDemoPage = {
    ...input.targetPage,
    runtimeType: input.sourcePage.runtimeType,
    regionIds: extractDeclaredRegionIds([files.schema]),
    presentation: resolvePagePresentation(files.schema),
    schemaPath: `references/${input.grantId}/${materializationId}/config.schema.json`,
    requirements: files.requirements,
    referenceProjectConfigSchema: files.projectSchema,
    referenceProjectConfigValues: JSON.parse(files.projectValues) as Record<
      string,
      unknown
    >,
    pageConfigValues: files.values
      ? readJson<Record<string, unknown>>(
          path.join(files.demoDir, "config.values.json"),
        )
      : {},
  };
  let page: PublishedDemoPage;
  if (input.sourcePage.runtimeType === "high-fidelity-react") {
    if (!files.code)
      throw new ReferenceProjectionError(
        "REFERENCE_CODE_MISSING",
        "源 React 页面代码缺失",
      );
    const compiled = compileCode(files.code);
    fs.writeFileSync(
      path.join(dirs.publicDir, "compiled.js"),
      compiled.compiledCode,
      "utf8",
    );
    page = {
      ...base,
      compiledJsPath: `references/${input.grantId}/${materializationId}/compiled.js`,
      prototypeHtml: undefined,
      prototypeCss: undefined,
      sketchScene: undefined,
      sandboxExecutionPath: undefined,
    };
  } else if (input.sourcePage.runtimeType === "prototype-html-css") {
    if (!files.prototypeHtml || files.prototypeCss === undefined)
      throw new ReferenceProjectionError(
        "REFERENCE_PROTOTYPE_MISSING",
        "源原型页面资源缺失",
      );
    page = {
      ...base,
      prototypeHtml: files.prototypeHtml,
      prototypeCss: files.prototypeCss,
      prototypeMeta: files.prototypeMeta
        ? (JSON.parse(files.prototypeMeta) as Record<string, unknown>)
        : {},
      compiledJsPath: undefined,
      sketchScene: undefined,
      sandboxExecutionPath: undefined,
    };
  } else if (input.sourcePage.runtimeType === "sketch-scene") {
    if (!files.sketchScene)
      throw new ReferenceProjectionError(
        "REFERENCE_SKETCH_MISSING",
        "源手绘页面资源缺失",
      );
    page = {
      ...base,
      sketchScene: JSON.parse(files.sketchScene) as Record<string, unknown>,
      sketchMeta: files.sketchMeta
        ? (JSON.parse(files.sketchMeta) as Record<string, unknown>)
        : {},
      compiledJsPath: undefined,
      prototypeHtml: undefined,
      sandboxExecutionPath: undefined,
    };
  } else {
    if (!files.sandboxHtml || !files.htmlImportMeta)
      throw new ReferenceProjectionError(
        "REFERENCE_SANDBOX_MISSING",
        "源 sandbox 页面资源缺失",
      );
    const meta = JSON.parse(files.htmlImportMeta) as HtmlImportMeta;
    const normalization = normalizeHtmlImport(files.sandboxHtml);
    if (
      normalization.analysis.outcome.status !== "accepted" ||
      normalization.analysis.outcome.runtimeType !== "sandboxed-html" ||
      meta.analysisVersion !== normalization.analysis.analysisVersion ||
      meta.sandboxPolicyVersion !== HTML_SANDBOX_POLICY_VERSION ||
      meta.normalizedHash !== normalization.analysis.sourceHash
    ) {
      throw new ReferenceProjectionError(
        "REFERENCE_SANDBOX_INVALID",
        "源 sandbox 页面安全校验失败",
        422,
      );
    }
    fs.writeFileSync(
      path.join(dirs.privateDir, "sandbox.html"),
      files.sandboxHtml,
      "utf8",
    );
    fs.writeFileSync(
      path.join(dirs.privateDir, "html-import.meta.json"),
      files.htmlImportMeta,
      "utf8",
    );
    page = {
      ...base,
      sandboxExecutionPath: `/api/projects/${encodeURIComponent(input.targetProjectId)}/published-reference-execution/${encodeURIComponent(input.grantId)}?materialization=${encodeURIComponent(materializationId)}`,
      htmlImportMeta: meta,
      sandboxRendererVersion: 1,
      compiledJsPath: undefined,
      prototypeHtml: undefined,
      sketchScene: undefined,
    };
  }
  fs.writeFileSync(dirs.pageFile, JSON.stringify(page, null, 2), "utf8");
  return { page, materializationId };
}

export function resolvePublishedReference(input: {
  targetProjectId: string;
  grantId: string;
  publishedVersion: string;
}): PublishedDemoPage {
  const project = publishedProject(
    input.targetProjectId,
    input.publishedVersion,
  );
  const targetPage = targetReferencePage(project, input.grantId);
  const store = new PageTransferStore({ dataDir: DATA_DIR });
  try {
    const grant = store.getGrant(input.grantId);
    if (
      !grant ||
      grant.status !== "active" ||
      grant.targetProjectId !== input.targetProjectId ||
      grant.targetPageId !== targetPage.id
    ) {
      throw new ReferenceProjectionError(
        "REFERENCE_NOT_ACTIVE",
        "引用授权已撤销或失效",
        403,
      );
    }
    if (!projectExists(grant.sourceProjectId)) {
      store.markGrantSourceDeleted(grant.id);
      store.upsertHead({
        grantId: grant.id,
        sourcePageVersionId: "deleted",
        sourceContentHash: "deleted",
        status: "invalid",
        errorCode: "SOURCE_DELETED",
      });
      throw new ReferenceProjectionError("SOURCE_DELETED", "源项目已删除", 410);
    }
    const sourceWorkspacePath = path.join(
      getProjectPath(grant.sourceProjectId),
      "workspace",
    );
    const sourcePage = listDemoPages(sourceWorkspacePath).find(
      (page) => page.id === grant.sourcePageId,
    );
    if (!sourcePage || sourcePage.reference) {
      store.markGrantSourceDeleted(grant.id);
      store.upsertHead({
        grantId: grant.id,
        sourcePageVersionId: "deleted",
        sourceContentHash: "deleted",
        status: "invalid",
        errorCode: "SOURCE_DELETED",
      });
      throw new ReferenceProjectionError("SOURCE_DELETED", "源页面已删除", 410);
    }
    try {
      const pagePackage = buildGrantedPagePackage(grant);
      const packageText = new Map(
        pagePackage.resources.flatMap((resource) =>
          typeof resource.content === "string"
            ? [[resource.path, resource.content] as const]
            : [],
        ),
      );
      const built = buildMaterialization({
        targetProjectId: input.targetProjectId,
        targetPage,
        grantId: grant.id,
        sourcePage,
        sourceWorkspacePath,
        projectConfigSchema: packageText.get("project.config.schema.json"),
        projectConfigValues: packageText.get("project.config.values.json"),
      });
      store.upsertHead({
        grantId: grant.id,
        sourcePageVersionId: built.materializationId,
        sourceContentHash: built.materializationId,
        status: "ready",
        materializationId: built.materializationId,
        lastKnownGoodMaterializationId: built.materializationId,
      });
      return built.page;
    } catch (error) {
      const previous = store.getHead(grant.id);
      store.upsertHead({
        grantId: grant.id,
        sourcePageVersionId: previous?.sourcePageVersionId ?? "failed",
        sourceContentHash: previous?.sourceContentHash ?? "failed",
        status: "failed",
        materializationId: previous?.materializationId,
        lastKnownGoodMaterializationId:
          previous?.lastKnownGoodMaterializationId,
        errorCode:
          error instanceof ReferenceProjectionError
            ? error.code
            : "REFERENCE_BUILD_FAILED",
      });
      if (previous?.lastKnownGoodMaterializationId)
        return loadMaterializedPage(
          input.targetProjectId,
          grant.id,
          previous.lastKnownGoodMaterializationId,
        );
      throw error;
    }
  } finally {
    store.close();
  }
}

export function issuePublishedReferenceExecution(input: {
  targetProjectId: string;
  grantId: string;
  materializationId: string;
  requestOrigin: string;
}) {
  const store = new PageTransferStore({ dataDir: DATA_DIR });
  try {
    const grant = store.getGrant(input.grantId);
    const head = store.getHead(input.grantId);
    if (
      !grant ||
      grant.status !== "active" ||
      grant.targetProjectId !== input.targetProjectId ||
      !head?.lastKnownGoodMaterializationId ||
      head.lastKnownGoodMaterializationId !== input.materializationId
    ) {
      throw new ReferenceProjectionError(
        "REFERENCE_NOT_ACTIVE",
        "引用授权或产物已失效",
        403,
      );
    }
    const htmlPath = path.join(
      materializationPaths(
        input.targetProjectId,
        input.grantId,
        input.materializationId,
      ).privateDir,
      "sandbox.html",
    );
    if (!fs.existsSync(htmlPath))
      throw new ReferenceProjectionError(
        "REFERENCE_SANDBOX_MISSING",
        "引用 sandbox 产物缺失",
        404,
      );
    const publicOrigin = resolveHtmlSandboxPublicOrigin(input.requestOrigin);
    if (!publicOrigin)
      throw new ReferenceProjectionError(
        "HTML_SANDBOX_ORIGIN_MISSING",
        "HTML sandbox 独立 origin 未配置",
        503,
      );
    const execution = createHtmlSandboxExecution(
      fs.readFileSync(htmlPath, "utf8"),
      Date.now(),
      {
        projectId: input.targetProjectId,
        pageId: grant.targetPageId,
        workspaceId: `published-reference:${input.grantId}`,
      },
    );
    return {
      executionUrl: `${publicOrigin}/api/html-sandbox/executions/${execution.executionId}`,
      channelId: execution.channelId,
      expiresAt: execution.expiresAt,
      sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION,
    };
  } finally {
    store.close();
  }
}
