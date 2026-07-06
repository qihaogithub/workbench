"use client";

import { Eye, EyeOff } from "lucide-react";

import type { VisualNodeInfo, VisualNodeTreeItem } from "./iframe-types";

interface LayerTreeMenuProps {
  nodes: VisualNodeTreeItem[];
  selectedNodeId?: string | null;
  title?: string;
  emptyText?: string;
  className?: string;
  scrollClassName?: string;
  hiddenNodeIds?: string[];
  getNodeBadgeCount?: (node: VisualNodeInfo) => number;
  onSelectNode?: (node: VisualNodeInfo, path: VisualNodeInfo[]) => void;
  onToggleNodeHidden?: (node: VisualNodeInfo) => void;
  onHoverNodeIdChange?: (nodeId: string | null) => void;
}

interface LayerTreeMenuItem {
  node: VisualNodeTreeItem;
  depth: number;
  path: VisualNodeInfo[];
}

function hasBackgroundImage(node: VisualNodeInfo): boolean {
  const backgroundImage = node.computedStyle?.backgroundImage;
  return !!backgroundImage && backgroundImage !== "none";
}

export function getLayerTreeNodeLabel(node: VisualNodeInfo): string {
  const tagName = node.tagName.toLowerCase();
  const text = node.textContent?.trim();
  const className = node.className?.toLowerCase() ?? "";

  if (node.attrs?.ariaLabel) return node.attrs.ariaLabel;
  if (tagName === "img" || node.attrs?.src || node.attrs?.currentSrc) {
    return node.attrs?.alt || "图片";
  }
  if (hasBackgroundImage(node)) return "背景图容器";
  if (node.attrs?.role === "button" || tagName === "button") return text || "按钮";
  if (node.attrs?.href || tagName === "a") return text || "链接";
  if (tagName === "input" || tagName === "textarea") return "输入框";
  if (node.editCapabilities.includes("text") && text) return text;
  if (tagName === "main") return "主体";
  if (tagName === "section") return "区域";
  if (tagName === "article") return "内容卡片";
  if (tagName === "header") return "页眉";
  if (tagName === "footer") return "页脚";
  if (className.includes("modal") || className.includes("dialog") || className.includes("popover")) return "弹窗容器";
  if (className.includes("overlay") || className.includes("mask") || className.includes("backdrop")) return "遮罩层";
  if (className.includes("card") || className.includes("panel")) return "卡片";
  if (className.includes("container") || className.includes("wrapper")) return "容器";
  if (tagName === "span") return "内容";
  return "容器";
}

export function getLayerTreeNodeKind(node: VisualNodeInfo): string {
  const tagName = node.tagName.toLowerCase();
  if (tagName === "img" || node.editCapabilities.includes("image") || node.attrs?.src || node.attrs?.currentSrc) return "图片";
  if (hasBackgroundImage(node)) return "背景";
  if (node.attrs?.role === "button" || tagName === "button") return "按钮";
  if (node.editCapabilities.includes("link") || node.attrs?.href || tagName === "a") return "链接";
  if (tagName === "input" || tagName === "textarea") return "输入";
  if (node.editCapabilities.includes("text")) return "文字";
  return "容器";
}

function flattenLayerTree(
  nodes: VisualNodeTreeItem[],
  depth = 0,
  path: VisualNodeInfo[] = [],
): LayerTreeMenuItem[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node];
    return [
      { node, depth, path: nextPath },
      ...flattenLayerTree(node.children ?? [], depth + 1, nextPath),
    ];
  });
}

export function LayerTreeMenu({
  nodes,
  selectedNodeId,
  title = "图层",
  emptyText = "暂无可选图层",
  className = "",
  scrollClassName = "",
  hiddenNodeIds = [],
  getNodeBadgeCount,
  onSelectNode,
  onToggleNodeHidden,
  onHoverNodeIdChange,
}: LayerTreeMenuProps) {
  const items = flattenLayerTree(nodes);
  const hiddenNodeIdSet = new Set(hiddenNodeIds);

  return (
    <div
      role="menu"
      aria-label={title}
      className={`w-64 rounded-md border border-border bg-background p-1.5 text-foreground shadow-lg ${className}`}
      onMouseLeave={() => onHoverNodeIdChange?.(null)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span>{title}</span>
        <span>{items.length} 个</span>
      </div>
      {items.length === 0 ? (
        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className={`max-h-72 overflow-y-auto ${scrollClassName}`}>
          {items.map(({ node, depth, path }) => {
            const active =
              node.domPath === selectedNodeId || node.nodeId === selectedNodeId;
            const label = getLayerTreeNodeLabel(node);
            const badgeCount = getNodeBadgeCount?.(node) ?? 0;
            const secondary =
              node.textContent && node.textContent !== label
                ? node.textContent
                : node.tagName.toLowerCase();

            const hidden =
              hiddenNodeIdSet.has(node.domPath) ||
              hiddenNodeIdSet.has(node.nodeId);

            return (
              <div
                key={node.domPath}
                role="menuitem"
                className={[
                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted focus-within:bg-muted",
                  hidden ? "opacity-55" : "",
                ].join(" ")}
                style={{ paddingLeft: `${8 + Math.min(depth, 8) * 14}px` }}
                onMouseEnter={() => onHoverNodeIdChange?.(node.domPath)}
              >
                <button
                  type="button"
                  className="min-w-0 text-left focus-visible:outline-none"
                  onClick={() => onSelectNode?.(node, path)}
                  onFocus={() => onHoverNodeIdChange?.(node.domPath)}
                >
                  <span className="block truncate font-medium">{label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {secondary}
                  </span>
                </button>
                <span className="flex items-center gap-1">
                  {badgeCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-primary/70 bg-primary text-[10px] font-medium text-primary-foreground">
                      {badgeCount}
                    </span>
                  )}
                  {onToggleNodeHidden && (
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={hidden ? "临时显示图层" : "临时隐藏图层"}
                      aria-label={hidden ? "临时显示图层" : "临时隐藏图层"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleNodeHidden(node);
                      }}
                      onFocus={() => onHoverNodeIdChange?.(node.domPath)}
                    >
                      {hidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
