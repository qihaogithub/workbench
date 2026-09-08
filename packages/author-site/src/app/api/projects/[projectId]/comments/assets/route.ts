import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { resolveCommentAuthor } from "@/lib/comment-auth";
import { uploadImage } from "@/lib/image-store";

/** 评论图片上传：登录用户和匿名评论者均可使用。 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!projectId) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "缺少项目 ID"), { status: 400 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(createApiError("INVALID_REQUEST", "缺少 file 字段"), { status: 400 });
    }

    const anonymousId = typeof form.get("anonymousId") === "string" ? String(form.get("anonymousId")) : undefined;
    const displayName = typeof form.get("displayName") === "string" ? String(form.get("displayName")) : undefined;
    const authorResult = await resolveCommentAuthor(request, { anonymousId, displayName });
    if (!authorResult || (authorResult.author.isAnonymous && (!anonymousId?.trim() || !displayName?.trim()))) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId 和 displayName"), { status: 400 });
    }

    const result = await uploadImage({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      sourceType: "user_upload",
      projectId,
      createdBy: authorResult.author.id,
    });
    if (!result.success) {
      if (result.error.code === "ASSET_TOO_LARGE") {
        return NextResponse.json(createApiError("FILE_TOO_LARGE", result.error.message), { status: 413 });
      }
      return NextResponse.json(createApiError("INVALID_FILE_TYPE", result.error.message), { status: 415 });
    }

    return NextResponse.json(createApiSuccess({
      url: result.url,
      imageId: result.imageId,
      filename: result.filename,
      kind: "image" as const,
    }));
  } catch (cause) {
    console.error("评论图片上传失败:", cause);
    return NextResponse.json(createApiError("UPLOAD_FAILED", "图片上传失败"), { status: 500 });
  }
}
