import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createApiError, createApiSuccess, listDemoPages } from "@/lib/fs-utils";
import { buildConfigPool } from "@/lib/design-specs";
import { resolveDesignSpecContext } from "@/lib/design-specs/route-helpers";
import { getImageInfo } from "@/lib/image-store";

/** GET /api/design-specs/config-pool?workingDir=&sessionId= → 配置项素材池与页面候选 */
export async function GET(request: NextRequest) {
  const resolved = await resolveDesignSpecContext(request);
  if ("response" in resolved) return resolved.response;
  const { workingDir } = resolved.ctx;

  try {
    const projectSchemaPath = path.join(workingDir, "project.config.schema.json");
    const projectSchema = fs.existsSync(projectSchemaPath)
      ? fs.readFileSync(projectSchemaPath, "utf-8")
      : undefined;

    const pages = listDemoPages(workingDir).map((page) => {
      const schemaPath = path.join(workingDir, "demos", page.id, "config.schema.json");
      const schema = fs.existsSync(schemaPath)
        ? fs.readFileSync(schemaPath, "utf-8")
        : "{}";
      return { id: page.id, name: page.name, schema };
    });

    const pool = buildConfigPool(projectSchema, pages, {
      resolveImageSize: (value) => {
        const imageId = getImageStoreId(value);
        if (!imageId) return null;
        const image = getImageInfo(imageId);
        return image ? { width: image.width, height: image.height } : null;
      },
    });
    return NextResponse.json(createApiSuccess({
      pool,
      pages: pages.map(({ id, name }) => ({ id, name })),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", `读取配置项失败: ${message}`),
      { status: 500 },
    );
  }
}

/** 仅解析本应用图床的图片，不能在打开规范页时请求任意外链。 */
function getImageStoreId(value: string): string | null {
  try {
    const pathname = new URL(value, "http://design-spec.local").pathname;
    const match = /^\/api\/images\/(img_[A-Za-z0-9_-]+)\/?$/.exec(pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
