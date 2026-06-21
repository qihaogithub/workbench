import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  createApiError,
  createApiSuccess,
  getSessionMeta,
  getSessionPath,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import type { CanvasPageLayout, CanvasState } from "@opencode-workbench/shared/demo";

interface StoredCanvasLayout {
  version: 1;
  projectId?: string;
  updatedAt: number;
  state: CanvasState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLayout(value: unknown): CanvasPageLayout | null {
  if (!isRecord(value)) return null;

  const x = readNumber(value, "x");
  const y = readNumber(value, "y");
  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  const zIndex = readNumber(value, "zIndex");

  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    ...(zIndex === null ? {} : { zIndex }),
  };
}

function parseCanvasState(value: unknown): CanvasState | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.viewport) || !isRecord(value.pages)) return null;

  const viewportX = readNumber(value.viewport, "x");
  const viewportY = readNumber(value.viewport, "y");
  const zoom = readNumber(value.viewport, "zoom");

  if (viewportX === null || viewportY === null || zoom === null || zoom <= 0) {
    return null;
  }

  const pages: Record<string, CanvasPageLayout> = {};
  for (const [pageId, layoutValue] of Object.entries(value.pages)) {
    const layout = parseLayout(layoutValue);
    if (!layout) return null;
    pages[pageId] = layout;
  }

  return {
    viewport: {
      x: viewportX,
      y: viewportY,
      zoom,
    },
    pages,
  };
}

async function validateSessionAccess(sessionId: string) {
  const token = getAuthCookie();
  if (!token) {
    return {
      response: NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      }),
    };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return {
      response: NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      }),
    };
  }

  if (!sessionExists(sessionId)) {
    return {
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  }

  const meta = getSessionMeta(sessionId);
  if (!meta) {
    return {
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  }

  if (meta.userId && meta.userId !== payload.userId) {
    return {
      response: NextResponse.json(
        createApiError("FORBIDDEN", "无权访问其他用户的 Session"),
        { status: 403 },
      ),
    };
  }

  return { sessionPath: getSessionPath(sessionId) };
}

function getCanvasLayoutPath(sessionPath: string): string {
  return path.join(sessionPath, ".canvas-layout.json");
}

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const access = await validateSessionAccess(params.sessionId);
    if (access.response) return access.response;

    const layoutPath = getCanvasLayoutPath(access.sessionPath);
    if (!fs.existsSync(layoutPath)) {
      return NextResponse.json(createApiSuccess({ state: null }));
    }

    const parsed = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as unknown;
    if (!isRecord(parsed)) {
      return NextResponse.json(createApiSuccess({ state: null }));
    }

    const state = parseCanvasState(parsed.state);
    return NextResponse.json(
      createApiSuccess({
        state,
        updatedAt:
          typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
      }),
    );
  } catch (error) {
    console.error("Error loading canvas layout:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取画布布局失败"),
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const access = await validateSessionAccess(params.sessionId);
    if (access.response) return access.response;

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json(createApiError("INVALID_REQUEST", "请求体无效"), {
        status: 400,
      });
    }

    const state = parseCanvasState(body.state);
    if (!state) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "画布布局数据无效"),
        { status: 400 },
      );
    }

    const projectId =
      typeof body.projectId === "string" && body.projectId
        ? body.projectId
        : undefined;
    const stored: StoredCanvasLayout = {
      version: 1,
      projectId,
      updatedAt: Date.now(),
      state,
    };

    fs.writeFileSync(
      getCanvasLayoutPath(access.sessionPath),
      JSON.stringify(stored, null, 2),
      "utf-8",
    );

    return NextResponse.json(
      createApiSuccess({
        state,
        updatedAt: stored.updatedAt,
      }),
    );
  } catch (error) {
    console.error("Error saving canvas layout:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "保存画布布局失败"),
      { status: 500 },
    );
  }
}
