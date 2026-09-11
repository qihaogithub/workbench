import type {
  CanvasFreeNode,
  CanvasPageGroup,
  CanvasPageLayout,
  CanvasTransferPageIdentity,
  CanvasNavigationState,
  CanvasSection,
} from "./types";

const CLIPBOARD_KEY = "workbench:canvas-clipboard";

/** 画布剪贴板数据格式 */
export interface CanvasClipboardData {
  /** 格式版本，便于未来迁移 */
  version: 2;
  /** 复制时间戳 */
  copiedAt: number;
  /** 来源项目 ID */
  sourceProjectId?: string;
  /** 来源会话 ID */
  sourceSessionId?: string;
  /** 选中的自由节点 */
  nodes: CanvasFreeNode[];
  /** 选中的页面身份；内容由服务端从已提交源版本解析。 */
  pages: CanvasTransferPageIdentity[];
  /** 选中页面的布局信息（key 为源 pageId） */
  pageLayouts: Record<string, CanvasPageLayout>;
  /** 涉及的页面组 */
  pageGroups: CanvasPageGroup[];
  /** Copied Section graph; children are remapped during paste. */
  sections?: CanvasSection[];
  /** 仅包含复制页面内部的跳转关系。 */
  navigation?: CanvasNavigationState;
  /** 选中内容的整体边界框 */
  bounds: { x: number; y: number; width: number; height: number } | null;
}

/** 将剪贴板数据写入 localStorage */
export function writeCanvasClipboard(data: CanvasClipboardData): void {
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
  } catch {
    // localStorage 可能已满或不可用（隐私模式等）；静默失败
  }
}

/** 从 localStorage 读取剪贴板数据，格式无效时返回 null */
export function readCanvasClipboard(): CanvasClipboardData | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CanvasClipboardData;
    if (data.version !== 2) return null;
    if (!Array.isArray(data.nodes)) return null;
    if (!Array.isArray(data.pages)) return null;
    if (typeof data.pageLayouts !== "object" || data.pageLayouts === null)
      return null;
    if (!Array.isArray(data.pageGroups)) return null;
    if (!Array.isArray(data.sections)) data.sections = [];
    return data;
  } catch {
    return null;
  }
}

/** Rewrites every copied Section ID and its internal member references. */
export function remapCanvasSectionsForPaste(input: {
  sections: CanvasSection[];
  pageIdMapping: Map<string, string>;
  pageGroupIdMapping?: Map<string, string>;
  nodeIdMapping: Map<string, string>;
  offset: { x: number; y: number };
  now: number;
  createId: () => string;
}): Record<string, CanvasSection> {
  const sectionIdMapping = new Map<string, string>();
  for (const section of input.sections) sectionIdMapping.set(section.id, input.createId());
  const result: Record<string, CanvasSection> = {};
  for (const section of input.sections) {
    const id = sectionIdMapping.get(section.id);
    if (!id) continue;
    const children = section.children.flatMap((child) => {
      const mappedId = child.kind === "page"
        ? input.pageIdMapping.get(child.id)
        : child.kind === "page-group"
          ? input.pageGroupIdMapping?.get(child.id) ?? child.id
          : child.kind === "node"
          ? input.nodeIdMapping.get(child.id)
          : sectionIdMapping.get(child.id);
      return mappedId ? [{ kind: child.kind, id: mappedId }] : [];
    });
    result[id] = {
      ...section,
      id,
      layout: { ...section.layout, x: section.layout.x + input.offset.x, y: section.layout.y + input.offset.y },
      children,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }
  return result;
}

/**
 * 从页面布局 + 节点列表计算总边界框。
 * 如果两者都为空则返回 null。
 */
export function computeBounds(
  pageLayouts: Record<string, CanvasPageLayout>,
  nodes: CanvasFreeNode[],
  sections: CanvasSection[] = [],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layout of Object.values(pageLayouts)) {
    minX = Math.min(minX, layout.x);
    minY = Math.min(minY, layout.y);
    maxX = Math.max(maxX, layout.x + layout.width);
    maxY = Math.max(maxY, layout.y + layout.height);
  }

  for (const node of nodes) {
    const { x, y, width, height } = node.layout;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  for (const section of sections) {
    const { x, y, width, height } = section.layout;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 判断目标元素是否为可编辑控件（input/textarea/contentEditable） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input,textarea,select,[contenteditable='true']") ||
    target.isContentEditable,
  );
}
