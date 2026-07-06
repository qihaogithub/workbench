import fs from "fs";
import path from "path";
import type {
  CanvasDocumentEntry,
  CanvasFreeNode,
  CanvasLayersState,
  CanvasPageLayout,
  CanvasPageGroup,
  CanvasState,
} from "@workbench/demo-ui";
import { normalizeCanvasStateLayers } from "@workbench/demo-ui";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const previewSizeKey = readString(value, "previewSizeKey");

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
    if (text === null || fontSize === null || fontSize <= 0 || !color) return null;
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

export function parseCanvasState(value: unknown): CanvasState | null {
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

export function readCanvasStateFromWorkspace(workspacePath: string): CanvasState | undefined {
  const layoutPath = path.join(workspacePath, ".canvas-layout.json");
  if (!fs.existsSync(layoutPath)) return undefined;

  try {
    const parsed = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return undefined;
    return parseCanvasState(parsed.state) ?? undefined;
  } catch {
    return undefined;
  }
}
