import type {
  CanvasFreeNode,
  CanvasPageData,
  CanvasPageGroup,
  CanvasPageLayout,
} from "./types";

const CLIPBOARD_KEY = "workbench:canvas-clipboard";

/** 画布剪贴板数据格式 */
export interface CanvasClipboardData {
  /** 格式版本，便于未来迁移 */
  version: 1;
  /** 复制时间戳 */
  copiedAt: number;
  /** 来源项目 ID */
  sourceProjectId?: string;
  /** 来源会话 ID */
  sourceSessionId?: string;
  /** 选中的自由节点 */
  nodes: CanvasFreeNode[];
  /** 选中的页面（含内容） */
  pages: CanvasPageData[];
  /** 选中页面的布局信息（key 为源 pageId） */
  pageLayouts: Record<string, CanvasPageLayout>;
  /** 涉及的页面组 */
  pageGroups: CanvasPageGroup[];
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
    if (data.version !== 1) return null;
    if (!Array.isArray(data.nodes)) return null;
    if (!Array.isArray(data.pages)) return null;
    if (typeof data.pageLayouts !== "object" || data.pageLayouts === null)
      return null;
    if (!Array.isArray(data.pageGroups)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 从页面布局 + 节点列表计算总边界框。
 * 如果两者都为空则返回 null。
 */
export function computeBounds(
  pageLayouts: Record<string, CanvasPageLayout>,
  nodes: CanvasFreeNode[],
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
