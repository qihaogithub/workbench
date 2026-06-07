import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { findProjectRoot } from "@/lib/fs-utils";

const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");

interface ScreenshotMeta {
  currentHash: string;
}

function readScreenshotMeta(
  projectId: string,
  pageId: string,
): ScreenshotMeta | null {
  const metaPath = path.join(SCREENSHOTS_DIR, projectId, `${pageId}.meta.json`);
  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(content) as ScreenshotMeta;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } },
) {
  const { projectId, pageId } = params;

  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "截图目录不存在" } },
      { status: 404 },
    );
  }

  // 优先通过 meta.json 读取当前版本
  const meta = readScreenshotMeta(projectId, pageId);
  let filePath: string;

  if (meta?.currentHash) {
    filePath = path.join(projectDir, `${pageId}.${meta.currentHash}.png`);
  } else {
    // 回退：直接读取当前版本文件
    filePath = path.join(projectDir, `${pageId}.png`);
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "截图文件不存在" } },
      { status: 404 },
    );
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "FILE_READ_ERROR", message: "截图文件读取失败" } },
      { status: 500 },
    );
  }
}
