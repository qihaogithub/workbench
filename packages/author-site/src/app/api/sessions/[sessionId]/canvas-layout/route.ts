import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getSessionMeta,
  getSessionPath,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import type {
  CanvasFreeNode,
  CanvasPageLayout,
  CanvasState,
} from "@opencode-workbench/shared/demo";

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

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseCanvasNode(value: unknown): CanvasFreeNode | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const kind = readString(value, "kind");
  const title = readString(value, "title");
  const layout = parseLayout(value.layout);
  const createdAt = readNumber(value, "createdAt");
  const updatedAt = readNumber(value, "updatedAt");

  if (!id || !kind || !title || !layout || createdAt === null || updatedAt === null) {
    return null;
  }

  const base = { id, title, layout, createdAt, updatedAt };

  if (kind === "document") {
    const markdown = readString(value, "markdown");
    if (markdown === null) return null;
    return { ...base, kind, markdown };
  }

  if (kind === "image") {
    const src = readString(value, "src");
    const fileName = readString(value, "fileName");
    const intrinsicWidth = readNumber(value, "intrinsicWidth");
    const intrinsicHeight = readNumber(value, "intrinsicHeight");
    if (!src) return null;
    return {
      ...base,
      kind,
      src,
      ...(fileName ? { fileName } : {}),
      ...(intrinsicWidth !== null && intrinsicHeight !== null
        ? { intrinsicWidth, intrinsicHeight }
        : {}),
    };
  }

  return null;
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

  let nodes: Record<string, CanvasFreeNode> | undefined;
  if (isRecord(value.nodes)) {
    nodes = {};
    for (const [nodeId, nodeValue] of Object.entries(value.nodes)) {
      if (isRecord(nodeValue) && readString(nodeValue, "kind") === "webpage") {
        continue;
      }
      const node = parseCanvasNode(nodeValue);
      if (!node || node.id !== nodeId) return null;
      nodes[nodeId] = node;
    }
  }

  return {
    viewport: {
      x: viewportX,
      y: viewportY,
      zoom,
    },
    pages,
    ...(nodes ? { nodes } : {}),
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

  const workspacePath = meta.workspaceId
    ? findWorkspacePath(meta.workspaceId) ?? undefined
    : undefined;

  return { sessionPath: getSessionPath(sessionId), workspacePath };
}

function getCanvasLayoutPath(sessionPath: string): string {
  return path.join(sessionPath, ".canvas-layout.json");
}

function getCanvasLayoutPaths(access: {
  sessionPath: string;
  workspacePath?: string;
}): string[] {
  const paths = [
    access.workspacePath ? getCanvasLayoutPath(access.workspacePath) : null,
    getCanvasLayoutPath(access.sessionPath),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(paths));
}

function readStoredCanvasLayout(layoutPath: string): {
  state: CanvasState;
  updatedAt?: number;
} | null {
  const parsed = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as unknown;
  if (!isRecord(parsed)) return null;

  const state = parseCanvasState(parsed.state);
  if (!state) return null;

  return {
    state,
    updatedAt:
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const access = await validateSessionAccess(params.sessionId);
    if (access.response) return access.response;

    let stored: { state: CanvasState; updatedAt?: number } | null = null;
    for (const layoutPath of getCanvasLayoutPaths(access)) {
      if (!fs.existsSync(layoutPath)) continue;
      const candidate = readStoredCanvasLayout(layoutPath);
      if (!candidate) continue;
      if (!stored || (candidate.updatedAt ?? 0) > (stored.updatedAt ?? 0)) {
        stored = candidate;
      }
    }

    if (!stored) {
      return NextResponse.json(createApiSuccess({ state: null }));
    }

    return NextResponse.json(
      createApiSuccess({
        state: stored.state,
        updatedAt: stored.updatedAt,
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

    for (const layoutPath of getCanvasLayoutPaths(access)) {
      fs.writeFileSync(layoutPath, JSON.stringify(stored, null, 2), "utf-8");
    }

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
