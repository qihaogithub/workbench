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
  DemoFolderMeta,
  AppGraph,
} from "@opencode-workbench/shared";
import type { CanvasState } from "@opencode-workbench/demo-ui";
import { generateIframeHtml } from "@opencode-workbench/demo-ui/iframe-template";
import { getCdnBaseUrl } from "@/lib/cdn-config";
import {
  PREVIEW_RUNTIME_MANIFEST_VERSION,
  shouldUsePreviewRuntimeCdn,
} from "@/lib/preview-runtime-manifest";
import { processImagesForPublish } from "@/lib/publish/image-processor";
import { replacePathsInContent } from "@/lib/publish/path-replacer";
import type { PublishContext } from "@/lib/publish/types";

const PUBLISHED_DIR = path.join(getDataDir(), "published");

export interface PublishedDemoPage {
  id: string;
  name: string;
  routeKey?: string;
  order: number;
  parentId: string | null;
  runtimeType?: DemoPageMeta["runtimeType"];
  compiledJsPath?: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
  iframeHtmlPath?: string;
  embedCode?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  prototypeHtmlPath?: string;
  prototypeCssPath?: string;
  prototypeMetaPath?: string;
}

export interface PublishedProject {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  publishedVersion: string;
  publishedAt: number;
  demoPages: PublishedDemoPage[];
  demoFolders: DemoFolderMeta[];
  appGraph?: AppGraph;
  projectConfigSchema?: string;
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
  publishedAt: number;
  demoCount: number;
  duration: number;
  cloudflareSync?: CloudflareSyncResult;
}

export interface CloudflareSyncResult {
  success: boolean;
  message: string;
}

export function getPublishedDir(): string {
  return PUBLISHED_DIR;
}

function getViewerBaseUrl(): string {
  return process.env.VIEWER_CLOUDFLARE_URL || process.env.VIEWER_LAN_URL || "";
}

function copyPreviewRuntimeForPublish(projectId: string, publishDir: string): string | undefined {
  const runtimeSourceDir = path.join(process.cwd(), "public", "preview-runtime");
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

export async function publishProject(
  projectId: string,
  options?: {
    onProgress?: (percent: number, message: string) => void;
  },
): Promise<PublishResult> {
  const startTime = Date.now();
  const onProgress = options?.onProgress;

  if (!projectExists(projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  let project = readProjectMeta(projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const workspacePath = path.join(getProjectPath(projectId), "workspace");
  const demoPages = listDemoPages(workspacePath);

  if (demoPages.length === 0) {
    throw new Error("NO_CONTENT_TO_PUBLISH");
  }

  const finalPublishedProjectDir = path.join(PUBLISHED_DIR, projectId);
  const publishedProjectDir = path.join(
    PUBLISHED_DIR,
    ".tmp",
    `${projectId}-${Date.now()}`,
  );

  let urlMap = new Map<string, string>();
  try {
    onProgress?.(0, "正在处理图片资源...");
    const publishContext: PublishContext = {
      projectId,
      workspacePath,
      publishDir: publishedProjectDir,
      onProgress: (percent, _total, message) => {
        onProgress?.(percent, message);
      },
    };
    const imageResult = await processImagesForPublish(publishContext);
    urlMap = imageResult.urlMap;
    if (imageResult.errors.length > 0) {
      console.warn(
        `[publish] ${imageResult.errors.length} 张图片上传失败:`,
        imageResult.errors.map((e) => e.localPath).join(', '),
      );
    }
  } catch (error) {
    console.warn('[publish] 图片处理失败，继续发布:', error instanceof Error ? error.message : error);
    urlMap = new Map();
  }
  onProgress?.(10, "正在编译页面...");

  fs.rmSync(publishedProjectDir, { recursive: true, force: true });
  fs.mkdirSync(publishedProjectDir, { recursive: true });
  fs.mkdirSync(path.join(publishedProjectDir, "demos"), { recursive: true });

  const publishedDemoPages: PublishedDemoPage[] = [];

  const projectConfigSchema = getProjectConfigSchema(workspacePath);
  const projectConfigData = projectConfigSchema
    ? extractSchemaDefaults(projectConfigSchema)
    : {};
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
    const runtimeType = page.runtimeType === "prototype-html-css"
      ? "prototype-html-css"
      : "high-fidelity-react";

    const demoPublishDir = path.join(publishedProjectDir, "demos", page.id);
    fs.mkdirSync(demoPublishDir, { recursive: true });

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
      const prototypeHtml = urlMap.size > 0
        ? replacePathsInContent(fs.readFileSync(prototypeHtmlPath, "utf-8"), urlMap, prototypeHtmlPath)
        : fs.readFileSync(prototypeHtmlPath, "utf-8");
      const prototypeCss = fs.existsSync(prototypeCssPath)
        ? urlMap.size > 0
          ? replacePathsInContent(fs.readFileSync(prototypeCssPath, "utf-8"), urlMap, prototypeCssPath)
          : fs.readFileSync(prototypeCssPath, "utf-8")
        : "";
      fs.writeFileSync(path.join(demoPublishDir, "prototype.html"), prototypeHtml, "utf-8");
      fs.writeFileSync(path.join(demoPublishDir, "prototype.css"), prototypeCss, "utf-8");
      let prototypeMeta: Record<string, unknown> | undefined;
      if (fs.existsSync(prototypeMetaPath)) {
        const metaContent = fs.readFileSync(prototypeMetaPath, "utf-8");
        fs.writeFileSync(path.join(demoPublishDir, "prototype.meta.json"), metaContent, "utf-8");
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
        prototypeHtml,
        prototypeCss,
        prototypeMeta,
        prototypeHtmlPath: `demos/${page.id}/prototype.html`,
        prototypeCssPath: `demos/${page.id}/prototype.css`,
        prototypeMetaPath: prototypeMeta ? `demos/${page.id}/prototype.meta.json` : undefined,
      });

      const pagePercent = 10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
      onProgress?.(pagePercent, `发布原型页 ${i + 1}/${totalPages}...`);
      continue;
    }

    if (!fs.existsSync(codePath)) continue;

    const tsxSource = fs.readFileSync(codePath, "utf-8");
    const compileResult = compileCode(
      tsxSource,
      project.lockedDependencies,
      compileRuntimeOptions,
    );

    const replacedCode = urlMap.size > 0
      ? replacePathsInContent(compileResult.compiledCode, urlMap, codePath)
      : compileResult.compiledCode;

    fs.writeFileSync(
      path.join(demoPublishDir, "compiled.js"),
      replacedCode,
    );

    const mergedConfigData = { ...projectConfigData, ...pageConfigData };

    const iframeHtml = generateIframeHtml({
      compiledCode: replacedCode,
      cssImports: compileResult.cssImports,
      configData: mergedConfigData,
      cdnBaseUrl: getCdnBaseUrl(),
      runtimeBaseUrl: publishedRuntimeBasePath,
      useCdnRuntime,
    });
    const iframeHtmlPath = `demos/${page.id}/iframe.html`;
    fs.writeFileSync(path.join(demoPublishDir, "iframe.html"), iframeHtml);

    const iframeSrc = viewerBaseUrl
      ? `${viewerBaseUrl}/data/${projectId}/demos/${page.id}/iframe.html`
      : `/data/${projectId}/demos/${page.id}/iframe.html`;
    const embedCode = `<iframe\n  src="${iframeSrc}"\n  sandbox="allow-scripts"\n  style="width: 100%; border: none;"\n/>`;

    publishedDemoPages.push({
      id: page.id,
      name: page.name,
      routeKey: page.routeKey,
      order: page.order,
      parentId: page.parentId,
      runtimeType: page.runtimeType,
      compiledJsPath: `demos/${page.id}/compiled.js`,
      schemaPath: schemaPublishPath,
      previewSize,
      iframeHtmlPath,
      embedCode,
    });

    const pagePercent = 10 + Math.floor(((i + 1) / Math.max(totalPages, 1)) * 80);
    onProgress?.(pagePercent, `编译页面 ${i + 1}/${totalPages}...`);
  }

  if (publishedDemoPages.length === 0) {
    throw new Error("NO_CONTENT_TO_PUBLISH");
  }

  if (projectConfigSchema) {
    fs.writeFileSync(
      path.join(publishedProjectDir, "config-schema.json"),
      projectConfigSchema,
    );
  }

  fs.writeFileSync(
    path.join(publishedProjectDir, "app.graph.json"),
    JSON.stringify(appGraph, null, 2),
  );

  let thumbnailCopied = false;
  let thumbnailExt = "";
  if (project.thumbnail) {
    const thumbnailSrc = path.join(process.cwd(), "public", project.thumbnail);
    if (fs.existsSync(thumbnailSrc)) {
      thumbnailExt = path.extname(project.thumbnail);
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
  });
  if (!snapshotResult.success || !snapshotResult.version) {
    throw new Error("SNAPSHOT_CREATE_ERROR");
  }
  project = readProjectMeta(projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const currentVersion = snapshotResult.version.versionId;

  const publishedProject: PublishedProject = {
    id: project.id,
    name: project.name,
    description: project.description,
    thumbnail: thumbnailCopied
      ? `/data/${projectId}/thumbnail${thumbnailExt}`
      : undefined,
    publishedVersion: currentVersion,
    publishedAt: Date.now(),
    demoPages: publishedDemoPages,
    demoFolders: project.demoFolders,
    appGraph,
    projectConfigSchema: projectConfigSchema ?? undefined,
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
    publishedVersion: isValidPublishedVersion ? project.publishedVersion ?? null : null,
    publishedAt: isValidPublishedVersion ? project.publishedAt ?? null : null,
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
            process.env.CLOUDFLARE_PROJECT_NAME || "opencode-viewer",
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
