import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDataDir } from "@/lib/fs-utils";

const PUBLISHED_DIR = path.join(getDataDir(), "published");

const MIME_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const filePath = params.path.join("/");

  let resolvedPath: string;

  if (filePath === "projects.json") {
    resolvedPath = path.join(PUBLISHED_DIR, "projects-index.json");
  } else {
    resolvedPath = path.join(PUBLISHED_DIR, filePath);
  }

  const realPublishedDir = fs.existsSync(PUBLISHED_DIR)
    ? fs.realpathSync(PUBLISHED_DIR)
    : PUBLISHED_DIR;

  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "文件不存在" } },
      { status: 404 },
    );
  }

  const realResolvedPath = fs.realpathSync(resolvedPath);
  if (!realResolvedPath.startsWith(realPublishedDir)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "路径非法" } },
      { status: 403 },
    );
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "不是文件" } },
      { status: 404 },
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const fileBuffer = fs.readFileSync(resolvedPath);

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control":
      ext === ".js"
        ? "public, immutable, max-age=2592000"
        : "public, must-revalidate, max-age=3600",
  };

  return new NextResponse(fileBuffer, { headers });
}
