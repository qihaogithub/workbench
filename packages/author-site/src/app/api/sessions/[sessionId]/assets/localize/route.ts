import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import http from "http";
import https from "https";
import net from "net";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getSessionMeta,
  isSessionExpired,
  sessionExists,
} from "@/lib/fs-utils";
import { addProjectImage, type ProjectImage } from "@/lib/project-images";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const URL_DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const MIME_EXTENSIONS = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/svg+xml", ".svg"],
]);

type SourceType = "browser_blob" | "remote_url";

interface LocalizeRequestBody {
  pageId?: unknown;
  runtimeType?: unknown;
  source?: {
    kind?: unknown;
    src?: unknown;
    currentSrc?: unknown;
    owId?: unknown;
    domPath?: unknown;
  };
  browserBlob?: {
    mimeType?: unknown;
    dataBase64?: unknown;
  };
  browserReadError?: unknown;
}

interface DownloadResult {
  buffer?: Buffer;
  mimeType?: string;
  error?: string;
  errorCode?: string;
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map((part) => Number(part));
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("UNSUPPORTED_URL_PROTOCOL");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("PRIVATE_NETWORK_BLOCKED");
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("PRIVATE_NETWORK_BLOCKED");
  }
  return url;
}

function normalizeMimeType(mimeType: string | undefined): string {
  return (mimeType || "").split(";")[0]?.trim().toLowerCase() || "";
}

function extensionFromMime(mimeType: string): string | null {
  return MIME_EXTENSIONS.get(normalizeMimeType(mimeType)) ?? null;
}

function extensionFromUrl(urlString: string | undefined): string | null {
  if (!urlString) return null;
  try {
    const ext = path.extname(new URL(urlString).pathname).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)
      ? ext
      : null;
  } catch {
    return null;
  }
}

function filenameStemFromUrl(urlString: string | undefined): string {
  if (!urlString) return "image";
  try {
    const parsed = new URL(urlString);
    const basename = path.basename(parsed.pathname, path.extname(parsed.pathname));
    return sanitizeFilenameStem(basename);
  } catch {
    return "image";
  }
}

function sanitizeFilenameStem(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "image";
}

function contentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function decodeBrowserBlob(
  browserBlob: LocalizeRequestBody["browserBlob"],
): DownloadResult {
  if (!browserBlob) return { error: "No browser blob provided", errorCode: "browser_blob_missing" };
  const mimeType = normalizeMimeType(
    typeof browserBlob.mimeType === "string" ? browserBlob.mimeType : undefined,
  );
  const dataBase64 = typeof browserBlob.dataBase64 === "string"
    ? browserBlob.dataBase64
    : "";
  if (!mimeType.startsWith("image/") || !extensionFromMime(mimeType)) {
    return { error: "Browser blob is not a supported image", errorCode: "not_an_image" };
  }
  if (!dataBase64.trim()) {
    return { error: "Browser blob is empty", errorCode: "invalid_base64" };
  }
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0) {
    return { error: "Browser blob is empty", errorCode: "invalid_base64" };
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { error: "Image exceeds 10MB size limit", errorCode: "file_too_large" };
  }
  return { buffer, mimeType };
}

async function downloadImageFromUrl(
  urlString: string,
  redirectCount = 0,
): Promise<DownloadResult> {
  let url: URL;
  try {
    url = await assertPublicHttpUrl(urlString);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid image URL",
      errorCode: "invalid_url",
    };
  }

  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(url, { timeout: URL_DOWNLOAD_TIMEOUT_MS }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        if (redirectCount >= MAX_REDIRECTS) {
          res.destroy();
          resolve({ error: "Too many redirects", errorCode: "download_failed" });
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        res.destroy();
        downloadImageFromUrl(nextUrl, redirectCount + 1).then(resolve);
        return;
      }

      if (res.statusCode !== 200) {
        res.destroy();
        resolve({
          error: `HTTP ${res.statusCode} when downloading image`,
          errorCode: "download_failed",
        });
        return;
      }

      const mimeType = normalizeMimeType(res.headers["content-type"]?.toString());
      if (!mimeType.startsWith("image/") || !extensionFromMime(mimeType)) {
        res.destroy();
        resolve({ error: "URL does not point to a supported image", errorCode: "not_an_image" });
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      res.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMAGE_SIZE) {
          res.destroy();
          resolve({ error: "Image exceeds 10MB size limit", errorCode: "file_too_large" });
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), mimeType }));
      res.on("error", (error) =>
        resolve({ error: `Download error: ${error.message}`, errorCode: "download_failed" }),
      );
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        error: `Download timed out after ${URL_DOWNLOAD_TIMEOUT_MS / 1000}s`,
        errorCode: "download_timeout",
      });
    });
    req.on("error", (error) =>
      resolve({ error: `Network error: ${error.message}`, errorCode: "download_failed" }),
    );
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { sessionId } = params;
    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }

    const meta = getSessionMeta(sessionId);
    if (!meta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }
    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
    }
    if (!meta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as LocalizeRequestBody | null;
    if (!body || body.source?.kind !== "selected-image") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "source.kind 必须为 selected-image"),
        { status: 400 },
      );
    }

    const workspacePath = findWorkspacePath(meta.workspaceId);
    if (!workspacePath) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    const src = typeof body.source.src === "string" ? body.source.src : "";
    const currentSrc = typeof body.source.currentSrc === "string" ? body.source.currentSrc : "";
    const originalUrl = currentSrc || src;

    let image = decodeBrowserBlob(body.browserBlob);
    let sourceType: SourceType = "browser_blob";
    const browserError = image.error;
    if (!image.buffer) {
      if (!originalUrl) {
        return NextResponse.json(
          createApiError("UPLOAD_FAILED", "无法读取当前图片，需要上传原图", {
            browserError,
            browserReadError: body.browserReadError,
          }),
          { status: 400 },
        );
      }
      sourceType = "remote_url";
      image = await downloadImageFromUrl(originalUrl);
    }

    if (!image.buffer || !image.mimeType) {
      return NextResponse.json(
        createApiError("UPLOAD_FAILED", "无法本地化当前图片，需要上传原图", {
          browserError,
          browserReadError: body.browserReadError,
          remoteError: image.error,
          remoteErrorCode: image.errorCode,
        }),
        { status: image.errorCode === "file_too_large" ? 413 : 502 },
      );
    }

    const hash = contentHash(image.buffer);
    const hashPrefix = hash.slice(0, 12);
    const ext =
      extensionFromMime(image.mimeType) ||
      extensionFromUrl(originalUrl) ||
      ".png";
    const filename = `${hashPrefix}-${filenameStemFromUrl(originalUrl)}${ext}`;
    const workspaceAssetPath = `assets/images/${filename}`;
    const absoluteAssetPath = path.resolve(workspacePath, workspaceAssetPath);
    const resolvedWorkspacePath = path.resolve(workspacePath);
    if (!absoluteAssetPath.startsWith(`${resolvedWorkspacePath}${path.sep}`)) {
      return NextResponse.json(createApiError("FORBIDDEN", "禁止写入工作空间外路径"), {
        status: 403,
      });
    }

    fs.mkdirSync(path.dirname(absoluteAssetPath), { recursive: true });
    if (!fs.existsSync(absoluteAssetPath)) {
      fs.writeFileSync(absoluteAssetPath, image.buffer);
    }

    const relativePathFromPage = `../../${workspaceAssetPath}`;
    const assetId = `asset_${hashPrefix}`;
    const projectImage: ProjectImage = {
      id: hashPrefix,
      filename,
      url: workspaceAssetPath,
      size: image.buffer.length,
      format: ext.slice(1),
      createdAt: Date.now(),
      createdBy: "user",
      contentHash: hash,
      mimeType: image.mimeType,
      originalUrl: originalUrl || undefined,
      sourceType,
    };
    addProjectImage(meta.demoId, projectImage);

    return NextResponse.json(
      createApiSuccess({
        assetId,
        contentHash: hash,
        workspacePath: workspaceAssetPath,
        relativePathFromPage,
        editPreviewUrl: `/api/sessions/${sessionId}/workspace/${workspaceAssetPath}`,
        mimeType: image.mimeType,
        size: image.buffer.length,
        sourceType,
        originalUrl: originalUrl || undefined,
        pageId: typeof body.pageId === "string" ? body.pageId : undefined,
        runtimeType: typeof body.runtimeType === "string" ? body.runtimeType : undefined,
      }),
    );
  } catch (error) {
    console.error("Error localizing selected image:", error);
    return NextResponse.json(
      createApiError("UPLOAD_FAILED", "图片本地化失败"),
      { status: 500 },
    );
  }
}
