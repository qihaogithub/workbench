import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/fs-utils";
import { extractPreviewSize, type PreviewSize } from "@/lib/preview-size";
import { getScreenshotServiceUrl } from "@/lib/runtime-config";
import { extractSchemaDefaults } from "@/lib/schema-defaults";
import type {
  DemoPageRuntimeType,
  PageSnapshotInput,
  PrototypePageMeta,
} from "@opencode-workbench/shared";

const DATA_DIR = getDataDir();
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const MIN_HEALTHY_SCREENSHOT_BYTES = 8 * 1024;

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

function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function readSchemaDefaults(schemaPath: string): Record<string, unknown> {
  const content = readTextFile(schemaPath);
  return content ? extractSchemaDefaults(content) : {};
}

function readPreviewSize(schemaPath: string): PreviewSize | undefined {
  const content = readTextFile(schemaPath);
  return content ? extractPreviewSize(content) : undefined;
}

function readJsonFile<T>(filePath: string): T | null {
  const content = readTextFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function readWorkspaceRuntimeTypes(
  workspacePath: string,
): Record<string, DemoPageRuntimeType | undefined> {
  const tree = readJsonFile<{
    pages?: Array<{ id?: unknown; runtimeType?: unknown }>;
  }>(path.join(workspacePath, "workspace-tree.json"));
  const result: Record<string, DemoPageRuntimeType | undefined> = {};
  for (const page of tree?.pages ?? []) {
    if (typeof page.id !== "string") continue;
    result[page.id] =
      page.runtimeType === "prototype-html-css"
        ? "prototype-html-css"
        : page.runtimeType === "high-fidelity-react"
          ? "high-fidelity-react"
          : undefined;
  }
  return result;
}

function normalizeDimension(value: PreviewSize[keyof PreviewSize]): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
}

function normalizeHash(hash: unknown): string | null {
  return typeof hash === "string" && /^[a-f0-9]{16}$/i.test(hash)
    ? hash.toLowerCase()
    : null;
}

function readScreenshotMeta(projectId: string, pageId: string): ScreenshotMeta | null {
  const metaPath = path.join(SCREENSHOTS_DIR, projectId, `${pageId}.meta.json`);
  const content = readTextFile(metaPath);
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

function hasHealthyScreenshotCache(projectId: string, pageId: string): boolean {
  const meta = readScreenshotMeta(projectId, pageId);
  const currentHash = normalizeHash(meta?.currentHash);
  if (!currentHash) return false;

  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  const hashPath = path.join(projectDir, `${pageId}.${currentHash}.png`);
  const currentPath = path.join(projectDir, `${pageId}.png`);
  return (
    isHealthyScreenshotFile(hashPath) &&
    isHealthyScreenshotFile(currentPath)
  );
}

function readProjectThumbnailPages(projectId: string): ThumbnailPageInput[] {
  const workspacePath = path.join(PROJECTS_DIR, projectId, "workspace");
  const demosPath = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosPath)) return [];

  const projectDefaults = readSchemaDefaults(
    path.join(workspacePath, "project.config.schema.json"),
  );
  const runtimeTypes = readWorkspaceRuntimeTypes(workspacePath);
  const pages: ThumbnailPageInput[] = [];

  for (const entry of fs.readdirSync(demosPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const pageDir = path.join(demosPath, entry.name);
    const code = readTextFile(path.join(pageDir, "index.tsx"));
    const prototypeHtml = readTextFile(path.join(pageDir, "prototype.html"));
    const prototypeCss = readTextFile(path.join(pageDir, "prototype.css")) ?? "";
    const runtimeType =
      runtimeTypes[entry.name] ??
      (!code && prototypeHtml ? "prototype-html-css" : "high-fidelity-react");
    if (runtimeType === "high-fidelity-react" && !code) continue;
    if (runtimeType === "prototype-html-css" && !prototypeHtml) continue;

    const schemaPath = path.join(pageDir, "config.schema.json");
    const pageDefaults = readSchemaDefaults(schemaPath);
    const previewSize = readPreviewSize(schemaPath);
    const prototypeMeta = readJsonFile<PrototypePageMeta>(
      path.join(pageDir, "prototype.meta.json"),
    ) ?? undefined;
    const width = previewSize ? normalizeDimension(previewSize.width) : undefined;
    const height = previewSize ? normalizeDimension(previewSize.height) : undefined;
    const common = {
      pageId: entry.name,
      configData: { ...projectDefaults, ...pageDefaults },
      previewSize,
      width,
      height,
      fullPage: true,
      priority: "thumbnail",
      renderMode: "strict",
      force: !hasHealthyScreenshotCache(projectId, entry.name),
    } as const;

    pages.push(
      runtimeType === "prototype-html-css"
        ? {
            ...common,
            runtimeType: "prototype-html-css",
            prototypeHtml: prototypeHtml ?? "",
            prototypeCss,
            prototypeMeta,
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

    const pages = readProjectThumbnailPages(projectId);
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
