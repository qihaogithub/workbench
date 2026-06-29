import { NextRequest, NextResponse } from "next/server";

import {
  isValidPreviewModuleHash,
  readPreviewModule,
} from "@/lib/preview-module-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { hash: string } },
) {
  const hash = params.hash.endsWith(".js")
    ? params.hash.slice(0, -".js".length)
    : params.hash;

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
