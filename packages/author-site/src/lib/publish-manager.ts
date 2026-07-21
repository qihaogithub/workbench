import path from "path";
import fs from "fs";
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
  resolvePageRuntimeType,
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
} from "@workbench/shared";
import { ProjectAdminService } from "@workbench/project-core";
import type { CanvasState } from "@workbench/demo-ui";
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
import { replacePathsInContent } from "@/lib/publish/path-replacer";
import type { PublishContext } from "@/lib/publish/types";

const PUBLISHED_DIR = path.join(getDataDir(), "published");
const SCREENSHOTS_DIR = path.join(getDataDir(), "screenshots");

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
  runtimeType?: DemoPageRuntimeType;
  compiledJsPath?: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
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
  canvasState?: CanvasState;
  previewRuntime?: {
    version: string;
    source: "local" | "cdn";
    basePath?: string;
  };
}

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
      | "PUBLISH_COMPILE_FAILED",
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

  onProgress?.(10, "正在编译页面...");

  const publishedDemoPages: PublishedDemoPage[] = [];
  const compileIssues: PublishPageCompileIssue[] = [];
  const dryRunPages: PublishDryRunReport["pages"] = [];

  const projectConfigSchema = getProjectConfigSchema(workspacePath);
  const projectConfigDefaults = projectConfigSchema
    ? extractSchemaDefaults(projectConfigSchema)
    : {};
  const projectConfigValues = normalizePublishedConfigValues(
    getProjectConfigValues(workspacePath),
    urlMap,
  );
  const canvasState = readCanvasStateFromWorkspace(workspacePath);
  const appGraph = readAppGraph(workspacePath);

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
    const runtimeType = resolvePageRuntimeType(demoDir);

    const demoPublishDir = path.join(publishedProjectDir, "demos", page.id);
    fs.mkdirSync(demoPublishDir, { recursive: true });
    const screenshotPath = copyPageScreenshotForPublish(
      projectId,
      page.id,
      publishedProjectDir,
    );

    let previewSize: PreviewSize | undefined;
    let pageConfigData: Record<string, unknown> = {};
    let schemaPublishPath: string | undefined;
    if (fs.existsSync(schemaPath)) {
      const schemaContent = fs.readFileSync(schemaPath, "utf-8");
      fs.writeFileSync(path.join(demoPublishDir, "schema.json"), schemaContent);
      previewSize = extractPreviewSize(schemaContent);
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
        runtimeType,
        schemaPath: schemaPublishPath,
        previewSize,
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
        runtimeType,
        schemaPath: schemaPublishPath,
        previewSize,
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

    const mergedConfigData = {
      ...projectConfigDefaults,
      ...pageConfigData,
      ...projectConfigValues,
    };

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
    });
    fs.writeFileSync(path.join(demoPublishDir, "iframe.html"), iframeHtml);

    const iframeSrc = viewerBaseUrl
      ? `${viewerBaseUrl}/data/${projectId}/${iframeHtmlPath}`
      : `/data/${projectId}/${iframeHtmlPath}`;
    const embedCode = `<iframe\n  src="${iframeSrc}"\n  sandbox="allow-scripts"\n  style="width: 100%; border: none;"\n/>`;

    publishedDemoPages.push({
      id: page.id,
      name: page.name,
      routeKey: page.routeKey,
      order: page.order,
      parentId: page.parentId,
      runtimeType,
      compiledJsPath,
      schemaPath: schemaPublishPath,
      previewSize,
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
    canvasState,
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
