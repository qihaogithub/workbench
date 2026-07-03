import type { CSSProperties } from "react";
import type { PreviewSize } from "./types";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

const CONTAINER_PADDING = 32;

function parseSizeValue(value: string | number | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/, ""));
    return isNaN(num) ? null : num;
  }
  return null;
}

export interface PreviewScaleResult {
  designWidth: number;
  designHeight: number;
  scale: number;
  wrapperStyle: CSSProperties;
  contentStyle: CSSProperties;
}

export function computePreviewScale(
  size?: PreviewSize,
  containerWidth?: number,
  containerHeight?: number,
  fillContainer?: boolean,
  effectiveHeight?: number,
): PreviewScaleResult {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const designWidth = parseSizeValue(effectiveSize.width) ?? 375;
  const designHeight = parseSizeValue(effectiveSize.height) ?? 812;
  const useEffectiveHeight = effectiveHeight != null && effectiveHeight > designHeight;
  const contentHeight = useEffectiveHeight ? effectiveHeight : designHeight;

  if (fillContainer) {
    if (containerWidth && containerHeight) {
      if (useEffectiveHeight) {
        const scale = containerWidth / designWidth;
        return {
          designWidth,
          designHeight: contentHeight,
          scale,
          wrapperStyle: {
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          },
          contentStyle: {
            width: designWidth,
            height: contentHeight,
            border: "none",
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          },
        };
      }

      const scaleX = containerWidth / designWidth;
      const scaleY = containerHeight / designHeight;
      const scale = Math.min(scaleX, scaleY);

      const displayWidth = designWidth * scale;
      const displayHeight = designHeight * scale;
      const offsetX = (containerWidth - displayWidth) / 2;
      const offsetY = (containerHeight - displayHeight) / 2;

      return {
        designWidth,
        designHeight,
        scale,
        wrapperStyle: {
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        },
        contentStyle: {
          width: designWidth,
          height: designHeight,
          border: "none",
          position: "absolute",
          top: offsetY,
          left: offsetX,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        },
      };
    }

    const fallbackHeight = useEffectiveHeight ? contentHeight : designHeight;
    return {
      designWidth,
      designHeight: fallbackHeight,
      scale: 1,
      wrapperStyle: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      },
      contentStyle: {
        width: designWidth,
        height: fallbackHeight,
        border: "none",
        position: "absolute",
        top: 0,
        left: 0,
        transformOrigin: "top left",
      },
    };
  }

  if (!containerWidth || !containerHeight) {
    return {
      designWidth,
      designHeight,
      scale: 1,
      wrapperStyle: {
        width: designWidth,
        height: designHeight,
        margin: "0 auto",
        position: "relative",
        overflow: "hidden",
      },
      contentStyle: {
        width: designWidth,
        height: designHeight,
        border: "none",
        position: "absolute",
        top: 0,
        left: 0,
      },
    };
  }

  const availableHeight = containerHeight - CONTAINER_PADDING;
  const availableWidth = containerWidth;
  const aspectRatio = designWidth / designHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (availableHeight * aspectRatio <= availableWidth) {
    displayWidth = availableHeight * aspectRatio;
    displayHeight = availableHeight;
  } else {
    displayWidth = availableWidth;
    displayHeight = availableWidth / aspectRatio;
  }

  const scale = displayWidth / designWidth;

  return {
    designWidth,
    designHeight,
    scale,
    wrapperStyle: {
      width: displayWidth,
      height: displayHeight,
      margin: "auto",
      position: "relative",
      overflow: "hidden",
    },
    contentStyle: {
      width: designWidth,
      height: designHeight,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      border: "none",
      position: "absolute",
      top: 0,
      left: 0,
    },
  };
}
