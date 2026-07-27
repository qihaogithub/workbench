import { NextRequest, NextResponse } from "next/server";
import { getProjectImages } from "@/lib/project-images";
import { getImage } from "@/lib/image-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; path: string[] } },
) {
  const { projectId, path: pathSegments } = params;

  if (!projectId || !pathSegments?.length) {
    return NextResponse.json(
      { error: "Missing project ID or path" },
      { status: 400 },
    );
  }

  const fullPath = pathSegments.join("/");
  const filename = pathSegments[pathSegments.length - 1];

  if (filename.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const images = getProjectImages(projectId);
  const image = images.find(
    (img) => img.filename === filename || img.filename.endsWith("/" + filename),
  );

  if (!image) {
    const altImage = images.find((img) => img.filename === fullPath);
    if (!altImage) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 },
      );
    }
    return serveImage(altImage);
  }

  return serveImage(image);
}

function serveImage(image: {
  url: string;
  mimeType?: string;
  filename: string;
}) {
  const imageIdMatch = image.url.match(/\/api\/images\/(.+?)(\?|$)/);
  if (imageIdMatch) {
    const imageId = imageIdMatch[1];
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
  }

  return NextResponse.json(
    { error: "Image not found in global store" },
    { status: 404 },
  );
}
