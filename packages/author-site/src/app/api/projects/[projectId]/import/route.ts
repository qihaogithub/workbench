import { NextRequest, NextResponse } from "next/server";

import {
  ProjectTransferError,
  importProjectArchive,
} from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess, getDataDir } from "@/lib/fs-utils";

const DEFAULT_IMPORT_MAX_BYTES = 100 * 1024 * 1024;

function getImportMaxBytes(): number {
  const configured = Number(process.env.SYNC_IMPORT_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_IMPORT_MAX_BYTES;
}

async function isAuthenticated(): Promise<boolean> {
  const token = getAuthCookie();
  return Boolean(token && (await verifyToken(token)));
}

async function readArchive(request: NextRequest, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ProjectTransferError(
      "ARCHIVE_INVALID",
      `归档超过大小上限 ${maxBytes} bytes`,
    );
  }

  if (!request.body) {
    throw new ProjectTransferError("ARCHIVE_INVALID", "请求体为空");
  }
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ProjectTransferError(
        "ARCHIVE_INVALID",
        `归档超过大小上限 ${maxBytes} bytes`,
      );
    }
    chunks.push(Buffer.from(value));
  }
  if (total === 0) {
    throw new ProjectTransferError("ARCHIVE_INVALID", "请求体为空");
  }
  return Buffer.concat(chunks, total);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/gzip") {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "Content-Type 必须为 application/gzip"),
      { status: 415 },
    );
  }

  try {
    const archive = await readArchive(request, getImportMaxBytes());
    const result = await importProjectArchive(
      getDataDir(),
      params.projectId,
      archive,
    );
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof ProjectTransferError) {
      const status = error.code === "PROJECT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(createApiError(error.code, error.message), {
        status,
      });
    }
    console.error("导入项目失败:", error);
    return NextResponse.json(
      createApiError("PROJECT_IMPORT_FAILED", "导入项目失败"),
      { status: 500 },
    );
  }
}
