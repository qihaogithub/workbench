import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { findProjectRoot } from "@/lib/fs-utils";
import { getScreenshotServiceUrl } from "@/lib/screenshot-service";

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

async function proxyScreenshotFile(
  projectId: string,
  pageId: string,
  search: string,
): Promise<Response | null> {
  try {
    const response = await fetch(
      `${getScreenshotServiceUrl()}/api/screenshots/file/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(pageId)}${search}`,
    );

    if (response.status === 404) {
      return null;
    }

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Cache-Control":
          response.headers.get("Cache-Control") || "public, max-age=3600",
      },
    });
  } catch {
    return null;
  }
}

function readLocalScreenshot(
  projectId: string,
  pageId: string,
): Buffer | null {
  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) return null;

  const meta = readScreenshotMeta(projectId, pageId);
  const filePath = meta?.currentHash
    ? path.join(projectDir, `${pageId}.${meta.currentHash}.png`)
    : path.join(projectDir, `${pageId}.png`);

  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } },
) {
  const { projectId, pageId } = params;
  const proxied = await proxyScreenshotFile(
    projectId,
    pageId,
    request.nextUrl.search,
  );
  if (proxied) return proxied;

  const buffer = readLocalScreenshot(projectId, pageId);
  if (!buffer) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Screenshot file not found" },
      },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
