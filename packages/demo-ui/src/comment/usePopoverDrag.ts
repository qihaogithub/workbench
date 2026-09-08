"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

export interface UsePopoverDragOptions {
  /** Reinitialise the manual position when a different popover opens. */
  resetKey?: string;
  /** Keyboard movement step in CSS pixels. */
  keyboardStep?: number;
  minLeft?: number;
  maxLeft?: number;
  minTop?: number;
  maxTop?: number;
}

/**
 * Keeps a user-dragged offset separate from the anchor position. This lets a
 * popover follow canvas scroll/zoom while preserving the position chosen by
 * the user. The returned handle props also provide keyboard movement for an
 * accessible, focusable drag handle.
 */
export function usePopoverDrag(
  left: number,
  top: number,
  options: UsePopoverDragOptions = {},
) {
  const {
    resetKey,
    keyboardStep = 16,
    minLeft = Number.NEGATIVE_INFINITY,
    maxLeft = Number.POSITIVE_INFINITY,
    minTop = Number.NEGATIVE_INFINITY,
    maxTop = Number.POSITIVE_INFINITY,
  } = options;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [resetKey]);

  const clamp = useCallback(
    (value: number, min: number, max: number) => {
      const lower = Math.min(min, max);
      const upper = Math.max(min, max);
      return Math.min(Math.max(value, lower), upper);
    },
    [],
  );

  const position = useMemo(
    () => ({
      left: clamp(left + offset.x, minLeft, maxLeft),
      top: clamp(top + offset.y, minTop, maxTop),
    }),
    [clamp, left, maxLeft, maxTop, minLeft, minTop, offset.x, offset.y, top],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as Element | null;
    if (target?.closest("button,a,input,textarea,select,[data-no-drag]")) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const startY = Number.isFinite(event.clientY) ? event.clientY : 0;
    dragRef.current = {
      pointerId: event.pointerId,
      startX,
      startY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
    setDragging(true);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [offset.x, offset.y]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    setOffset({
      x: drag.startOffsetX + clientX - drag.startX,
      y: drag.startOffsetY + clientY - drag.startY,
    });
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId) &&
      typeof event.currentTarget.releasePointerCapture === "function"
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? keyboardStep * 4 : keyboardStep;
    setOffset((current) => ({
      x: current.x + direction[0] * step,
      y: current.y + direction[1] * step,
    }));
  }, [keyboardStep]);

  return {
    position,
    dragging,
    dragHandleProps: {
      tabIndex: 0,
      role: "button" as const,
      "aria-label": "拖动评论浮窗，可使用方向键移动",
      "aria-roledescription": "拖动手柄",
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  };
}
