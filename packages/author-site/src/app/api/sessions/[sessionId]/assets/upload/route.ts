import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import {
  sessionExists,
  createApiSuccess,
  createApiError,
  getSessionMeta,
  getSessionWorkspacePath,
  listDemoPages,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { uploadImage } from "@/lib/image-store";
import { addProjectImage, type ProjectImage } from "@/lib/project-images";
import { getFileExtension, hasAllowedAssetExtension, isAllowedAssetFile, isSpinePackageFilename, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE } from "./asset-validation";
import { prepareSpineAsset } from "./spine-assets";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import { isValidWorkspacePathSegment } from "@workbench/shared/workspace-path";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import { commitWorkspaceMutation, stageWorkspaceBinary, WorkspaceAuthorityClientError } from "@/lib/workspace-authority-client";

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB


const NON_IMAGE_ANIMATION_EXTS = new Set([".json", ".svga", ".lottie", ".riv", ".skel", ".atlas"]);

function invalidAssetMessage(extension: string, mimeType: string): string {
  if (extension === ".mp4" || extension === ".webm") {
    const format = extension === ".mp4" ? "MP4" : "WebM";
    return `视频内容不是有效的 ${format} 容器，请选择有效的 ${format} 文件`;
  }
  if (extension === ".mp3") {
    return "音频仅支持 MP3 文件（MIME 类型需为 audio/mpeg）";
  }
  return `不支持的文件类型或文件内容: ${mimeType || "未提供 MIME"}`;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object"
    && value !== null
    && typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.arrayBuffer === "function";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const token = await getAuthCookie();
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

    const { sessionId } = await params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError("SESSION_NOT_FOUND"),
        { status: 404 },
      );
    }

    const meta = getSessionMeta(sessionId);
    if (!meta?.userId || meta.userId !== payload.userId) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), { status: 403 });
    }
    const projectId = meta?.demoId;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadFile(file)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "请提供文件"),
        { status: 400 },
      );
    }

    if (!hasAllowedAssetExtension(file.name)) {
      const message = file.type.toLowerCase().startsWith("audio/")
        ? "音频仅支持 MP3 文件（扩展名需为 .mp3）"
        : `不支持的文件类型: ${file.type}`;
      return NextResponse.json(
        createApiError("INVALID_FILE_TYPE", message),
        { status: 400 },
      );
    }

    const ext = getFileExtension(file.name);
    const maxSize = ext === ".mp4" || ext === ".webm"
      ? MAX_VIDEO_SIZE
      : ext === ".mp3"
        ? MAX_AUDIO_SIZE
        : DEFAULT_MAX_SIZE;
    if (file.size > maxSize) {
      const label = ext === ".mp3" ? "音频文件" : "文件";
      return NextResponse.json(
        createApiError("FILE_TOO_LARGE", `${label}大小超过 ${maxSize / 1024 / 1024}MB 限制`),
        { status: 413 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!isAllowedAssetFile(file, buffer)) {
      return NextResponse.json(
        createApiError("INVALID_FILE_TYPE", invalidAssetMessage(ext, file.type)),
        { status: 400 },
      );
    }

    if (ext === ".mp4" || ext === ".webm") {
      const workspacePath = getSessionWorkspacePath(sessionId);
      if (!workspacePath) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND", "会话工作区不存在"), { status: 404 });
      }
      const stamp = Date.now().toString(36);
      const destDir = path.join(workspacePath, "assets", "videos", stamp);
      fs.mkdirSync(destDir, { recursive: true });
      const filename = path.basename(file.name);
      fs.writeFileSync(path.join(destDir, filename), buffer);
      const url = `/api/sessions/${sessionId}/workspace/assets/videos/${stamp}/${filename}`;
      return NextResponse.json(createApiSuccess({ url, filename, size: file.size, mimeType: file.type }));
    }

    if (ext === ".mp3") {
      const workspacePath = getSessionWorkspacePath(sessionId);
      if (!workspacePath) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND", "会话工作区不存在"), { status: 404 });
      }
      const stamp = Date.now().toString(36);
      const destDir = path.join(workspacePath, "assets", "audio", stamp);
      fs.mkdirSync(destDir, { recursive: true });
      const filename = path.basename(file.name);
      fs.writeFileSync(path.join(destDir, filename), buffer);
      const url = `/api/sessions/${sessionId}/workspace/assets/audio/${stamp}/${filename}`;
      return NextResponse.json(createApiSuccess({ url, filename, size: file.size, mimeType: file.type || "audio/mpeg" }));
    }

    if (isSpinePackageFilename(file.name)) {
      if (formData.get("assetKind") !== "spine") {
        return NextResponse.json(createApiError("INVALID_REQUEST", "ZIP 上传必须声明 assetKind=spine"), { status: 400 });
      }
      const workspacePath = getSessionWorkspacePath(sessionId);
      if (!workspacePath || !projectId || !meta?.workspaceId) {
        return NextResponse.json(
          createApiError("SESSION_NOT_FOUND", "会话工作区不存在"),
          { status: 404 },
        );
      }
      try {
        if (!isLiveWorkspacePath(workspacePath)) throw new Error("WORKSPACE_AUTHORITY_REQUIRED");
        const asset = await prepareSpineAsset(buffer, file.name);
        const stagedFiles = await Promise.all(asset.files.map(async (fileEntry) => ({
          fileEntry,
          staged: await stageWorkspaceBinary({
            projectId,
            workspaceId: meta.workspaceId!,
            sessionId,
            content: fileEntry.content,
          }),
        })));
        const manifest = Buffer.from(JSON.stringify(asset.manifest, null, 2) + "\n", "utf8");
        const stagedManifest = await stageWorkspaceBinary({
          projectId,
          workspaceId: meta.workspaceId!,
          sessionId,
          content: manifest,
        });
        const prefix = `assets/animations/${asset.ref.assetId}`;
        const operations: WorkspaceMutationOperation[] = [
          ...stagedFiles.map(({ fileEntry, staged }) => ({
            type: "put_binary" as const,
            path: `${prefix}/${fileEntry.path}`,
            stagingId: staged.stagingId,
            hash: staged.hash,
            size: staged.size,
          })),
          { type: "put_binary", path: `${prefix}/manifest.json`, stagingId: stagedManifest.stagingId, hash: stagedManifest.hash, size: stagedManifest.size },
        ];
        const pageId = formData.get("pageId");
        const contextPageId = formData.get("contextPageId");
        const configKey = formData.get("configKey");
        const configScope = formData.get("configScope");
        const configPath = configScope === "project"
          ? "project.config.values.json"
          : configScope === "page" && typeof pageId === "string" && isValidWorkspacePathSegment(pageId)
            ? `demos/${pageId}/config.values.json`
            : null;
        if (configPath) {
          const contextId = configScope === "page"
            ? (typeof pageId === "string" ? pageId : undefined)
            : (typeof contextPageId === "string" ? contextPageId : undefined);
          if (!contextId) {
            return NextResponse.json(
              createApiError("CONFIG_READONLY", "配置上传需要页面上下文"),
              { status: 403 },
            );
          }
          if (contextId) {
            const contextPage = listDemoPages(workspacePath).find(
              (page) => page.id === contextId,
            );
            if (
              !contextPage ||
              contextPage.reference ||
              (contextPage.isTemplatePage && payload.role !== "admin")
            ) {
              return NextResponse.json(
                createApiError(
                  "CONFIG_READONLY",
                  !contextPage
                    ? "页面配置元数据不存在"
                    : contextPage.reference
                      ? "引用页面的配置不可编辑"
                      : "普通编辑者不能编辑模板页面配置",
                ),
                { status: 403 },
              );
            }
          }
        }
        let configCommitted = false;
        if (configPath && typeof configKey === "string" && /^[A-Za-z0-9_-]+$/.test(configKey)) {
          operations.push({
            type: "patch_config_values",
            path: configPath,
            patch: { [configKey]: asset.ref },
          });
          configCommitted = true;
        }
        const receipt = await commitWorkspaceMutation({
          mutationId: crypto.randomUUID(), projectId, workspaceId: meta.workspaceId, sessionId,
          baseRevision: 0, actor: "author-site", reason: "commit_spine_asset", operations,
        });
        return NextResponse.json(createApiSuccess({ ref: asset.ref, summary: asset.summary, receipt, configCommitted }));
      } catch (error) {
        if (error instanceof WorkspaceAuthorityClientError) {
          return NextResponse.json(
            createApiError("FILE_WRITE_ERROR", error.message, { authorityCode: error.code }),
            { status: error.status },
          );
        }
        const reason = error instanceof WorkspaceAuthorityClientError ? error.code : error instanceof Error ? error.message : "INVALID_ZIP";
        const status = reason === "ZIP_TOO_LARGE" || reason === "ZIP_UNCOMPRESSED_TOO_LARGE" || reason === "TOO_MANY_ZIP_ENTRIES" ? 413 : 400;
        return NextResponse.json(createApiError("INVALID_FILE_TYPE", `Spine 素材包无效: ${reason}`), { status });
      }
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
