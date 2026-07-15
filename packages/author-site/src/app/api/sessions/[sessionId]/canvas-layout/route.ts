import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getProjectPath,
  getSessionMeta,
  getSessionPath,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isLiveWorkspace } from "@/lib/workspace-manager";
import { getServerAgentServiceUrl } from "@/lib/runtime-config";
import {
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";
import { normalizeCanvasStateLayers } from "@workbench/demo-ui";
import type {
  CanvasDocumentEntry,
  CanvasFreeNode,
  CanvasLayersState,
  CanvasPageLayout,
  CanvasPageGroup,
  CanvasState,
} from "@workbench/demo-ui";

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
  const sizeMode =
    value.sizeMode === "preview" || value.sizeMode === "custom"
      ? value.sizeMode
      : undefined;
  const previewSizeKey =
    typeof value.previewSizeKey === "string" ? value.previewSizeKey : null;

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
    ...(sizeMode ? { sizeMode } : {}),
    ...(previewSizeKey ? { previewSizeKey } : {}),
  };
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = record[key];
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : null;
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
    const knowledgeDocument = parseKnowledgeDocument(value.knowledgeDocument);
    const documents = parseCanvasDocumentEntries(value.documents);
    const activeDocumentId = readString(value, "activeDocumentId");
    const collapsed = readBoolean(value, "collapsed");
    const expandedHeight = readNumber(value, "expandedHeight");
    if (markdown === null && !knowledgeDocument && documents.length === 0) {
      return null;
    }
    return {
      ...base,
      kind,
      ...(markdown === null ? {} : { markdown }),
      ...(knowledgeDocument ? { knowledgeDocument } : {}),
      ...(documents.length > 0 ? { documents } : {}),
      ...(activeDocumentId ? { activeDocumentId } : {}),
      ...(collapsed === null ? {} : { collapsed }),
      ...(expandedHeight === null ? {} : { expandedHeight }),
    };
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

  if (kind === "text") {
    const text = readString(value, "text");
    const fontSize = readNumber(value, "fontSize");
    const color = readString(value, "color");
    const backgroundColor = readString(value, "backgroundColor");
    if (!text || fontSize === null || fontSize <= 0 || !color) return null;
    return {
      ...base,
      kind,
      text,
      fontSize,
      color,
      ...(backgroundColor ? { backgroundColor } : {}),
    };
  }

  return null;
}

function parseCanvasDocumentEntries(value: unknown): CanvasDocumentEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CanvasDocumentEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) return [];
    const id = readString(item, "id");
    const title = readString(item, "title");
    const knowledgeDocument = parseKnowledgeDocument(item.knowledgeDocument);
    if (!id || !title || !knowledgeDocument) return [];
    entries.push({ id, title, knowledgeDocument });
  }
  return entries;
}

function parseCanvasPageGroupEntries(
  value: unknown,
): CanvasPageGroup["pages"] {
  if (!Array.isArray(value)) return [];
  const entries: CanvasPageGroup["pages"] = [];
  for (const item of value) {
    if (!isRecord(item)) return [];
    const id = readString(item, "id");
    const pageId = readString(item, "pageId");
    const title = readString(item, "title");
    if (!id || !pageId || !title) return [];
    entries.push({ id, pageId, title });
  }
  return entries;
}

function parseCanvasPageGroups(
  value: unknown,
): Record<string, CanvasPageGroup> | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;

  const groups: Record<string, CanvasPageGroup> = {};
  for (const [groupId, groupValue] of Object.entries(value)) {
    if (!isRecord(groupValue)) return null;
    const id = readString(groupValue, "id");
    const kind = readString(groupValue, "kind");
    const title = readString(groupValue, "title");
    const activePageId = readString(groupValue, "activePageId");
    const layout = parseLayout(groupValue.layout);
    const createdAt = readNumber(groupValue, "createdAt");
    const updatedAt = readNumber(groupValue, "updatedAt");
    const directoryCollapsed =
      typeof groupValue.directoryCollapsed === "boolean"
        ? groupValue.directoryCollapsed
        : undefined;
    const groupPages = parseCanvasPageGroupEntries(groupValue.pages);

    if (
      !id ||
      id !== groupId ||
      kind !== "page-group" ||
      !title ||
      !activePageId ||
      !layout ||
      createdAt === null ||
      updatedAt === null ||
      groupPages.length === 0
    ) {
      return null;
    }

    groups[groupId] = {
      id,
      kind,
      title,
      pages: groupPages,
      activePageId,
      layout,
      ...(directoryCollapsed === undefined ? {} : { directoryCollapsed }),
      createdAt,
      updatedAt,
    };
  }
  return groups;
}

function parseCanvasLayers(value: unknown): CanvasLayersState | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;

  let annotationNodes: Record<string, CanvasFreeNode> | undefined;
  if (isRecord(value.annotations) && isRecord(value.annotations.nodes)) {
    annotationNodes = {};
    for (const [nodeId, nodeValue] of Object.entries(value.annotations.nodes)) {
      const node = parseCanvasNode(nodeValue);
      if (!node || node.id !== nodeId) return null;
      annotationNodes[nodeId] = node;
    }
  }

  return {
    ...(annotationNodes ? { annotations: { nodes: annotationNodes } } : {}),
  };
}

function parseKnowledgeDocument(value: unknown):
  | {
      id: string;
      title: string;
      fileName: string;
      description?: string;
    }
  | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const title = readString(value, "title");
  const fileName = readString(value, "fileName");
  const description = readString(value, "description");

  if (!id || !title || !fileName) return null;

  return {
    id,
    title,
    fileName,
    ...(description ? { description } : {}),
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

  const layers = parseCanvasLayers(value.layers);
  if (layers === null) return null;

  const hiddenKnowledgeDocumentIds =
    readStringArray(value, "hiddenKnowledgeDocumentIds") ?? undefined;
  const hiddenPageIds = readStringArray(value, "hiddenPageIds") ?? undefined;
  const pageGroups = parseCanvasPageGroups(value.pageGroups);
  if (pageGroups === null) return null;

  return normalizeCanvasStateLayers({
    viewport: {
      x: viewportX,
      y: viewportY,
      zoom,
    },
    pages,
    ...(pageGroups ? { pageGroups } : {}),
    ...(hiddenPageIds ? { hiddenPageIds } : {}),
    ...(nodes ? { nodes } : {}),
    ...(layers ? { layers } : {}),
    ...(hiddenKnowledgeDocumentIds ? { hiddenKnowledgeDocumentIds } : {}),
  });
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

  return {
    sessionPath: getSessionPath(sessionId),
    workspacePath,
    workspaceId: meta.workspaceId,
    projectId: meta.demoId,
  };
}

function getCanvasLayoutPath(sessionPath: string): string {
  return path.join(sessionPath, ".canvas-layout.json");
}

function getProjectWorkspacePath(projectId?: string): string | undefined {
  if (!projectId || !projectExists(projectId)) return undefined;
  return path.join(getProjectPath(projectId), "workspace");
}

function getCanvasLayoutPaths(access: {
  sessionPath: string;
  workspacePath?: string;
  projectId?: string;
}): string[] {
  const projectWorkspacePath = getProjectWorkspacePath(access.projectId);
  const paths = [
    projectWorkspacePath ? getCanvasLayoutPath(projectWorkspacePath) : null,
    access.workspacePath ? getCanvasLayoutPath(access.workspacePath) : null,
    getCanvasLayoutPath(access.sessionPath),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(paths));
}

function parseJsonDocuments(content: string): unknown[] {
  const documents: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (start === -1) {
      if (/\s/.test(char)) continue;
      if (char !== "{" && char !== "[") return [];
      start = i;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        const segment = content.slice(start, i + 1);
        try {
          documents.push(JSON.parse(segment));
        } catch {
          // Ignore invalid recovered segments and keep scanning.
        }
        start = -1;
      }
    }
  }

  return documents;
}

function parseStoredCanvasLayoutContent(content: string): unknown[] {
  try {
    return [JSON.parse(content)];
  } catch {
    return parseJsonDocuments(content);
  }
}

function readStoredCanvasLayout(layoutPath: string): {
  state: CanvasState;
  updatedAt?: number;
} | null {
  const candidates = parseStoredCanvasLayoutContent(
    fs.readFileSync(layoutPath, "utf-8"),
  );
  let recovered: { state: CanvasState; updatedAt?: number } | null = null;

  for (const parsed of candidates) {
    if (!isRecord(parsed)) continue;
    const state = parseCanvasState(parsed.state);
    if (!state) continue;
    const candidate = {
      state,
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
    };
    if (!recovered || (candidate.updatedAt ?? 0) > (recovered.updatedAt ?? 0)) {
      recovered = candidate;
    }
  }

  return recovered;
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
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

    const content = JSON.stringify(stored, null, 2);
    let receipt;
    if (
      access.workspacePath &&
      access.workspaceId &&
      access.projectId &&
      isLiveWorkspace(access.workspaceId)
    ) {
      // Yjs-First: write through collab room — this IS the write, no need to
      // flush first or read expectedHash from disk.
      const agentServiceUrl = getServerAgentServiceUrl();
      const writeResponse = await fetch(
        `${agentServiceUrl}/api/collab/projects/${encodeURIComponent(access.projectId!)}` +
        `/workspaces/${encodeURIComponent(access.workspaceId!)}/write` +
        `?sessionId=${encodeURIComponent(params.sessionId)}` +
        `&resourcePath=${encodeURIComponent(".canvas-layout.json")}` +
        `&kind=canvas-layout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!writeResponse.ok) {
        const errorBody = await writeResponse.json().catch(() => ({}));
        throw new WorkspaceAuthorityClientError(
          errorBody.error?.code || "WORKSPACE_MUTATION_FAILED",
          errorBody.error?.message || "Yjs room write failed",
          writeResponse.status,
        );
      }
      const writeData = await writeResponse.json();
      receipt = writeData.data;
    } else if (access.workspacePath) {
      const workspaceLayoutPath = getCanvasLayoutPath(access.workspacePath);
      fs.mkdirSync(path.dirname(workspaceLayoutPath), { recursive: true });
      writeJsonFileAtomic(workspaceLayoutPath, stored);
    }

    // The session copy is a disposable UI recovery cache. Canonical is an
    // asynchronous projection and must not be directly overwritten here.
    const sessionLayoutPath = getCanvasLayoutPath(access.sessionPath);
    fs.mkdirSync(path.dirname(sessionLayoutPath), { recursive: true });
    writeJsonFileAtomic(sessionLayoutPath, stored);

    return NextResponse.json(
      createApiSuccess({
        state,
        updatedAt: stored.updatedAt,
        receipt,
      }),
    );
  } catch (error) {
    console.error("Error saving canvas layout:", error);
    if (error instanceof WorkspaceAuthorityClientError) {
      return NextResponse.json(
        createApiError(error.code as never, error.message),
        { status: error.status },
      );
    }
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "保存画布布局失败"),
      { status: 500 },
    );
  }
}
