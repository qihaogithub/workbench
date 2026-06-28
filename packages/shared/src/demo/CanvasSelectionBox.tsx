"use client";

import { cn } from "./utils";

interface CanvasSelectionBoxProps {
  visible: boolean;
  handles?: boolean;
  className?: string;
}

const handleClass =
  "absolute h-2.5 w-2.5 rounded-[1px] border border-blue-500 bg-white shadow-sm";

export function CanvasSelectionBox({
  visible,
  handles = true,
  className,
}: CanvasSelectionBoxProps) {
  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      data-canvas-selection-box="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-40 border border-blue-500",
        className,
      )}
    >
      {handles && (
        <>
          <span className={cn(handleClass, "-left-[5px] -top-[5px]")} />
          <span className={cn(handleClass, "-right-[5px] -top-[5px]")} />
          <span className={cn(handleClass, "-bottom-[5px] -left-[5px]")} />
          <span className={cn(handleClass, "-bottom-[5px] -right-[5px]")} />
        </>
      )}
    </div>
  );
}
