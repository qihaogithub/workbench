import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { findProjectRoot } from "@/lib/fs-utils";
import { fetchScreenshotService } from "@/lib/screenshot-service";

const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");

interface ScreenshotMeta {
  currentHash?: string;
  renderBoxes?: Record<string, unknown>;
  variants?: Record<string, {
    variant?: "strict" | "fast";
    generatedAt?: string;
    renderBox?: unknown;
  }>;
}

function normalizeHash(hash?: string | null): string | null {
  if (!hash) return null;
  return /^[a-f0-9]{16}$/i.test(hash) ? hash.toLowerCase() : null;
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

function resolveCurrentScreenshotMeta(meta: ScreenshotMeta | null): {
  hash: string;
  variant: "strict" | "fast";
  renderBox?: unknown;
} | null {
  if (!meta) return null;
  if (meta.currentHash) {
    return {
      hash: meta.currentHash,
      variant: "strict",
      renderBox: meta.renderBoxes?.[meta.currentHash],
    };
  }

  const latestVariant = Object.entries(meta.variants ?? {})
    .map(([key, value]) => {
      const [hash, variant = "strict"] = key.split(":");
      return {
        hash,
        variant: variant === "fast" ? "fast" as const : "strict" as const,
        generatedAt: value.generatedAt ?? "",
        renderBox: value.renderBox,
      };
    })
    .filter((entry) => normalizeHash(entry.hash))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];

  return latestVariant ?? null;
}

async function proxyScreenshotFile(
  projectId: string,
  pageId: string,
  search: string,
): Promise<Response | null> {
  try {
    const response = await fetchScreenshotService(
      `/api/screenshots/file/${encodeURIComponent(
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

async function proxyScreenshotMeta(
  projectId: string,
  pageId: string,
): Promise<Response | null> {
  try {
    const response = await fetchScreenshotService(
      `/api/screenshots/file/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(pageId)}?meta=1`,
    );

    if (response.status === 404) {
      return null;
    }

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return null;
  }
}

function readLocalScreenshot(
  projectId: string,
  pageId: string,
  hash?: string | null,
  variant: "strict" | "fast" = "strict",
): Buffer | null {
  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) return null;

  const normalizedHash = normalizeHash(hash);
  if (hash && !normalizedHash) return null;

  const filePath = normalizedHash
    ? path.join(
        projectDir,
        variant === "strict"
          ? `${pageId}.${normalizedHash}.png`
          : `${pageId}.${normalizedHash}.${variant}.png`,
      )
    : (() => {
        const meta = readScreenshotMeta(projectId, pageId);
        const current = resolveCurrentScreenshotMeta(meta);
        return current
          ? path.join(
              projectDir,
              current.variant === "strict"
                ? `${pageId}.${current.hash}.png`
                : `${pageId}.${current.hash}.${current.variant}.png`,
            )
          : path.join(projectDir, `${pageId}.png`);
      })();

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
  if (request.nextUrl.searchParams.get("meta") === "1") {
    const proxiedMeta = await proxyScreenshotMeta(projectId, pageId);
    if (proxiedMeta) return proxiedMeta;

    const meta = readScreenshotMeta(projectId, pageId);
    const current = resolveCurrentScreenshotMeta(meta);
    if (!current) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Screenshot meta not found" },
        },
        { status: 404 },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          currentHash: current.hash,
          variant: current.variant,
          url: `/api/screenshots/file/${encodeURIComponent(
            projectId,
          )}/${encodeURIComponent(pageId)}?${new URLSearchParams({
            hash: current.hash,
            ...(current.variant === "fast" ? { variant: "fast" } : {}),
          }).toString()}`,
          renderBox: current.renderBox,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const proxied = await proxyScreenshotFile(
    projectId,
    pageId,
    request.nextUrl.search,
  );
  if (proxied) return proxied;

  const rawHash = request.nextUrl.searchParams.get("hash");
  const variant =
    request.nextUrl.searchParams.get("variant") === "fast" ? "fast" : "strict";
  const hash = normalizeHash(rawHash);
  const buffer = readLocalScreenshot(projectId, pageId, rawHash, variant);
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
      "Cache-Control": hash
        ? "public, max-age=31536000, immutable"
        : "no-store",
    },
  });
}
