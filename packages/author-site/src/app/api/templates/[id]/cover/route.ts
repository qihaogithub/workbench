import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getProjectAdminService, projectAdminResponse } from "@/lib/project-admin-service";

const THUMBNAILS_DIR = path.join(process.cwd(), "public", "thumbnails");
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function ensureThumbnailsDir(): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

function deleteExistingCover(templateId: string): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) return;

  for (const file of fs.readdirSync(THUMBNAILS_DIR)) {
    if (file.startsWith(`${templateId}_cover.`)) {
      fs.unlinkSync(path.join(THUMBNAILS_DIR, file));
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const service = getProjectAdminService();
    const template = service.getTemplate(params.id);
    if (!template.ok) return projectAdminResponse(template);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "请选择要上传的图片文件"),
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        createApiError("INVALID_FILE_TYPE", "仅支持 JPG、PNG、WebP 格式的图片"),
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        createApiError("FILE_TOO_LARGE", "图片大小不能超过 5MB"),
        { status: 400 },
      );
    }

    const ext =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";

    ensureThumbnailsDir();
    deleteExistingCover(params.id);

    const filename = `${params.id}_cover.${ext}`;
    fs.writeFileSync(
      path.join(THUMBNAILS_DIR, filename),
      Buffer.from(await file.arrayBuffer()),
    );

    const thumbnail = `/thumbnails/${filename}`;
    const result = service.updateTemplateMeta(params.id, { thumbnail });
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess({ thumbnail }));
  } catch (error) {
    console.error("Error uploading template cover:", error);
    return NextResponse.json(
      createApiError("COVER_UPLOAD_FAILED", "封面图上传失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const service = getProjectAdminService();
    const template = service.getTemplate(params.id);
    if (!template.ok) return projectAdminResponse(template);

    deleteExistingCover(params.id);
    const result = service.updateTemplateMeta(params.id, { thumbnail: undefined });
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess({ thumbnail: null }));
  } catch (error) {
    console.error("Error deleting template cover:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除封面图失败"),
      { status: 500 },
    );
  }
}
