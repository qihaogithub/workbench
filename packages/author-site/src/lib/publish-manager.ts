import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import { execFile } from "child_process";
import { compileCode } from "@/lib/compiler";
import {
  readProjectMeta,
  writeProjectMeta,
  createProjectVersionSnapshot,
  listDemoPages,
  getDemoDirPath,
  getProjectConfigSchema,
  getProjectConfigValues,
  getProjectPath,
  projectExists,
  getDataDir,
  readAppGraph,
} from "@/lib/fs-utils";
import { type PreviewSize, extractPreviewSize } from "@/lib/preview-size";
import { extractSchemaDefaults } from "@/lib/schema-defaults";
import { readCanvasStateFromWorkspace } from "@/lib/canvas-layout-file";
import type {
  Project,
  DemoPageMeta,
  DemoPageRuntimeType,
  DemoFolderMeta,
  AppGraph,
  KnowledgeIndexItem,
  HtmlImportMeta,
  PagePresentationProfile,
  VisibilityRulesDocument,
} from "@workbench/shared";
import {
  resolvePagePresentation,
  parseVisibilityRules,
  resolveVisibility,
  validateVisibilityRules,
} from "@workbench/shared";
import { getPageRuntimeCapabilities } from "@workbench/shared/page-runtime-capabilities";
import {
  HTML_IMPORT_ANALYSIS_VERSION,
  normalizeHtmlImport,
  ProjectAdminService,
} from "@workbench/project-core";
import type { CanvasState } from "@workbench/demo-ui";
import { findVisibilityDeadLinks } from "@/lib/visibility-quality";
import { generateIframeHtml } from "@workbench/demo-ui/iframe-template";
import { getCdnBaseUrl } from "@/lib/cdn-config";
import {
  PREVIEW_RUNTIME_MANIFEST_VERSION,
  shouldUsePreviewRuntimeCdn,
} from "@/lib/preview-runtime-manifest";
import {
  processImagesForPublish,
  type ImageLocalizationOptions,
} from "@/lib/publish/image-processor";
import { processVideosForPublish } from "@/lib/publish/video-processor";
import { processSpineAssetsForPublish } from "@/lib/publish/spine-processor";
import { replacePathsInContent } from "@/lib/publish/path-replacer";
import type { PublishContext } from "@/lib/publish/types";
import type { DesignSpecMeta } from "@/lib/design-specs";
import {
  buildPublishedMarkdownReferenceSnapshot,
  sanitizePublishedDesignSpecFiles,
  sanitizePublishedMarkdown,
  type PublishedMarkdownReferenceSnapshot,
} from "@/lib/publish-markdown-references";

const PUBLISHED_DIR = path.join(getDataDir(), "published");
const SCREENSHOTS_DIR = path.join(getDataDir(), "screenshots");
/** sandbox 源码发布到服务端私有目录；绝不位于 /data 静态公开目录。 */
const PUBLISHED_SANDBOX_DIR = path.join(getDataDir(), "html-sandbox-published");
const SANDBOX_RENDERER_VERSION = 1;

/** 读取工作区知识库 manifest，返回可直接发布的元数据 */
export function readKnowledgeManifestForPublish(
  workspacePath: string,
): KnowledgeIndexItem[] | undefined {
  const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (!Array.isArray(manifest.items)) return undefined;
    return manifest.items as KnowledgeIndexItem[];
  } catch {
    return undefined;
  }
}

/** 将工作区知识库目录整体复制到发布目录，返回 manifest 元数据 */
function copyKnowledgeForPublish(
  workspacePath: string,
  publishedProjectDir: string,
): KnowledgeIndexItem[] | undefined {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  if (!fs.existsSync(knowledgeDir)) return undefined;
  const items = readKnowledgeManifestForPublish(workspacePath);
  if (!items) return undefined;
  fs.cpSync(
    knowledgeDir,
    path.join(publishedProjectDir, "knowledge"),
    { recursive: true },
  );
  return items;
}

/** 将可公开浏览的设计规范连同目录索引复制到发布目录。 */
function copyDesignSpecsForPublish(
  workspacePath: string,
  publishedProjectDir: string,
): DesignSpecMeta[] | undefined {
  const designSpecDir = path.join(workspacePath, "design-spec");
  const manifestPath = path.join(designSpecDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      items?: DesignSpecMeta[];
    };
    if (!Array.isArray(manifest.items)) return undefined;
    fs.cpSync(designSpecDir, path.join(publishedProjectDir, "design-spec"), {
      recursive: true,
    });
    return manifest.items;
  } catch {
    return undefined;
  }
}

function resolvePublishThumbnailSource(thumbnail: string): string | undefined {
  const candidates: string[] = [];
  const normalized = thumbnail.replace(/^\/+/, "");

  if (path.isAbsolute(thumbnail)) {
    candidates.push(thumbnail);
  }

  candidates.push(path.join(process.cwd(), "public", normalized));

  if (normalized.startsWith("data/")) {
    candidates.push(path.join(process.cwd(), normalized));
    candidates.push(path.join(getDataDir(), normalized.slice("data/".length)));
  } else {
    candidates.push(path.join(getDataDir(), normalized));
  }

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export interface PublishedDemoPage {
  id: string;
  name: string;
  routeKey?: string;
  order: number;
  parentId: string | null;
  /** 页面显式声明的可联动区域 ID，仅用于发布快照校验与只读解析。 */
  regionIds?: string[];
  runtimeType?: DemoPageRuntimeType;
  compiledJsPath?: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
  presentation?: PagePresentationProfile;
  screenshotPath?: string;
  iframeHtmlPath?: string;
  embedCode?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  prototypeHtmlPath?: string;
  prototypeCssPath?: string;
  prototypeMetaPath?: string;
  sketchScene?: Record<string, unknown>;
  sketchMeta?: Record<string, unknown>;
  sketchScenePath?: string;
  sketchMetaPath?: string;
  requirements?: string;
  /** sandbox 仅发布受控 issuance 路径和策略摘要，不包含源码或短时 ticket。 */
  sandboxExecutionPath?: string;
  htmlImportMeta?: HtmlImportMeta;
  sandboxRendererVersion?: number;
}

interface ScreenshotMeta {
  currentHash?: string;
  variants?: Record<
    string,
    {
      variant?: "strict" | "fast";
      generatedAt?: string;
    }
  >;
}

export interface PublishedProject {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  publishedVersion: string;
  commitId?: string;
  publishedAt: number;
  demoPages: PublishedDemoPage[];
  demoFolders: DemoFolderMeta[];
  appGraph?: AppGraph;
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  visibilityRules?: VisibilityRulesDocument;
  visibilityRulesHash?: string;
  canvasState?: CanvasState;
  knowledge?: KnowledgeIndexItem[];
  designSpecs?: DesignSpecMeta[];
  /** 由本次不可变发布快照派生的只读引用目录和精简边索引。 */
  markdownReferences?: PublishedMarkdownReferenceSnapshot;
  previewRuntime?: {
    version: string;
    source: "local" | "cdn";
    basePath?: string;
  };
}

export type { PublishedMarkdownReferenceSnapshot } from "@/lib/publish-markdown-references";

export interface ProjectsIndex {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    publishedAt: number;
    publishedVersion: string;
    demoCount: number;
  }>;
  generatedAt: number;
}

export interface PublishResult {
  projectId: string;
  publishedVersion: string;
  commitId?: string;
  publishedAt: number;
  demoCount: number;
  duration: number;
  cloudflareSync?: CloudflareSyncResult;
}

export interface CloudflareSyncResult {
  success: boolean;
  message: string;
}

/** 发布失败时抛出的结构化错误，details 会透传到 API 响应供 CLI 呈现 */
export class PublishError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "NO_CONTENT_TO_PUBLISH"
      | "SNAPSHOT_CREATE_ERROR"
      | "IMAGE_LOCALIZATION_FAILED"
      | "VIDEO_LOCALIZATION_FAILED"
      | "PUBLISH_COMPILE_FAILED"
      | "PUBLISH_RUNTIME_UNSUPPORTED"
      | "VISIBILITY_RULES_INVALID"
      | "SANDBOX_ORIGIN_NOT_CONFIGURED"
      | "SANDBOX_MANIFEST_INVALID",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export interface PublishPageCompileIssue {
  pageId: string;
  name: string;
  message: string;
}

export interface PublishDryRunReport {
  dryRun: true;
  projectId: string;
  summary: {
    totalPages: number;
    compiledPages: number;
    totalImages: number;
    localizedImages: number;
    failedImages: number;
    skippedImages: number;
  };
  pages: Array<{
    pageId: string;
    name: string;
    runtimeType?: DemoPageRuntimeType;
    compile: { passed: boolean; message?: string };
  }>;
  images: Array<{
    url: string;
    kind: "external" | "local";
    success: boolean;
    skipped?: boolean;
    reason?: string;
  }>;
  visibility?: {
    valid: boolean;
    issues: Array<{ code: string; message: string; ruleId?: string; pageId?: string; regionId?: string }>;
    deadLinks?: Array<{ source: string; sourcePageId?: string; targetPageId: string; message: string }>;
  };
  duration: number;
}

export interface PublishOptions {
  onProgress?: (percent: number, message: string) => void;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  /** 干跑：走完整发布管线但不写入正式目录、不建快照/commit、不更新项目 meta */
  dryRun?: boolean;
  imageOptions?: ImageLocalizationOptions;
}

export function getPublishedDir(): string {
  return PUBLISHED_DIR;
}

function getViewerBaseUrl(): string {
  return process.env.VIEWER_CLOUDFLARE_URL || process.env.VIEWER_LAN_URL || "";
}

function resolvePublishedSandboxOrigin(): string | null {
  const configured = process.env.HTML_SANDBOX_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

function readSandboxImportMeta(metaPath: string): HtmlImportMeta {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    throw new PublishError("SANDBOX_MANIFEST_INVALID", "sandbox HTML 的导入元数据不可读");
  }
  if (!value || typeof value !== "object") {
    throw new PublishError("SANDBOX_MANIFEST_INVALID", "sandbox HTML 的导入元数据无效");
  }
  const meta = value as Partial<HtmlImportMeta>;
  if (meta.source !== "html-import") {
    throw new PublishError("SANDBOX_MANIFEST_INVALID", "sandbox HTML 的来源元数据无效");
  }
  if (
    typeof meta.analysisVersion !== "number" ||
    typeof meta.sandboxPolicyVersion !== "number" ||
    typeof meta.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(meta.sourceHash) ||
    typeof meta.normalizedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(meta.normalizedHash)
  ) {
    throw new PublishError("SANDBOX_MANIFEST_INVALID", "sandbox HTML 的策略或哈希元数据无效");
  }
  return meta as HtmlImportMeta;
}

interface PendingPublishedSandbox {
  pageId: string;
  sourceKey: string;
  html: string;
  htmlImportMeta: HtmlImportMeta;
}

function writePrivateSandboxPublication(
  projectId: string,
  version: string,
  pages: PendingPublishedSandbox[],
): { finalDir: string; temporaryDir: string } | undefined {
  if (pages.length === 0) return undefined;
  const temporaryDir = path.join(
    PUBLISHED_SANDBOX_DIR,
    ".tmp",
    `${projectId}-${version}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`,
  );
  const finalDir = path.join(PUBLISHED_SANDBOX_DIR, projectId, version);
  fs.mkdirSync(temporaryDir, { recursive: true, mode: 0o700 });
  const manifest: Record<string, unknown> = {
    version: 1,
    projectId,
    publishedVersion: version,
    pages: {},
  };
  for (const page of pages) {
    const fileName = `${page.sourceKey}.html`;
    fs.writeFileSync(path.join(temporaryDir, fileName), page.html, {
      encoding: "utf-8",
      mode: 0o600,
    });
    (manifest.pages as Record<string, unknown>)[page.pageId] = {
      sourceKey: page.sourceKey,
      fileName,
      htmlImportMeta: page.htmlImportMeta,
    };
  }
  fs.writeFileSync(
    path.join(temporaryDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf-8", mode: 0o600 },
  );
  return { finalDir, temporaryDir };
}

function copyPreviewRuntimeForPublish(
  projectId: string,
  publishDir: string,
): string | undefined {
  const runtimeSourceDir = path.join(
    process.cwd(),
    "public",
    "preview-runtime",
  );
  if (!fs.existsSync(runtimeSourceDir)) {
    return undefined;
  }

  const runtimeBasePath = `/data/${projectId}/preview-runtime`;
  fs.cpSync(runtimeSourceDir, path.join(publishDir, "preview-runtime"), {
    recursive: true,
    force: true,
  });
  return runtimeBasePath;
}

function replaceConfigValueAssetUrls(
  value: unknown,
  urlMap: Map<string, string>,
): unknown {
  if (typeof value === "string") {
    return urlMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceConfigValueAssetUrls(item, urlMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceConfigValueAssetUrls(item, urlMap),
      ]),
    );
  }
  return value;
}

function normalizePublishedConfigValues(
  values: Record<string, unknown> | undefined,
  urlMap: Map<string, string>,
): Record<string, unknown> {
  if (!values) return {};
  return replaceConfigValueAssetUrls(values, urlMap) as Record<string, unknown>;
}

function collectDeclaredRegionIds(
  workspacePath: string,
  page: DemoPageMeta,
): string[] {
  const pageDir = getDemoDirPath(workspacePath, page.id);
  const candidates = [
    path.join(pageDir, "index.tsx"),
    path.join(pageDir, "prototype.html"),
    path.join(pageDir, "sandbox.html"),
  ];
  const ids = new Set<string>();
  // Region ids are an explicit source/runtime declaration.  We intentionally
  // do not infer targets from DOM text or CSS selectors.
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const match of content.matchAll(/data-region-id\s*=\s*["']([A-Za-z0-9_-]{1,100})["']/g)) {
      if (match[1]) ids.add(match[1]);
    }
    for (const match of content.matchAll(/regionId\s*[:=]\s*["']([A-Za-z0-9_-]{1,100})["']/g)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return [...ids];
}

export function readVisibilityRulesForPublish(
  workspacePath: string,
): VisibilityRulesDocument | undefined {
  const rulesPath = path.join(workspacePath, "project.visibility-rules.json");
  if (!fs.existsSync(rulesPath)) return undefined;
  const parsed = parseVisibilityRules(fs.readFileSync(rulesPath, "utf-8"));
  return parsed;
}

function normalizeScreenshotHash(hash?: string | null): string | null {
  if (!hash) return null;
  return /^[a-f0-9]{16}$/i.test(hash) ? hash.toLowerCase() : null;
}

function readScreenshotMeta(
  projectId: string,
  pageId: string,
): ScreenshotMeta | null {
  const metaPath = path.join(SCREENSHOTS_DIR, projectId, `${pageId}.meta.json`);
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ScreenshotMeta;
  } catch {
    return null;
  }
}

function resolveCurrentScreenshotPath(
  projectId: string,
  pageId: string,
): string | undefined {
  const projectScreenshotsDir = path.join(SCREENSHOTS_DIR, projectId);
  if (!fs.existsSync(projectScreenshotsDir)) return undefined;

  const meta = readScreenshotMeta(projectId, pageId);
  const currentHash = normalizeScreenshotHash(meta?.currentHash);
  if (currentHash) {
    const strictPath = path.join(
      projectScreenshotsDir,
      `${pageId}.${currentHash}.png`,
    );
    if (fs.existsSync(strictPath)) return strictPath;
  }

  const latestVariant = Object.entries(meta?.variants ?? {})
    .map(([key, value]) => {
      const [hash, variant = "strict"] = key.split(":");
      return {
        hash: normalizeScreenshotHash(hash),
        variant: variant === "fast" ? ("fast" as const) : ("strict" as const),
        generatedAt: value.generatedAt ?? "",
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        hash: string;
        variant: "strict" | "fast";
        generatedAt: string;
      } => Boolean(entry.hash),
    )
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];

  if (latestVariant) {
    const variantPath = path.join(
      projectScreenshotsDir,
      latestVariant.variant === "fast"
        ? `${pageId}.${latestVariant.hash}.fast.png`
        : `${pageId}.${latestVariant.hash}.png`,
    );
    if (fs.existsSync(variantPath)) return variantPath;
  }

  const legacyPath = path.join(projectScreenshotsDir, `${pageId}.png`);
  return fs.existsSync(legacyPath) ? legacyPath : undefined;
}

function copyPageScreenshotForPublish(
  projectId: string,
  pageId: string,
  publishDir: string,
): string | undefined {
  const sourcePath = resolveCurrentScreenshotPath(projectId, pageId);
  if (!sourcePath) return undefined;

  const screenshotsDir = path.join(publishDir, "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(screenshotsDir, `${pageId}.png`));
  return `screenshots/${pageId}.png`;
}

export async function publishProject(
  projectId: string,
  options?: PublishOptions & { dryRun?: false },
): Promise<PublishResult>;
export async function publishProject(
  projectId: string,
  options: PublishOptions & { dryRun: true },
): Promise<PublishDryRunReport>;
export async function publishProject(
  projectId: string,
  options?: PublishOptions,
): Promise<PublishResult | PublishDryRunReport>;
export async function publishProject(
  projectId: string,
  options?: PublishOptions,
): Promise<PublishResult | PublishDryRunReport> {
  const startTime = Date.now();
  const onProgress = options?.onProgress;
  const dryRun = options?.dryRun === true;
  const assetCacheBustParam = `v=${encodeURIComponent(String(startTime))}`;

  if (!projectExists(projectId)) {
    throw new PublishError("PROJECT_NOT_FOUND", "项目不存在");
  }

  let project = readProjectMeta(projectId);
  if (!project) {
    throw new PublishError("PROJECT_NOT_FOUND", "项目不存在");
  }

  const workspacePath = path.join(getProjectPath(projectId), "workspace");
  const demoPages = listDemoPages(workspacePath);

  if (demoPages.length === 0) {
    throw new PublishError("NO_CONTENT_TO_PUBLISH", "项目没有可发布的Demo页面");
  }

  const rawProjectConfigSchema = getProjectConfigSchema(workspacePath);
  const visibilityRulesPath = path.join(workspacePath, "project.visibility-rules.json");
  const visibilityRules = readVisibilityRulesForPublish(workspacePath);
  const visibilityValidation = fs.existsSync(visibilityRulesPath) && !visibilityRules
    ? {
        valid: false,
        issues: [{
          code: "DOCUMENT_INVALID" as const,
          message: "project.visibility-rules.json 格式无效",
        }],
      }
    : visibilityRules
    ? validateVisibilityRules(visibilityRules, {
        pageIds: demoPages.map((page) => page.id),
        projectSchema: rawProjectConfigSchema,
        pageSchemas: Object.fromEntries(
          demoPages.flatMap((page) => {
            const schemaPath = path.join(getDemoDirPath(workspacePath, page.id), "config.schema.json");
            return fs.existsSync(schemaPath)
              ? [[page.id, fs.readFileSync(schemaPath, "utf-8")]]
              : [];
          }),
        ),
        regionIds: Object.fromEntries(
          demoPages.map((page) => [page.id, collectDeclaredRegionIds(workspacePath, page)]),
        ),
      })
    : undefined;
  let visibilityDeadLinks: ReturnType<typeof findVisibilityDeadLinks> = [];
  if (visibilityValidation && !visibilityValidation.valid && !dryRun) {
    throw new PublishError(
      "VISIBILITY_RULES_INVALID",
      "发布失败：页面联动规则未通过校验",
      { issues: visibilityValidation.issues },
    );
  }

  const finalPublishedProjectDir = path.join(PUBLISHED_DIR, projectId);
  const publishedProjectDir = path.join(
    PUBLISHED_DIR,
    ".tmp",
    `${projectId}-${Date.now()}`,
  );

  let urlMap = new Map<string, string>();

  fs.rmSync(publishedProjectDir, { recursive: true, force: true });
  fs.mkdirSync(publishedProjectDir, { recursive: true });
  fs.mkdirSync(path.join(publishedProjectDir, "demos"), { recursive: true });

  const cleanupTmpDir = () => {
    fs.rmSync(publishedProjectDir, { recursive: true, force: true });
  };

  onProgress?.(0, "正在处理图片资源...");
  const publishContext: PublishContext = {
    projectId,
    workspacePath,
    publishDir: publishedProjectDir,
    onProgress: (percent, _total, message) => {
      onProgress?.(percent, message);
    },
  };
  const imageResult = await processImagesForPublish(
    publishContext,
    options?.imageOptions,
  );
  urlMap = imageResult.urlMap;
  if (!imageResult.success && !dryRun) {
    cleanupTmpDir();
    throw new PublishError(
      "IMAGE_LOCALIZATION_FAILED",
      `发布失败：${imageResult.errors.length} 个本地图片资源不可用`,
      {
        images: imageResult.errors.map((item) => ({
          url: item.localPath,
          reason: item.error || "UNKNOWN",
        })),
      },
    );
  }
  const videoResult = processVideosForPublish(publishContext);
  for (const [source, target] of videoResult.urlMap) urlMap.set(source, target);
  if (videoResult.errors.length > 0 && !dryRun) {
    cleanupTmpDir();
    throw new PublishError(
      "VIDEO_LOCALIZATION_FAILED",
      `发布失败：${videoResult.errors.length} 个视频资源不可用`,
      { videos: videoResult.errors },
    );
  }
  const spineResult = processSpineAssetsForPublish(publishContext);
  if (spineResult.errors.length > 0 && !dryRun) {
    cleanupTmpDir();
    throw new PublishError("VIDEO_LOCALIZATION_FAILED", `发布失败：${spineResult.errors.length} 个 Spine 素材不可用`, { spine: spineResult.errors });
  }

  onProgress?.(10, "正在编译页面...");

  const publishedDemoPages: PublishedDemoPage[] = [];
  const compileIssues: PublishPageCompileIssue[] = [];
  const dryRunPages: PublishDryRunReport["pages"] = [];
  const pendingSandboxPages: PendingPublishedSandbox[] = [];

  const hasSandboxPage = demoPages.some(
    (page) => page.runtimeType === "sandboxed-html",
  );
  if (hasSandboxPage && !dryRun && !resolvePublishedSandboxOrigin()) {
    cleanupTmpDir();
    throw new PublishError(
      "SANDBOX_ORIGIN_NOT_CONFIGURED",
      "发布 sandbox HTML 前必须配置独立的 HTML_SANDBOX_PUBLIC_ORIGIN",
    );
  }

  const projectConfigSchema =
    rawProjectConfigSchema && urlMap.size > 0
      ? replacePathsInContent(
          rawProjectConfigSchema,
          urlMap,
          path.join(workspacePath, "project.config.schema.json"),
        )
      : rawProjectConfigSchema;
  const projectConfigDefaults = projectConfigSchema
    ? extractSchemaDefaults(projectConfigSchema)
    : {};
  const projectConfigValues = normalizePublishedConfigValues(
    getProjectConfigValues(workspacePath),
    urlMap,
  );
  const canvasState = readCanvasStateFromWorkspace(workspacePath);
  const appGraph = readAppGraph(workspacePath);
  if (visibilityRules && visibilityValidation?.valid) {
    const resolution = resolveVisibility({
      rules: visibilityRules,
      projectSchema: rawProjectConfigSchema ?? undefined,
      projectConfigValues,
      pageIds: demoPages.map((page) => page.id),
      regionIds: Object.fromEntries(
        demoPages.map((page) => [page.id, collectDeclaredRegionIds(workspacePath, page)]),
      ),
    });
    visibilityDeadLinks = findVisibilityDeadLinks({
      hiddenPageIds: Object.values(resolution.pages)
        .filter((page) => page.hidden)
        .map((page) => page.pageId),
      pageIds: demoPages.map((page) => page.id),
      canvasState,
      appGraph,
    });
    if (visibilityDeadLinks.length > 0 && !dryRun) {
      cleanupTmpDir();
      throw new PublishError(
        "VISIBILITY_RULES_INVALID",
        "发布失败：隐藏页面仍被导航或应用动作引用",
        { issues: visibilityDeadLinks },
      );
    }
  }
  const knowledge = copyKnowledgeForPublish(workspacePath, publishedProjectDir);
  const designSpecs = copyDesignSpecsForPublish(workspacePath, publishedProjectDir);

  const viewerBaseUrl = getViewerBaseUrl();
  const totalPages = demoPages.length;
  const useCdnRuntime = shouldUsePreviewRuntimeCdn();
  const publishedRuntimeBasePath = useCdnRuntime
    ? undefined
    : copyPreviewRuntimeForPublish(projectId, publishedProjectDir);
  const compileRuntimeOptions = {
    baseUrl: publishedRuntimeBasePath,
    preferCdn: useCdnRuntime,
  };

  for (let i = 0; i < demoPages.length; i++) {
    const page = demoPages[i];
    const demoDir = getDemoDirPath(workspacePath, page.id);
    const codePath = path.join(demoDir, "index.tsx");
    const schemaPath = path.join(demoDir, "config.schema.json");
    const prototypeHtmlPath = path.join(demoDir, "prototype.html");
    const prototypeCssPath = path.join(demoDir, "prototype.css");
    const prototypeMetaPath = path.join(demoDir, "prototype.meta.json");
    const sketchScenePath = path.join(demoDir, "sketch.scene.json");
    const sketchMetaPath = path.join(demoDir, "sketch.meta.json");
    const requirementsPath = path.join(demoDir, "requirements.md");
    const runtimeType = page.runtimeType;
    const regionIds = collectDeclaredRegionIds(workspacePath, page);

    try {
      getPageRuntimeCapabilities(runtimeType);
    } catch {
      cleanupTmpDir();
      throw new PublishError(
        "PUBLISH_RUNTIME_UNSUPPORTED",
        `页面 ${page.id} 使用了未知运行时，发布已拒绝`,
      );
    }

    const demoPublishDir = path.join(publishedProjectDir, "demos", page.id);
    fs.mkdirSync(demoPublishDir, { recursive: true });
    const screenshotPath = copyPageScreenshotForPublish(
      projectId,
      page.id,
      publishedProjectDir,
    );

    let previewSize: PreviewSize | undefined;
    let presentation: PagePresentationProfile | undefined;
    const requirements = fs.existsSync(requirementsPath)
      ? fs.readFileSync(requirementsPath, "utf-8")
      : undefined;
    let pageConfigData: Record<string, unknown> = {};
    let schemaPublishPath: string | undefined;
    if (fs.existsSync(schemaPath)) {
      const rawSchemaContent = fs.readFileSync(schemaPath, "utf-8");
      const schemaContent =
        urlMap.size > 0
          ? replacePathsInContent(rawSchemaContent, urlMap, schemaPath)
          : rawSchemaContent;
      fs.writeFileSync(path.join(demoPublishDir, "schema.json"), schemaContent);
      previewSize = extractPreviewSize(schemaContent);
      presentation = resolvePagePresentation(schemaContent);
      pageConfigData = extractSchemaDefaults(schemaContent);
      schemaPublishPath = `demos/${page.id}/schema.json`;
    }

    if (runtimeType === "prototype-html-css") {
      if (!fs.existsSync(prototypeHtmlPath)) continue;
      const prototypeHtml =
        urlMap.size > 0
          ? replacePathsInContent(
              fs.readFileSync(prototypeHtmlPath, "utf-8"),
              urlMap,
              prototypeHtmlPath,
            )
          : fs.readFileSync(prototypeHtmlPath, "utf-8");
      const prototypeCss = fs.existsSync(prototypeCssPath)
        ? urlMap.size > 0
          ? replacePathsInContent(
              fs.readFileSync(prototypeCssPath, "utf-8"),
              urlMap,
              prototypeCssPath,
            )
          : fs.readFileSync(prototypeCssPath, "utf-8")
        : "";
      fs.writeFileSync(
        path.join(demoPublishDir, "prototype.html"),
        prototypeHtml,
        "utf-8",
      );
      fs.writeFileSync(
        path.join(demoPublishDir, "prototype.css"),
        prototypeCss,
        "utf-8",
      );
      let prototypeMeta: Record<string, unknown> | undefined;
      if (fs.existsSync(prototypeMetaPath)) {
        const metaContent = fs.readFileSync(prototypeMetaPath, "utf-8");
        fs.writeFileSync(
          path.join(demoPublishDir, "prototype.meta.json"),
          metaContent,
          "utf-8",
        );
        try {
          prototypeMeta = JSON.parse(metaContent) as Record<string, unknown>;
        } catch {
          prototypeMeta = undefined;
        }
      }

      publishedDemoPages.push({
        id: page.id,
        name: page.name,
        routeKey: page.routeKey,
        order: page.order,
        parentId: page.parentId,
        regionIds,
        runtimeType,
        schemaPath: schemaPublishPath,
        requirements,
        previewSize,
        presentation,
        screenshotPath,
        prototypeHtml,
        prototypeCss,
        prototypeMeta,
        prototypeHtmlPath: `demos/${page.id}/prototype.html`,
        prototypeCssPath: `demos/${page.id}/prototype.css`,
        prototypeMetaPath: prototypeMeta
          ? `demos/${page.id}/prototype.meta.json`
          : undefined,
      });
      dryRunPages.push({
        pageId: page.id,
        name: page.name,
        runtimeType,
        compile: { passed: true },
      });

      const pagePercent =
        10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
      onProgress?.(pagePercent, `发布原型页 ${i + 1}/${totalPages}...`);
      continue;
    }

    if (runtimeType === "sketch-scene") {
      if (!fs.existsSync(sketchScenePath)) continue;
      const sceneContent = fs.readFileSync(sketchScenePath, "utf-8");
      fs.writeFileSync(
        path.join(demoPublishDir, "sketch.scene.json"),
        sceneContent,
        "utf-8",
      );
      let sketchScene: Record<string, unknown> | undefined;
      let sketchMeta: Record<string, unknown> | undefined;
      try {
        sketchScene = JSON.parse(sceneContent) as Record<string, unknown>;
      } catch {
        sketchScene = undefined;
      }
      if (fs.existsSync(sketchMetaPath)) {
        const metaContent = fs.readFileSync(sketchMetaPath, "utf-8");
        fs.writeFileSync(
          path.join(demoPublishDir, "sketch.meta.json"),
          metaContent,
          "utf-8",
        );
        try {
          sketchMeta = JSON.parse(metaContent) as Record<string, unknown>;
        } catch {
          sketchMeta = undefined;
        }
      }

      publishedDemoPages.push({
        id: page.id,
        name: page.name,
        routeKey: page.routeKey,
        order: page.order,
        parentId: page.parentId,
        regionIds,
        runtimeType,
        schemaPath: schemaPublishPath,
        requirements,
        previewSize,
        presentation,
        screenshotPath,
        sketchScene,
        sketchMeta,
        sketchScenePath: `demos/${page.id}/sketch.scene.json`,
        sketchMetaPath: sketchMeta
          ? `demos/${page.id}/sketch.meta.json`
          : undefined,
      });
      dryRunPages.push({
        pageId: page.id,
        name: page.name,
        runtimeType,
        compile: { passed: true },
      });

      const pagePercent =
        10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
      onProgress?.(pagePercent, `发布手绘页面 ${i + 1}/${totalPages}...`);
      continue;
    }

    if (runtimeType === "sandboxed-html") {
      const sandboxHtmlPath = path.join(demoDir, "sandbox.html");
      const htmlImportMetaPath = path.join(demoDir, "html-import.meta.json");
      if (!fs.existsSync(sandboxHtmlPath)) {
        cleanupTmpDir();
        throw new PublishError("SANDBOX_MANIFEST_INVALID", `页面 ${page.id} 缺少 sandbox.html`);
      }
      const html = fs.readFileSync(sandboxHtmlPath, "utf-8");
      const htmlImportMeta = readSandboxImportMeta(htmlImportMetaPath);
      const normalization = normalizeHtmlImport(html);
      if (
        normalization.analysis.outcome.status !== "accepted" ||
        normalization.analysis.outcome.runtimeType !== "sandboxed-html" ||
        htmlImportMeta.analysisVersion !== normalization.analysis.analysisVersion ||
        htmlImportMeta.analysisVersion !== HTML_IMPORT_ANALYSIS_VERSION ||
        htmlImportMeta.sandboxPolicyVersion !== 1 ||
        htmlImportMeta.normalizedHash !== normalization.analysis.sourceHash
      ) {
        cleanupTmpDir();
        throw new PublishError(
          "SANDBOX_MANIFEST_INVALID",
          `页面 ${page.id} 的 sandbox 源码与导入安全元数据不一致`,
        );
      }
      const sourceKey = crypto.randomBytes(16).toString("hex");
      pendingSandboxPages.push({ pageId: page.id, sourceKey, html, htmlImportMeta });
      const sandboxExecutionPath = `/api/projects/${encodeURIComponent(projectId)}/published-html-execution/${encodeURIComponent(page.id)}?version=${encodeURIComponent("__PUBLISHED_VERSION__")}`;
      publishedDemoPages.push({
        id: page.id,
        name: page.name,
        routeKey: page.routeKey,
        order: page.order,
        parentId: page.parentId,
        regionIds,
        runtimeType,
        schemaPath: schemaPublishPath,
        requirements,
        previewSize,
        presentation,
        screenshotPath,
        sandboxExecutionPath,
        htmlImportMeta,
        sandboxRendererVersion: SANDBOX_RENDERER_VERSION,
      });
      dryRunPages.push({
        pageId: page.id,
        name: page.name,
        runtimeType,
        compile: { passed: true },
      });
      const pagePercent = 10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
      onProgress?.(pagePercent, `发布 sandbox 页面 ${i + 1}/${totalPages}...`);
      continue;
    }

    if (!fs.existsSync(codePath)) continue;

    const tsxSource = fs.readFileSync(codePath, "utf-8");
    let compileResult: ReturnType<typeof compileCode>;
    try {
      compileResult = compileCode(
        tsxSource,
        project.lockedDependencies,
        compileRuntimeOptions,
      );
    } catch (error) {
      // 收集所有页面的编译错误后统一抛出，避免只暴露第一个错误
      const message = error instanceof Error ? error.message : String(error);
      compileIssues.push({ pageId: page.id, name: page.name, message });
      dryRunPages.push({
        pageId: page.id,
        name: page.name,
        runtimeType,
        compile: { passed: false, message },
      });
      continue;
    }
    dryRunPages.push({
      pageId: page.id,
      name: page.name,
      runtimeType,
      compile: { passed: true },
    });

    const replacedCode =
      urlMap.size > 0
        ? replacePathsInContent(compileResult.compiledCode, urlMap, codePath)
        : compileResult.compiledCode;

    fs.writeFileSync(path.join(demoPublishDir, "compiled.js"), replacedCode);

    const mergedConfigData = replaceConfigValueAssetUrls(
      {
        ...projectConfigDefaults,
        ...pageConfigData,
        ...projectConfigValues,
      },
      urlMap,
    ) as Record<string, unknown>;

    const compiledJsPath = `demos/${page.id}/compiled.js`;
    const compiledJsUrlPath = `${compiledJsPath}?${assetCacheBustParam}`;
    const iframeHtmlPath = `demos/${page.id}/iframe.html?${assetCacheBustParam}`;
    const iframeHtml = generateIframeHtml({
      compiledCodeUrl: `/data/${projectId}/${compiledJsUrlPath}`,
      cssImports: compileResult.cssImports,
      configData: mergedConfigData,
      cdnBaseUrl: getCdnBaseUrl(),
      runtimeBaseUrl: publishedRuntimeBasePath,
      useCdnRuntime,
      spineAssetBaseUrl: `/data/${projectId}/assets/animations`,
    });
    fs.writeFileSync(path.join(demoPublishDir, "iframe.html"), iframeHtml);

    const iframeSrc = viewerBaseUrl
      ? `${viewerBaseUrl}/data/${projectId}/${iframeHtmlPath}`
      : `/data/${projectId}/${iframeHtmlPath}`;
    const embedWidth = presentation?.viewport.width ?? 1440;
    const embedHeight = presentation?.viewport.height ?? 900;
    const embedCode = `<iframe\n  src="${iframeSrc}"\n  sandbox="allow-scripts"\n  width="${embedWidth}"\n  height="${embedHeight}"\n  style="width: min(100%, ${embedWidth}px); height: ${embedHeight}px; border: none;"\n/>`;

    publishedDemoPages.push({
      id: page.id,
      name: page.name,
      routeKey: page.routeKey,
      order: page.order,
      parentId: page.parentId,
      regionIds,
      runtimeType,
      compiledJsPath,
      schemaPath: schemaPublishPath,
      requirements,
      previewSize,
      presentation,
      screenshotPath,
      iframeHtmlPath,
      embedCode,
    });

    const pagePercent =
      10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
    onProgress?.(pagePercent, `编译页面 ${i + 1}/${totalPages}...`);
  }

  if (compileIssues.length > 0 && !dryRun) {
    cleanupTmpDir();
    throw new PublishError(
      "PUBLISH_COMPILE_FAILED",
      `发布失败：${compileIssues.length} 个页面编译错误`,
      {
        pages: compileIssues.map((issue) => ({
          pageId: issue.pageId,
          name: issue.name,
          errors: [{ message: issue.message }],
        })),
      },
    );
  }

  if (dryRun) {
    const failedImages = imageResult.outcomes.filter(
      (outcome) => !outcome.success && !outcome.skipped,
    );
    const skippedImages = imageResult.outcomes.filter(
      (outcome) => outcome.skipped,
    );
    const report: PublishDryRunReport = {
      dryRun: true,
      projectId,
      summary: {
        totalPages: dryRunPages.length,
        compiledPages: dryRunPages.filter((item) => item.compile.passed).length,
        totalImages: imageResult.outcomes.length,
        localizedImages: imageResult.outcomes.filter(
          (outcome) => outcome.success,
        ).length,
        failedImages: failedImages.length,
        skippedImages: skippedImages.length,
      },
      pages: dryRunPages,
      images: imageResult.outcomes,
      visibility: visibilityValidation
        ? {
            valid: visibilityValidation.valid && visibilityDeadLinks.length === 0,
            issues: [
              ...visibilityValidation.issues,
              ...visibilityDeadLinks.map((issue) => ({ code: issue.code, message: issue.message })),
            ],
            ...(visibilityDeadLinks.length > 0 ? { deadLinks: visibilityDeadLinks } : {}),
          }
        : undefined,
      duration: Date.now() - startTime,
    };
    cleanupTmpDir();
    onProgress?.(100, "干跑完成（未写入发布产物）");
    return report;
  }

  if (publishedDemoPages.length === 0) {
    cleanupTmpDir();
    throw new PublishError("NO_CONTENT_TO_PUBLISH", "项目没有可发布的Demo页面");
  }

  if (projectConfigSchema) {
    fs.writeFileSync(
      path.join(publishedProjectDir, "config-schema.json"),
      projectConfigSchema,
    );
  }
  if (Object.keys(projectConfigValues).length > 0) {
    fs.writeFileSync(
      path.join(publishedProjectDir, "config-values.json"),
      JSON.stringify(projectConfigValues, null, 2),
    );
  }
  if (visibilityRules) {
    fs.writeFileSync(
      path.join(publishedProjectDir, "visibility-rules.json"),
      JSON.stringify(visibilityRules, null, 2) + "\n",
      "utf-8",
    );
  }

  fs.writeFileSync(
    path.join(publishedProjectDir, "app.graph.json"),
    JSON.stringify(appGraph, null, 2),
  );

  let thumbnailCopied = false;
  let thumbnailExt = "";
  if (project.thumbnail) {
    const thumbnailSrc = resolvePublishThumbnailSource(project.thumbnail);
    if (thumbnailSrc && fs.existsSync(thumbnailSrc)) {
      thumbnailExt =
        path.extname(thumbnailSrc) || path.extname(project.thumbnail);
      fs.copyFileSync(
        thumbnailSrc,
        path.join(publishedProjectDir, `thumbnail${thumbnailExt}`),
      );
      thumbnailCopied = true;
    }
  }

  const snapshotResult = createProjectVersionSnapshot(projectId, "system", {
    type: "publish_snapshot",
    sessionId: `publish-${Date.now()}`,
    note: "发布快照",
    sourceWorkspacePath: workspacePath,
    workspaceId: options?.workspaceId,
    workspaceRevision: options?.workspaceRevision,
    workspaceRootHash: options?.workspaceRootHash,
  });
  if (!snapshotResult.success || !snapshotResult.version) {
    cleanupTmpDir();
    throw new PublishError("SNAPSHOT_CREATE_ERROR", "创建发布快照失败");
  }
  project = readProjectMeta(projectId);
  if (!project) {
    cleanupTmpDir();
    throw new PublishError("PROJECT_NOT_FOUND", "项目不存在");
  }

  const currentVersion = snapshotResult.version.versionId;
  const markdownReferences = buildPublishedMarkdownReferenceSnapshot({
    projectId,
    projectName: project.name,
    publishedVersion: currentVersion,
    canonicalSnapshot: {
      versionId: currentVersion,
      workspaceId: snapshotResult.version.workspaceId,
      workspaceRevision: snapshotResult.version.workspaceRevision,
      workspaceRootHash: snapshotResult.version.workspaceRootHash,
    },
    publishedProjectDir,
    pages: publishedDemoPages,
    knowledge,
    designSpecs,
  });
  // Keep the public source text and the public edge index consistent. Any
  // unresolved/cross-project target is rendered as its label only, so IDs of
  // non-public resources cannot be recovered from the published Markdown.
  for (const page of publishedDemoPages) {
    if (typeof page.requirements === "string") {
      page.requirements = sanitizePublishedMarkdown(page.requirements, markdownReferences);
    }
  }
  for (const item of knowledge ?? []) {
    if (item.source === "system") continue;
    const filePath = path.join(publishedProjectDir, "knowledge", item.fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, sanitizePublishedMarkdown(content, markdownReferences), "utf-8");
  }
  sanitizePublishedDesignSpecFiles(publishedProjectDir, markdownReferences);
  let privateSandboxPublication: { finalDir: string; temporaryDir: string } | undefined;
  if (pendingSandboxPages.length > 0) {
    try {
      privateSandboxPublication = writePrivateSandboxPublication(
        projectId,
        currentVersion,
        pendingSandboxPages,
      );
      for (const publishedPage of publishedDemoPages) {
        if (publishedPage.runtimeType !== "sandboxed-html") continue;
        publishedPage.sandboxExecutionPath = publishedPage.sandboxExecutionPath?.replace(
          "__PUBLISHED_VERSION__",
          encodeURIComponent(currentVersion),
        );
      }
    } catch (error) {
      cleanupTmpDir();
      throw error instanceof PublishError
        ? error
        : new PublishError("SANDBOX_MANIFEST_INVALID", "写入 sandbox 发布源失败");
    }
  }
  const publishCommit = new ProjectAdminService({
    dataDir: getDataDir(),
  }).projectCreatePublishCommit(
    {
      projectId,
      publishedVersion: currentVersion,
      title: `发布项目 ${currentVersion}`,
    },
    {
      id: "author-site",
      name: "Author Site",
      role: "creator",
      source: "author-site",
    },
  );
  const commitId = publishCommit.data?.id;

  const publishedProject: PublishedProject = {
    id: project.id,
    name: project.name,
    description: project.description,
    thumbnail: thumbnailCopied
      ? `/data/${projectId}/thumbnail${thumbnailExt}`
      : undefined,
    publishedVersion: currentVersion,
    commitId,
    publishedAt: Date.now(),
    demoPages: publishedDemoPages,
    demoFolders: project.demoFolders,
    appGraph,
    projectConfigSchema: projectConfigSchema ?? undefined,
    projectConfigValues:
      Object.keys(projectConfigValues).length > 0
        ? projectConfigValues
        : undefined,
    visibilityRules: visibilityRules ?? undefined,
    visibilityRulesHash: visibilityRules
      ? crypto.createHash("sha256").update(JSON.stringify(visibilityRules)).digest("hex")
      : undefined,
    canvasState,
    knowledge,
    designSpecs,
    markdownReferences,
    previewRuntime: {
      version: PREVIEW_RUNTIME_MANIFEST_VERSION,
      source: useCdnRuntime ? "cdn" : "local",
      basePath: publishedRuntimeBasePath,
    },
  };

  fs.writeFileSync(
    path.join(publishedProjectDir, "project.json"),
    JSON.stringify(publishedProject, null, 2),
  );

  if (privateSandboxPublication) {
    fs.mkdirSync(path.dirname(privateSandboxPublication.finalDir), {
      recursive: true,
      mode: 0o700,
    });
    fs.rmSync(privateSandboxPublication.finalDir, { recursive: true, force: true });
    fs.renameSync(
      privateSandboxPublication.temporaryDir,
      privateSandboxPublication.finalDir,
    );
  }
  // 私有 sandbox 源先就位，再替换公开 manifest；如公开发布失败，最多留下
  // 不可公开访问的孤立私有版本，不会出现公开页指向缺失源的半成品。
  fs.rmSync(finalPublishedProjectDir, { recursive: true, force: true });
  fs.renameSync(publishedProjectDir, finalPublishedProjectDir);

  project.publishedVersion = currentVersion;
  project.publishedAt = Date.now();
  writeProjectMeta(projectId, project);

  regenerateProjectsIndex();

  let cloudflareSync: CloudflareSyncResult | undefined;
  if (process.env.CLOUDFLARE_SYNC_ENABLED === "true") {
    onProgress?.(95, "正在同步到 Cloudflare...");
    cloudflareSync = await syncToCloudflare();
  }

  onProgress?.(100, "发布完成");

  return {
    projectId,
    publishedVersion: currentVersion,
    commitId,
    publishedAt: project.publishedAt,
    demoCount: publishedDemoPages.length,
    duration: Date.now() - startTime,
    cloudflareSync,
  };
}

export function regenerateProjectsIndex(): void {
  const projects: ProjectsIndex["projects"] = [];

  if (!fs.existsSync(PUBLISHED_DIR)) return;

  for (const dirName of fs.readdirSync(PUBLISHED_DIR)) {
    if (dirName.startsWith(".")) continue;
    const projectJsonPath = path.join(PUBLISHED_DIR, dirName, "project.json");
    if (!fs.existsSync(projectJsonPath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
      projects.push({
        id: data.id,
        name: data.name,
        description: data.description,
        thumbnail: data.thumbnail,
        publishedAt: data.publishedAt,
        publishedVersion: data.publishedVersion,
        demoCount: data.demoPages?.length ?? 0,
      });
    } catch {
      continue;
    }
  }

  projects.sort((a, b) => b.publishedAt - a.publishedAt);

  const index: ProjectsIndex = {
    projects,
    generatedAt: Date.now(),
  };

  fs.writeFileSync(
    path.join(PUBLISHED_DIR, "projects-index.json"),
    JSON.stringify(index, null, 2),
  );
}

export function unpublishProject(projectId: string): void {
  const projectDir = path.join(PUBLISHED_DIR, projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
  const sandboxProjectDir = path.join(PUBLISHED_SANDBOX_DIR, projectId);
  if (fs.existsSync(sandboxProjectDir)) {
    fs.rmSync(sandboxProjectDir, { recursive: true, force: true });
  }

  regenerateProjectsIndex();

  const project = readProjectMeta(projectId);
  if (project) {
    project.publishedVersion = undefined;
    project.publishedAt = undefined;
    writeProjectMeta(projectId, project);
  }
}

export function getPublishStatus(projectId: string): {
  projectId: string;
  publishedVersion: string | null;
  publishedAt: number | null;
  currentVersion: string | null;
  hasUnpublishedChanges: boolean;
  status: "never_published" | "published" | "unpublished_changes";
} {
  const project = readProjectMeta(projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const currentVersion =
    project.versions.length > 0
      ? project.versions[project.versions.length - 1].versionId
      : undefined;

  const isValidPublishedVersion =
    project.publishedVersion &&
    project.versions.some((v) => v.versionId === project.publishedVersion);

  const status = !isValidPublishedVersion
    ? "never_published"
    : project.publishedVersion === currentVersion
      ? "published"
      : "unpublished_changes";

  return {
    projectId: project.id,
    publishedVersion: isValidPublishedVersion
      ? (project.publishedVersion ?? null)
      : null,
    publishedAt: isValidPublishedVersion ? (project.publishedAt ?? null) : null,
    currentVersion: currentVersion ?? null,
    hasUnpublishedChanges: status === "unpublished_changes",
    status,
  };
}

export async function syncToCloudflare(): Promise<CloudflareSyncResult> {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "sync-to-cloudflare.sh",
  );

  if (!fs.existsSync(scriptPath)) {
    return { success: false, message: "同步脚本不存在" };
  }

  return new Promise((resolve) => {
    execFile(
      "bash",
      [scriptPath],
      {
        timeout: 120_000,
        env: {
          ...process.env,
          CLOUDFLARE_PROJECT_NAME:
            process.env.CLOUDFLARE_PROJECT_NAME || "workbench-viewer",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            message: `Cloudflare 同步失败: ${error.message}`,
          });
          return;
        }
        resolve({
          success: true,
          message: "Cloudflare Pages 同步完成",
        });
      },
    );
  });
}
