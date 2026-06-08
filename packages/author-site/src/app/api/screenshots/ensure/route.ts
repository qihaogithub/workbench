import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { findProjectRoot } from "@/lib/fs-utils";

const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");

const SCREENSHOT_SERVICE_URL =
  process.env.SCREENSHOT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL ||
  "http://localhost:3202";

interface EnsureRequest {
  projectId: string;
}

/**
 * 读取项目 workspace 下所有 demo 页面的代码
 */
function readProjectPageCodes(projectId: string): Map<string, string> {
  const codes = new Map<string, string>();
  const workspacePath = path.join(
    PROJECTS_DIR,
    projectId,
    "workspace",
    "demos",
  );

  if (!fs.existsSync(workspacePath)) return codes;

  for (const entry of fs.readdirSync(workspacePath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const codePath = path.join(workspacePath, entry.name, "index.tsx");
    if (fs.existsSync(codePath)) {
      try {
        codes.set(entry.name, fs.readFileSync(codePath, "utf-8"));
      } catch {
        // 读取失败跳过该页面
      }
    }
  }

  return codes;
}

/**
 * 检查哪些页面已有截图文件
 */
function getExistingScreenshotPages(projectId: string): Set<string> {
  const existing = new Set<string>();
  const projectDir = path.join(SCREENSHOTS_DIR, projectId);

  if (!fs.existsSync(projectDir)) return existing;

  for (const file of fs.readdirSync(projectDir)) {
    // 匹配 {pageId}.png 或 {pageId}.{hash}.png 格式
    if (file.endsWith(".png")) {
      const pageId = file.split(".")[0];
      existing.add(pageId);
    }
  }

  return existing;
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

    // 读取项目页面代码
    const pageCodes = readProjectPageCodes(projectId);
    if (pageCodes.size === 0) {
      return NextResponse.json({
        success: true,
        data: { generated: 0, message: "无可用的页面代码" },
      });
    }

    // 检查已有截图的页面
    const existingPages = getExistingScreenshotPages(projectId);

    // 筛选出缺失截图的页面
    const missingPages: {
      pageId: string;
      code: string;
      configData: Record<string, unknown>;
    }[] = [];
    for (const [pageId, code] of pageCodes) {
      if (!existingPages.has(pageId)) {
        missingPages.push({ pageId, code, configData: {} });
      }
    }

    if (missingPages.length === 0) {
      return NextResponse.json({
        success: true,
        data: { generated: 0, message: "所有页面已有截图" },
      });
    }

    // 调用截图服务批量生成缺失截图（fire-and-forget）
    try {
      await fetch(`${SCREENSHOT_SERVICE_URL}/api/screenshots/generate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pages: missingPages,
        }),
      });
    } catch {
      // 截图服务不可达时静默失败，不阻塞响应
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: missingPages.length,
        total: pageCodes.size,
        missing: missingPages.map((p) => p.pageId),
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
