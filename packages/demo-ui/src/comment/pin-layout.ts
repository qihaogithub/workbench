/**
 * 评论 pin 的坐标换算（原型页 Shadow DOM 路径）。
 *
 * 背景：prototype-html-css 的原型页在 `.prototype-root`（固定高度 + overflow:auto
 * 的滚动容器）内渲染，内容在容器内部滚动，而容器盒的 getBoundingClientRect 不随滚动
 * 变化。因此 pin 必须以内容的 scrollWidth/scrollHeight 计算元素位置（相对完整内容），
 * 再减去当前滚动偏移得到视口内位置，乘缩放系数映射到 pin 层容器像素坐标——与高保真
 * iframe 路径（doc - scroll → viewport）保持同一套模型，才能在滚动时让 pin 跟随元素。
 *
 * 这些函数为纯函数，便于单测覆盖坐标换算逻辑。
 */

export interface DOMRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PrototypePinMetrics {
  /** 容器非缩放布局宽度（offsetWidth） */
  offsetWidth: number;
  /** 内容实际跨度 */
  scrollWidth: number;
  scrollHeight: number;
  /** 当前滚动偏移 */
  scrollLeft: number;
  scrollTop: number;
  /** 容器在屏幕上的（已缩放）矩形 */
  rect: DOMRectLike;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 容器盒宽 → 内容设计宽的缩放系数 */
export function computePrototypeScale(
  rectWidth: number,
  offsetWidth: number,
): number {
  return rectWidth > 0 && offsetWidth > 0 ? rectWidth / offsetWidth : 1;
}

/** 把屏幕点击位置换算成相对完整内容的归一化坐标（0~1） */
export function computePrototypePinRatio(
  metrics: PrototypePinMetrics & {
    clientX: number;
    clientY: number;
  },
): { xRatio: number; yRatio: number } {
  const scale = computePrototypeScale(metrics.rect.width, metrics.offsetWidth);
  const xRatio =
    metrics.scrollWidth > 0
      ? clamp01(
          (metrics.scrollLeft + (metrics.clientX - metrics.rect.left) / scale) /
            metrics.scrollWidth,
        )
      : 0;
  const yRatio =
    metrics.scrollHeight > 0
      ? clamp01(
          (metrics.scrollTop + (metrics.clientY - metrics.rect.top) / scale) /
            metrics.scrollHeight,
        )
      : 0;
  return { xRatio, yRatio };
}

/** 把 pin 的归一化坐标渲染成 pin 层容器内的像素位置（跟随滚动） */
export function computePrototypePinPosition(
  metrics: PrototypePinMetrics & {
    containerRect: DOMRectLike;
    pin: { xRatio: number; yRatio: number };
  },
): { left: number; top: number } {
  const scale = computePrototypeScale(metrics.rect.width, metrics.offsetWidth);
  const docX = metrics.pin.xRatio * metrics.scrollWidth;
  const docY = metrics.pin.yRatio * metrics.scrollHeight;
  const vpX = docX - metrics.scrollLeft;
  const vpY = docY - metrics.scrollTop;
  return {
    left: metrics.rect.left - metrics.containerRect.left + vpX * scale,
    top: metrics.rect.top - metrics.containerRect.top + vpY * scale,
  };
}