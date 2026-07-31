import { NextRequest, NextResponse } from "next/server";
import { getImageInfo } from "@/lib/image-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { imageId: string } },
) {
  const { imageId } = params;

  if (!imageId) {
    return NextResponse.json(
      { success: false, error: { code: "MISSING_ID", message: "Missing image ID" } },
      { status: 400 },
    );
  }

  if (imageId.includes("..")) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PATH", message: "Invalid path" } },
      { status: 403 },
    );
  }

  const entry = getImageInfo(imageId);
  if (!entry) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Image not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: entry.id,
        filename: entry.filename,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        width: entry.width,
        height: entry.height,
        sourceType: entry.sourceType,
        createdAt: entry.createdAt,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
