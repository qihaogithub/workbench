import { NextRequest } from "next/server";

import {
  getLocalScreenshotMetadata,
  isSafeScreenshotIdentifier,
} from "@/lib/screenshot-file-store";

const MAX_BATCH_ITEMS = 500;

interface ScreenshotMetadataItemInput {
  projectId: string;
  pageId: string;
}

function invalidRequest(message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "INVALID_SCREENSHOT_METADATA_BATCH", message },
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
  } | null;
  if (!body || !Array.isArray(body.items)) {
    return invalidRequest("items 必须是数组");
  }
  if (body.items.length > MAX_BATCH_ITEMS) {
    return invalidRequest(`单次最多读取 ${MAX_BATCH_ITEMS} 项截图元数据`);
  }

  const items = body.items as ScreenshotMetadataItemInput[];
  if (
    items.some(
      (item) =>
        !item ||
        !isSafeScreenshotIdentifier(item.projectId) ||
        !isSafeScreenshotIdentifier(item.pageId),
    )
  ) {
    return invalidRequest("projectId 或 pageId 非法");
  }

  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = `${item.projectId}\0${item.pageId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        items: uniqueItems.map((item) => {
          const metadata = getLocalScreenshotMetadata(
            item.projectId,
            item.pageId,
          );
          return metadata
            ? { ...item, available: true, ...metadata }
            : { ...item, available: false };
        }),
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
