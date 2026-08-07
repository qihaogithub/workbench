"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { LayerTreeMenu } from "@workbench/demo-ui";
import type { VisualNodeInfo, VisualNodeTreeItem } from "@workbench/demo-ui";
import { cn } from "@/lib/utils";

const HEADER_HEIGHT = 37;
const MAX_LAYER_RATIO = 0.5;

interface VisualEditSidebarProps {
  layerNodes: VisualNodeTreeItem[];
  selectedNodeId?: string | null;
  hiddenNodeIds?: string[];
  getNodeBadgeCount?: (node: VisualNodeInfo) => number;
  onSelectLayer?: (node: VisualNodeInfo, path: VisualNodeInfo[]) => void;
  onToggleNodeHidden?: (node: VisualNodeInfo) => void;
  onHoverLayerNodeId?: (nodeId: string | null) => void;
  /** 属性栏内容（原 VisualPropertyPanel） */
  children?: ReactNode;
}

export function VisualEditSidebar({
  layerNodes,
  selectedNodeId,
  hiddenNodeIds = [],
  getNodeBadgeCount,
  onSelectLayer,
  onToggleNodeHidden,
  onHoverLayerNodeId,
  children,
}: VisualEditSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(true);
  const [layerHeightPx, setLayerHeightPx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const resolveContainerHeight = useCallback(() => {
    return containerRef.current?.offsetHeight ?? 0;
  }, []);

  const toggleLayer = useCallback(() => {
    setLayerOpen((current) => {
      const next = !current;
      if (next && layerHeightPx == null) {
        const max = Math.max(HEADER_HEIGHT, resolveContainerHeight() * MAX_LAYER_RATIO);
        setLayerHeightPx(Math.round(max));
      }
      return next;
    });
  }, [layerHeightPx, resolveContainerHeight]);

  const startDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startHeight = layerHeightPx ?? resolveContainerHeight() * MAX_LAYER_RATIO;
      dragRef.current = { startY: event.clientY, startHeight };
      document.addEventListener("mousemove", handleDragMove);
      document.addEventListener("mouseup", stopDrag);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layerHeightPx, resolveContainerHeight],
  );

  const handleDragMove = useCallback(
    (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const containerHeight = resolveContainerHeight();
      const maxHeight = Math.max(HEADER_HEIGHT, containerHeight * MAX_LAYER_RATIO);
      const minHeight = HEADER_HEIGHT;
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, drag.startHeight + (event.clientY - drag.startY)),
      );
      setLayerHeightPx(next);
    },
    [resolveContainerHeight],
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", stopDrag);
  }, [handleDragMove]);

  const layerHeight = layerOpen
    ? Math.max(HEADER_HEIGHT, layerHeightPx ?? HEADER_HEIGHT)
    : HEADER_HEIGHT;

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-col overflow-hidden border-b bg-card"
        style={{ height: layerHeight, flexShrink: 0 }}
      >
        <LayerTreeMenu
          variant="panel"
          title="图层列表"
          collapsed={!layerOpen}
          onHeaderToggle={toggleLayer}
          nodes={layerNodes}
          selectedNodeId={selectedNodeId}
          hiddenNodeIds={hiddenNodeIds}
          getNodeBadgeCount={getNodeBadgeCount}
          onSelectNode={onSelectLayer}
          onToggleNodeHidden={onToggleNodeHidden}
          onHoverNodeIdChange={onHoverLayerNodeId}
          scrollClassName="layer-tree-menu-scrollbar"
        />
      </div>

      {layerOpen && (
        <div
          className="group relative h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/50"
          onMouseDown={startDrag}
        >
          <div className="absolute inset-x-0 -top-1 -bottom-1" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
        <button
          type="button"
          aria-expanded={propertyOpen}
          className="flex w-full shrink-0 cursor-pointer items-center justify-between gap-2 px-2 py-2 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setPropertyOpen((current) => !current)}
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                propertyOpen ? "" : "-rotate-90",
              )}
            />
            属性栏
          </span>
        </button>
        {propertyOpen && (
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        )}
      </div>
    </div>
  );
}