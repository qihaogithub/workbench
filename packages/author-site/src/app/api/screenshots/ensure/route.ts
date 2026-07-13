import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/fs-utils";
import { extractPreviewSize, type PreviewSize } from "@/lib/preview-size";
import { getScreenshotServiceUrl } from "@/lib/runtime-config";
import { extractSchemaDefaults } from "@/lib/schema-defaults";
import type {
  DemoPageRuntimeType,
  PageSnapshotInput,
  PrototypePageMeta,
  SketchSceneDocument,
} from "@workbench/shared";

const DATA_DIR = getDataDir();
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const MIN_HEALTHY_SCREENSHOT_BYTES = 8 * 1024;

// --- Asset inlining for screenshot rendering ---

const INLINE_IMAGE_EXT_RE =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;
const INLINE_HTML_ASSET_ATTR_RE = /\b(src|href|poster)=("|')([^"']+)(\2)/gi;
const INLINE_CSS_URL_RE = /url\((['"]?)([^"'`)]+)(\1)\)/gi;

const MIME_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

function resolveRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split("/").filter(Boolean);
  const relativeParts = relativePath.split("/");
  for (const part of relativeParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (parts.length === 0) return relativePath; // reject traversal beyond root
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

const INLINE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB – skip inlining for larger images

async function inlinePrototypeAssets(
  content: string,
  demoPageRelPath: string,
  workspaceAbsPath: string,
): Promise<string> {
  async function resolveToDataUri(value: string): Promise<string> {
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!/^\.\.?\/[^'")\s]*$/u.test(trimmed)) return value;
    if (!INLINE_IMAGE_EXT_RE.test(trimmed)) return value;

    // Strip query string so that paths like "./logo.png?v=1" resolve correctly
    const cleanPath = trimmed.split("?")[0];
    const resolvedRelPath = resolveRelativePath(cleanPath, demoPageRelPath);
    const absPath = path.join(workspaceAbsPath, resolvedRelPath);

    const wsPrefix = workspaceAbsPath.endsWith(path.sep)
      ? workspaceAbsPath
      : workspaceAbsPath + path.sep;
    if (!absPath.startsWith(wsPrefix) && absPath !== workspaceAbsPath)
      return value;

    try {
      const stat = await fsp.stat(absPath).catch(() => null);
      if (!stat?.isFile()) return value;
      // Skip inlining for files exceeding the size threshold
      if (stat.size > INLINE_MAX_BYTES) return value;
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME_TYPE_MAP[ext];
      if (!mime) return value;
      const buffer = await fsp.readFile(absPath);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return value;
    }
  }

  let result = content;
  // Process HTML asset attributes
  const htmlMatches = [...result.matchAll(INLINE_HTML_ASSET_ATTR_RE)];
  for (const m of htmlMatches) {
    const [fullMatch, attr, quote, value, endQuote] = m;
    const inlined = await resolveToDataUri(value);
    if (inlined !== value) {
      result = result.replace(
        fullMatch,
        `${attr}=${quote}${inlined}${endQuote}`,
      );
    }
  }
  // Process CSS url() references
  const cssMatches = [...result.matchAll(INLINE_CSS_URL_RE)];
  for (const m of cssMatches) {
    const [fullMatch, quote, value, endQuote] = m;
    const inlined = await resolveToDataUri(value);
    if (inlined !== value) {
      result = result.replace(fullMatch, `url(${quote}${inlined}${endQuote})`);
    }
  }
  return result;
}

interface EnsureRequest {
  projectId: string;
}

interface ScreenshotMeta {
  currentHash?: unknown;
}

type ThumbnailPageInput = PageSnapshotInput & {
  pageId: string;
  width?: number;
  height?: number;
  fullPage: true;
  priority: "thumbnail";
  renderMode: "strict";
  force: boolean;
};

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fsp.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function readSchemaDefaults(
  schemaPath: string,
): Promise<Record<string, unknown>> {
  const content = await readTextFile(schemaPath);
  return content ? extractSchemaDefaults(content) : {};
}

async function readPreviewSize(
  schemaPath: string,
): Promise<PreviewSize | undefined> {
  const content = await readTextFile(schemaPath);
  return content ? extractPreviewSize(content) : undefined;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const content = await readTextFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readWorkspaceRuntimeTypes(
  workspacePath: string,
): Promise<Record<string, DemoPageRuntimeType | undefined>> {
  const tree = await readJsonFile<{
    pages?: Array<{ id?: unknown; runtimeType?: unknown }>;
  }>(path.join(workspacePath, "workspace-tree.json"));
  const result: Record<string, DemoPageRuntimeType | undefined> = {};
  for (const page of tree?.pages ?? []) {
    if (typeof page.id !== "string") continue;
    result[page.id] =
      page.runtimeType === "prototype-html-css"
        ? "prototype-html-css"
        : page.runtimeType === "sketch-scene"
          ? "sketch-scene"
          : page.runtimeType === "high-fidelity-react"
            ? "high-fidelity-react"
            : undefined;
  }
  return result;
}

function normalizeDimension(
  value: PreviewSize[keyof PreviewSize],
): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric)
    : undefined;
}

function normalizeHash(hash: unknown): string | null {
  return typeof hash === "string" && /^[a-f0-9]{16}$/i.test(hash)
    ? hash.toLowerCase()
    : null;
}

async function readScreenshotMeta(
  projectId: string,
  pageId: string,
): Promise<ScreenshotMeta | null> {
  const metaPath = path.join(SCREENSHOTS_DIR, projectId, `${pageId}.meta.json`);
  const content = await readTextFile(metaPath);
  if (!content) return null;

  try {
    return JSON.parse(content) as ScreenshotMeta;
  } catch {
    return null;
  }
}

function isHealthyScreenshotFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() && stats.size >= MIN_HEALTHY_SCREENSHOT_BYTES;
  } catch {
    return false;
  }
}

async function hasHealthyScreenshotCache(
  projectId: string,
  pageId: string,
): Promise<boolean> {
  const meta = await readScreenshotMeta(projectId, pageId);
  const currentHash = normalizeHash(meta?.currentHash);
  if (!currentHash) return false;

  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  const hashPath = path.join(projectDir, `${pageId}.${currentHash}.png`);
  const currentPath = path.join(projectDir, `${pageId}.png`);
  return (
    isHealthyScreenshotFile(hashPath) && isHealthyScreenshotFile(currentPath)
  );
}

async function readProjectThumbnailPages(
  projectId: string,
): Promise<ThumbnailPageInput[]> {
  const workspacePath = path.join(PROJECTS_DIR, projectId, "workspace");
  const demosPath = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosPath)) return [];

  const projectDefaults = await readSchemaDefaults(
    path.join(workspacePath, "project.config.schema.json"),
  );
  const runtimeTypes = await readWorkspaceRuntimeTypes(workspacePath);
  const pages: ThumbnailPageInput[] = [];

  for (const entry of fs.readdirSync(demosPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const pageDir = path.join(demosPath, entry.name);
    const code = await readTextFile(path.join(pageDir, "index.tsx"));
    const prototypeHtml = await readTextFile(
      path.join(pageDir, "prototype.html"),
    );
    const prototypeCss =
      (await readTextFile(path.join(pageDir, "prototype.css"))) ?? "";
    const sketchScene = await readJsonFile<SketchSceneDocument>(
      path.join(pageDir, "sketch.scene.json"),
    );
    const runtimeType =
      runtimeTypes[entry.name] ??
      (!code && sketchScene
        ? "sketch-scene"
        : !code && prototypeHtml
          ? "prototype-html-css"
          : "high-fidelity-react");
    if (runtimeType === "high-fidelity-react" && !code) continue;
    if (runtimeType === "prototype-html-css" && !prototypeHtml) continue;
    if (runtimeType === "sketch-scene" && !sketchScene) continue;

    const schemaPath = path.join(pageDir, "config.schema.json");
    const pageDefaults = await readSchemaDefaults(schemaPath);
    const previewSize = await readPreviewSize(schemaPath);
    const prototypeMeta =
      (await readJsonFile<PrototypePageMeta>(
        path.join(pageDir, "prototype.meta.json"),
      )) ?? undefined;
    const width = previewSize
      ? normalizeDimension(previewSize.width)
      : undefined;
    const height = previewSize
      ? normalizeDimension(previewSize.height)
      : undefined;
    const common = {
      pageId: entry.name,
      configData: { ...projectDefaults, ...pageDefaults },
      previewSize,
      width,
      height,
      fullPage: true,
      priority: "thumbnail",
      renderMode: "strict",
      force: !(await hasHealthyScreenshotCache(projectId, entry.name)),
    } as const;

    // Inline relative image assets as base64 data URIs so that the
    // screenshot service (independent Fastify process) can render them
    // without needing workspace file-system access.
    const demoPageRelPath = `demos/${entry.name}/`;
    const inlinedPrototypeHtml = prototypeHtml
      ? await inlinePrototypeAssets(
          prototypeHtml,
          demoPageRelPath,
          workspacePath,
        )
      : prototypeHtml;
    const inlinedPrototypeCss = prototypeCss
      ? await inlinePrototypeAssets(
          prototypeCss,
          demoPageRelPath,
          workspacePath,
        )
      : prototypeCss;

    pages.push(
      runtimeType === "prototype-html-css"
        ? {
            ...common,
            runtimeType: "prototype-html-css",
            prototypeHtml: inlinedPrototypeHtml ?? "",
            prototypeCss: inlinedPrototypeCss,
            prototypeMeta,
          }
        : runtimeType === "sketch-scene"
          ? {
              ...common,
              runtimeType: "sketch-scene",
              sketchScene: sketchScene as SketchSceneDocument,
              sketchMeta:
                (await readJsonFile<Record<string, unknown>>(
                  path.join(pageDir, "sketch.meta.json"),
                )) ?? undefined,
            }
          : {
              ...common,
              runtimeType: "high-fidelity-react",
              code: code ?? "",
            },
    );
  }

  return pages;
}

async function requestScreenshotGeneration(
  projectId: string,
  pages: ThumbnailPageInput[],
): Promise<void> {
  await fetch(`${getScreenshotServiceUrl()}/api/screenshots/generate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      pages,
    }),
  });
}

function toResponsePage(page: ThumbnailPageInput): {
  pageId: string;
  force: boolean;
  width?: number;
  height?: number;
} {
  return {
    pageId: page.pageId,
    force: page.force,
    ...(page.width ? { width: page.width } : {}),
    ...(page.height ? { height: page.height } : {}),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EnsureRequest;
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "缺少 projectId" },
        },
        { status: 400 },
      );
    }

    const projectDir = path.join(PROJECTS_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PROJECT_NOT_FOUND", message: "项目不存在" },
        },
        { status: 404 },
      );
    }

    const pages = await readProjectThumbnailPages(projectId);
    if (pages.length === 0) {
      return NextResponse.json({
        success: true,
        data: { generated: 0, message: "无可用的页面代码" },
      });
    }

    const pagesToGenerate = pages.filter((page) => page.force);

    if (pagesToGenerate.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          generated: 0,
          total: pages.length,
          message: "所有页面已有健康截图",
        },
      });
    }

    try {
      await requestScreenshotGeneration(projectId, pagesToGenerate);
    } catch {
      // 截图服务不可达时静默失败，不阻塞响应
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: pagesToGenerate.length,
        total: pages.length,
        missing: pagesToGenerate.map((p) => p.pageId),
        pages: pagesToGenerate.map(toResponsePage),
      },
    });
  } catch (error) {
    console.error("Error ensuring screenshots:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "截图生成请求失败" },
      },
      { status: 500 },
    );
  }
}
