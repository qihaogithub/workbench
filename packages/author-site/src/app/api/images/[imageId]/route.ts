import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { getImage, getImageInfo } from "@/lib/image-store";
import { DATA_DIR } from "@/lib/paths";

const IMAGES_DIR = path.join(DATA_DIR, "images");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { imageId: string } },
) {
  const { imageId } = params;

  if (!imageId) {
    return NextResponse.json({ error: "Missing image ID" }, { status: 400 });
  }

  if (imageId.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const result = getImage(imageId);

  if (result.buffer) {
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType || "application/octet-stream",
        "Content-Length": String(result.sizeBytes),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const filePath = path.resolve(IMAGES_DIR, imageId);
  if (filePath.startsWith(IMAGES_DIR) && fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const buffer = fs.readFileSync(filePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stat.size),
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
