import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDataDir } from "@/lib/fs-utils";

const PUBLISHED_DIR = path.join(getDataDir(), "published");

const MIME_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".js": "application/javascript",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".svga": "application/octet-stream",
  ".webp": "image/webp",
};

export async function GET(
  request: NextRequest,
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
        : ext === ".json"
          ? "no-store"
          : "public, must-revalidate, max-age=3600",
  };

  const origin = request.headers.get("origin");
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return new NextResponse(fileBuffer, { headers });
}
