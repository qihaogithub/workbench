import { NextRequest, NextResponse } from "next/server";

import {
  isValidPreviewModuleHash,
  readPreviewModule,
} from "@/lib/preview-module-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash: requestedHash } = await params;
  const hash = requestedHash.endsWith(".js")
    ? requestedHash.slice(0, -".js".length)
    : requestedHash;

  if (!isValidPreviewModuleHash(hash)) {
    return new NextResponse("Invalid preview module hash", { status: 400 });
  }

  const code = readPreviewModule(hash);
  if (!code) {
    return new NextResponse("Preview module not found", { status: 404 });
  }

  return new NextResponse(code, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
