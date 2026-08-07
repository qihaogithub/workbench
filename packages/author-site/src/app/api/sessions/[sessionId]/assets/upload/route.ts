import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import {
  sessionExists,
  createApiSuccess,
  createApiError,
  getSessionMeta,
  getSessionWorkspacePath,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { uploadImage } from "@/lib/image-store";
import { addProjectImage, type ProjectImage } from "@/lib/project-images";
import { selectSpinePackage, ANIMATION_ASSET_EXTS } from "./extract-spine-package";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".svga",
  ".lottie",
  ".riv",
  ".json",
  ".skel",
  ".atlas",
  ".zip",
]);

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB

const OCTET_STREAM_EXTENSIONS = new Set([".svga", ".lottie", ".riv", ".skel", ".atlas"]);

const ZIP_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-compressed",
]);

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return filename.slice(dotIndex).toLowerCase();
}

function isAllowedAssetFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  if (ext === ".json") {
    return file.type === "" || file.type === "application/json";
  }
  if (ext === ".zip") {
    return ZIP_MIME_TYPES.has(file.type);
  }
  if (OCTET_STREAM_EXTENSIONS.has(ext)) {
    return file.type === "" || file.type === "application/octet-stream";
  }
  return ALLOWED_MIME_TYPES.includes(file.type);
}

const NON_IMAGE_ANIMATION_EXTS = new Set([".json", ".svga", ".lottie", ".riv", ".skel", ".atlas"]);

async function extractZipToWorkspace(
  buffer: Buffer,
  workspacePath: string,
  sessionId: string,
): Promise<{ skeleton: string; atlas: string; texture: string } | null> {
  const stamp = Date.now().toString(36);
  const destDir = path.join(workspacePath, "assets", "animations", stamp);
  fs.mkdirSync(destDir, { recursive: true });

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      const files: Record<string, string> = {};
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const entryName = entry.fileName;
        if (/\/$/.test(entryName)) { zipfile.readEntry(); return; }
        const normalized = path.normalize(entryName);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
          zipfile.readEntry(); return;
        }
        const ext = path.extname(entryName).toLowerCase();
        if (!ANIMATION_ASSET_EXTS.has(ext)) { zipfile.readEntry(); return; }
        zipfile.openReadStream(entry, (openErr, readStream) => {
          if (openErr) { zipfile.readEntry(); return; }
          const chunks: Buffer[] = [];
          readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          readStream.on("end", () => {
            const destPath = path.join(destDir, path.basename(entryName));
            fs.writeFileSync(destPath, Buffer.concat(chunks));
            files[path.basename(entryName)] = destPath;
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => {
        let selected: { skeleton: string; atlas: string; texture: string } | null = null;
        try {
          selected = selectSpinePackage(files);
        } catch {}

        if (!selected) {
          try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
          return resolve(null);
        }
        const basePath = `/api/sessions/${sessionId}/workspace/assets/animations/${stamp}`;
        resolve({
          skeleton: `${basePath}/${path.basename(selected.skeleton)}`,
          atlas: `${basePath}/${path.basename(selected.atlas)}`,
          texture: `${basePath}/${path.basename(selected.texture)}`,
        });
      });
      zipfile.on("error", reject);
    });
  });
}

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError("SESSION_NOT_FOUND"),
        { status: 404 },
      );
    }

    const meta = getSessionMeta(sessionId);
    const projectId = meta?.demoId;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "请提供文件"),
        { status: 400 },
      );
    }

    if (!isAllowedAssetFile(file)) {
      return NextResponse.json(
        createApiError("INVALID_FILE_TYPE", `不支持的文件类型: ${file.type}`),
        { status: 400 },
      );
    }

    if (file.size > DEFAULT_MAX_SIZE) {
      return NextResponse.json(
        createApiError("FILE_TOO_LARGE", `文件大小超过 ${DEFAULT_MAX_SIZE / 1024 / 1024}MB 限制`),
        { status: 413 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = getFileExtension(file.name);

    if (ext === ".zip") {
      const workspacePath = getSessionWorkspacePath(sessionId);
      if (!workspacePath) {
        return NextResponse.json(
          createApiError("SESSION_NOT_FOUND", "会话工作区不存在"),
          { status: 404 },
        );
      }
      const spineFiles = await extractZipToWorkspace(buffer, workspacePath, sessionId);
      if (!spineFiles) {
        return NextResponse.json(
          createApiError("INVALID_FILE_TYPE", "ZIP 包内未找到 Spine 动画文件（需要 .skel/.json + .atlas + .png）"),
          { status: 400 },
        );
      }
      return NextResponse.json(createApiSuccess(spineFiles));
    }

    if (NON_IMAGE_ANIMATION_EXTS.has(ext)) {
      const workspacePath = getSessionWorkspacePath(sessionId);
      if (!workspacePath) {
        return NextResponse.json(
          createApiError("SESSION_NOT_FOUND", "会话工作区不存在"),
          { status: 404 },
        );
      }
      const stamp = Date.now().toString(36);
      const destDir = path.join(workspacePath, "assets", "animations", stamp);
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, path.basename(file.name));
      fs.writeFileSync(destPath, buffer);
      const url = `/api/sessions/${sessionId}/workspace/assets/animations/${stamp}/${path.basename(file.name)}`;
      return NextResponse.json(createApiSuccess({ url }));
    }

    const result = await uploadImage({
      buffer,
      filename: file.name,
      sourceType: "user_upload",
      projectId,
      createdBy: payload.userId,
    });

    if (!result.success) {
      return NextResponse.json(
        createApiError("UPLOAD_FAILED", result.error.message),
        { status: 500 },
      );
    }

    if (projectId) {
      const projectImage: ProjectImage = {
        id: result.sha256.slice(0, 12),
        filename: result.filename,
        url: result.url,
        size: result.sizeBytes,
        format: result.filename.split(".").pop() || "png",
        createdAt: Date.now(),
        createdBy: "user",
        width: result.width,
        height: result.height,
        contentHash: result.sha256,
        mimeType: result.mimeType,
        sourceType: "upload",
      };
      try {
        addProjectImage(projectId, projectImage);
      } catch (manifestError) {
        console.error("Failed to update project image manifest:", manifestError);
      }
    }

    return NextResponse.json(
      createApiSuccess({
        url: result.url,
        imageId: result.imageId,
        filename: result.filename,
        size: result.sizeBytes,
        mimeType: result.mimeType,
      }),
    );
  } catch (error) {
    console.error("Error uploading asset:", error);
    return NextResponse.json(
      createApiError("UPLOAD_FAILED", "文件上传失败"),
      { status: 500 },
    );
  }
}
