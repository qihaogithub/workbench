"use client";

import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResizableHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  className?: string;
}

export function ResizableHandle({ onMouseDown, className }: ResizableHandleProps) {
  return (
    <div
      className={cn(
        "w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0 group relative",
        className
      )}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

interface ResizablePanelGroupProps {
  children: ReactNode;
  className?: string;
  direction?: "horizontal" | "vertical";
  defaultSizes?: number[];
  minSizes?: number[];
}

export function ResizablePanelGroup({
  children,
  className,
  direction = "horizontal",
  defaultSizes = [33, 34, 33],
  minSizes = [15, 15, 15],
}: ResizablePanelGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<number[]>(defaultSizes);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragStartX = useRef(0);
  const dragStartSizes = useRef<number[]>([]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      setIsDragging(true);
      setDragIndex(index);
      dragStartX.current = e.clientX;
      dragStartSizes.current = [...sizes];
    },
    [sizes]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragIndex === null || !containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const deltaPercent = ((e.clientX - dragStartX.current) / containerWidth) * 100;

      setSizes((prevSizes) => {
        const newSizes = [...prevSizes];
        const leftPanel = dragIndex - 1;
        const rightPanel = dragIndex;

        const leftDelta = deltaPercent;
        const rightDelta = -deltaPercent;

        let newLeftSize = dragStartSizes.current[leftPanel] + leftDelta;
        let newRightSize = dragStartSizes.current[rightPanel] + rightDelta;

        const minLeft = minSizes[leftPanel];
        const minRight = minSizes[rightPanel];

        if (newLeftSize < minLeft) {
          const overflow = minLeft - newLeftSize;
          newLeftSize = minLeft;
          newRightSize = Math.max(minRight, newRightSize - overflow);
        }

        if (newRightSize < minRight) {
          const overflow = minRight - newRightSize;
          newRightSize = minRight;
          newLeftSize = Math.max(minLeft, newLeftSize - overflow);
        }

        newSizes[leftPanel] = newLeftSize;
        newSizes[rightPanel] = newRightSize;

        return newSizes;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragIndex(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragIndex, minSizes]);

  const childArray = Array.isArray(children) ? children : [children];
  const panelElements: ReactNode[] = [];
  const handleElements: ReactNode[] = [];

  childArray.forEach((child, index) => {
    if (index > 0) {
      handleElements.push(
        <ResizableHandle
          key={`handle-${index}`}
          onMouseDown={(e) => handleMouseDown(e, index)}
          className={isDragging && dragIndex === index ? "bg-primary/50" : ""}
        />
      );
    }
    panelElements.push(
      <div
        key={`panel-${index}`}
        className="overflow-hidden"
        style={{
          width: direction === "horizontal" ? `${sizes[index]}%` : "100%",
          height: direction === "vertical" ? `${sizes[index]}%` : "100%",
          flexShrink: 0,
        }}
      >
        {child}
      </div>
    );
  });

  const result: ReactNode[] = [];
  for (let i = 0; i < panelElements.length; i++) {
    result.push(panelElements[i]);
    if (i < handleElements.length) {
      result.push(handleElements[i]);
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full",
        direction === "horizontal" ? "flex-row" : "flex-col",
        isDragging && "select-none",
        className
      )}
    >
      {result}
    </div>
  );
}

interface ResizablePanelProps {
  children: ReactNode;
  className?: string;
}

export function ResizablePanel({ children, className }: ResizablePanelProps) {
  return <div className={cn("h-full w-full overflow-hidden", className)}>{children}</div>;
}