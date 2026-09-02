import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, findWorkspacePath, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { claimWhiteboardDraftImage, collectExpiredWhiteboardImages, getImage, getImageInfo } from "@/lib/image-store";
import { getProjectImages } from "@/lib/project-images";
import { getSessionAssetPath } from "@/lib/session-assets";
import {
  decodeWhiteboardDataUrl,
  downloadWhiteboardImage,
  normalizeWhiteboardImage,
  resolveWorkspaceImageFile,
  WhiteboardImageAssetError,
} from "@/lib/whiteboard-image-assets";

type AssetRequest = {
  sessionId?: unknown;
  draftId?: unknown;
  nodeId?: unknown;
  source?: { src?: unknown; currentSrc?: unknown };
  browserBlob?: { mimeType?: unknown; dataBase64?: unknown };
};

function decodeBrowserBlob(value: AssetRequest["browserBlob"]): { buffer: Buffer; mimeType: string } | null {
  const mimeType = typeof value?.mimeType === "string" ? value.mimeType.split(";", 1)[0].trim().toLowerCase() : "";
  const dataBase64 = typeof value?.dataBase64 === "string" ? value.dataBase64 : "";
  if (!mimeType || !mimeType.startsWith("image/") || !dataBase64) return null;
  const buffer = Buffer.from(dataBase64, "base64");
  return buffer.length ? { buffer, mimeType } : null;
}

function getSource(body: AssetRequest): string {
  const source = body.source;
  const currentSrc = typeof source?.currentSrc === "string" ? source.currentSrc : "";
  const src = typeof source?.src === "string" ? source.src : "";
  return currentSrc || src;
}

function sourcePath(source: string): string {
  return source.split(/[?#]/, 1)[0] ?? source;
}

function imageFromGlobalSource(source: string): { buffer: Buffer; mimeType?: string } | null {
  const imageId = sourcePath(source).match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/)?.[1];
  if (!imageId) return null;
  if (!getImageInfo(imageId)) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "找不到白板图片资源");
  const image = getImage(imageId);
  if (!image.buffer) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "白板图片资源已失效，请重新上传图片");
  return { buffer: image.buffer, mimeType: image.mimeType };
}

function imageFromProjectSource(projectId: string, source: string): { buffer: Buffer; mimeType?: string } | null {
  const cleanSource = sourcePath(source);
  const projectPrefix = `/api/projects/${encodeURIComponent(projectId)}/images/`;
  const projectUrlMatch = cleanSource.match(/^\/api\/projects\/([^/]+)\/images\/(.+)$/);
  if (projectUrlMatch) {
    let requestedProjectId: string;
    try {
      requestedProjectId = decodeURIComponent(projectUrlMatch[1]);
    } catch {
      throw new WhiteboardImageAssetError("INVALID_PATH", "图片资源路径无效");
    }
    if (requestedProjectId !== projectId) return null;
  }
  let requestedFilename = cleanSource.startsWith(projectPrefix)
    ? cleanSource.slice(projectPrefix.length)
    : cleanSource.replace(/^\/+/, "");
  try {
    requestedFilename = decodeURIComponent(requestedFilename);
  } catch {
    throw new WhiteboardImageAssetError("INVALID_PATH", "图片资源路径无效");
  }
  const filename = requestedFilename.split("/").pop();
  if (!filename) return null;
  const entry = getProjectImages(projectId).find((candidate) =>
    candidate.filename === requestedFilename
      || candidate.filename === filename
      || candidate.filename.endsWith(`/${requestedFilename}`)
      || candidate.filename.endsWith(`/${filename}`)
      || candidate.url === cleanSource
      || candidate.url === source,
  );
  const imageId = entry?.url.match(/\/api\/images\/([A-Za-z0-9_-]{1,128})/)?.[1];
  if (!imageId) return null;
  if (!getImageInfo(imageId)) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "找不到白板图片资源");
  const image = getImage(imageId);
  if (!image.buffer) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "白板图片资源已失效，请重新上传图片");
  return { buffer: image.buffer, mimeType: image.mimeType };
}

function imageFromSessionSource(sessionId: string, source: string): { buffer: Buffer; mimeType?: string } | null {
  const prefix = `/api/sessions/${encodeURIComponent(sessionId)}/assets/`;
  const cleanSource = sourcePath(source);
  if (!cleanSource.startsWith(prefix)) return null;
  const filename = decodeURIComponent(cleanSource.slice(prefix.length));
  if (!filename || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") {
    throw new WhiteboardImageAssetError("INVALID_PATH", "图片资源路径无效");
  }
  const filePath = getSessionAssetPath(sessionId, filename);
  if (!filePath) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "找不到白板图片资源");
  const buffer = fs.readFileSync(filePath);
  return { buffer, mimeType: undefined };
}

async function readSourceImage(input: {
  body: AssetRequest;
  projectId: string;
  sessionId: string;
  workspacePath: string;
}): Promise<{ buffer: Buffer; mimeType?: string; sourceUrl?: string; sourceType?: "user_upload" | "remote_url" | "session_asset" }> {
  const browserBlob = decodeBrowserBlob(input.body.browserBlob);
  if (browserBlob) return { ...browserBlob, sourceType: "user_upload" };

  const source = getSource(input.body);
  if (!source) throw new WhiteboardImageAssetError("ASSET_SOURCE_MISSING", "白板图片缺少资源地址");
  if (/^data:image\//i.test(source)) return { ...decodeWhiteboardDataUrl(source), sourceUrl: undefined, sourceType: "user_upload" };

  const globalImage = imageFromGlobalSource(source);
  if (globalImage) return { ...globalImage, sourceUrl: source, sourceType: "user_upload" };
  const projectImage = imageFromProjectSource(input.projectId, source);
  if (projectImage) return { ...projectImage, sourceUrl: source, sourceType: "user_upload" };
  const sessionImage = imageFromSessionSource(input.sessionId, source);
  if (sessionImage) return { ...sessionImage, sourceUrl: source, sourceType: "session_asset" };

  const sessionPrefix = `/api/sessions/${encodeURIComponent(input.sessionId)}/workspace/`;
  const cleanSource = sourcePath(source);
  if (cleanSource.startsWith(sessionPrefix)) {
    const relative = decodeURIComponent(cleanSource.slice(sessionPrefix.length));
    return { buffer: resolveWorkspaceImageFile(input.workspacePath, relative), sourceUrl: source, sourceType: "session_asset" };
  }
  if (cleanSource.startsWith("assets/") || cleanSource.startsWith("/assets/")) {
    return { buffer: resolveWorkspaceImageFile(input.workspacePath, cleanSource), sourceUrl: source, sourceType: "session_asset" };
  }
  if (/^https?:\/\//i.test(source)) {
    const downloaded = await downloadWhiteboardImage(source);
    return { ...downloaded, sourceUrl: source, sourceType: "remote_url" };
  }

  throw new WhiteboardImageAssetError("ASSET_SOURCE_UNSUPPORTED", "无法读取白板图片资源，请重新上传图片");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });

  const body = (await request.json().catch(() => null)) as AssetRequest | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const draftId = typeof body?.draftId === "string" ? body.draftId : "";
  if (!body || !sessionId || !/^[A-Za-z0-9_-]{1,80}$/.test(draftId)) return NextResponse.json(createApiError("INVALID_REQUEST", "白板图片资源参数无效"), { status: 400 });

  collectExpiredWhiteboardImages();

  const meta = sessionExists(sessionId) ? getSessionMeta(sessionId) : null;
  if (!meta || meta.demoId !== projectId || (meta.userId && meta.userId !== user.userId) || isSessionExpired(meta) || !meta.workspaceId) {
    return NextResponse.json(createApiError("FORBIDDEN", "无权处理此白板图片"), { status: 403 });
  }
  const workspacePath = findWorkspacePath(meta.workspaceId);
  if (!workspacePath || !fs.existsSync(workspacePath)) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不存在"), { status: 500 });

  try {
    const sourceImage = await readSourceImage({ body, projectId, sessionId, workspacePath });
    const asset = await normalizeWhiteboardImage({
      ...sourceImage,
      filename: typeof body.nodeId === "string" ? `whiteboard-${body.nodeId}.png` : "whiteboard-image.png",
      createdBy: user.userId,
    });
    if (!claimWhiteboardDraftImage(asset.imageId, draftId)) {
      return NextResponse.json(createApiError("FILE_WRITE_ERROR", "白板图片资源无法登记，请重试"), { status: 500 });
    }
    return NextResponse.json(createApiSuccess({
      imageId: asset.imageId,
      assetRef: asset.imageId,
      url: asset.url,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      sourceMimeType: asset.sourceMimeType,
      sourceWasAnimated: asset.sourceWasAnimated,
      staticFrame: asset.staticFrame,
    }));
  } catch (error) {
    const assetError = error instanceof WhiteboardImageAssetError ? error : null;
    const status = assetError?.code === "ASSET_TOO_LARGE" ? 413 : assetError?.code === "PRIVATE_NETWORK_BLOCKED" ? 403 : 422;
    return NextResponse.json(createApiError("VALIDATION_ERROR", assetError?.message || "白板图片处理失败，请更换图片后重试", {
      code: assetError?.code || "IMAGE_PREPARE_FAILED",
    }), { status });
  }
}
