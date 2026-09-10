export type SpineFit = "contain" | "cover" | "none";

export type SpineAlignment =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface SpineBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpineViewport {
  width: number;
  height: number;
}

export interface SpineCameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface SpineCameraFrame {
  x: number;
  y: number;
  zoom: number;
}

/**
 * The deliberately small, non-secret snapshot exposed by the canonical
 * preview SDK's Spine probe.  This is runtime structure evidence, not a
 * compositor guarantee: skeleton bounds are reported as
 * `runtime-self-reported`, while a sampled painted rectangle projected into
 * the iframe viewport is reported as `painted-bounds`.
 */
export interface SpineProbeSnapshot {
  kind: "spine";
  ready: boolean;
  animationName?: string;
  animationPlaying?: boolean;
  loopEnabled?: boolean;
  trackTime?: number;
  duration?: number;
  skeletonBounds?: SpineBounds;
  camera?: SpineCameraState & { viewportWidth: number; viewportHeight: number };
  fit: SpineFit;
  alignment: SpineAlignment;
  canvas: {
    cssWidth: number;
    cssHeight: number;
    backingWidth: number;
    backingHeight: number;
  };
  paintedBounds?: SpineBounds;
  sampledAt: number;
  precision: "runtime-self-reported" | "painted-bounds";
}

export interface SpineProbeTarget {
  /** Stable internal property used by the host to find the realm-local API. */
  __workbenchPreviewProbe__?: {
    inspect?: () => SpineProbeSnapshot | null;
  };
}

const MAX_PROBE_COORDINATE = 100_000;
const MAX_PROBE_SIZE = 10_000;

function isBoundedFinite(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max;
}

/** Reject malformed or unreasonably large rectangles before they leave the iframe. */
export function isSafeSpineProbeBounds(value: unknown): value is SpineBounds {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<SpineBounds>;
  return (
    isBoundedFinite(bounds.x, MAX_PROBE_COORDINATE) &&
    isBoundedFinite(bounds.y, MAX_PROBE_COORDINATE) &&
    isBoundedFinite(bounds.width, MAX_PROBE_SIZE) &&
    isBoundedFinite(bounds.height, MAX_PROBE_SIZE) &&
    bounds.width >= 0 &&
    bounds.height >= 0
  );
}

/** A defensive copy prevents a caller from mutating a registered snapshot. */
export function copySafeSpineProbeBounds(value: unknown): SpineBounds | undefined {
  return isSafeSpineProbeBounds(value)
    ? { x: value.x, y: value.y, width: value.width, height: value.height }
    : undefined;
}

const FITS = new Set<SpineFit>(["contain", "cover", "none"]);
const ALIGNMENTS = new Set<SpineAlignment>([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

export function normalizeSpineFit(value: unknown): SpineFit {
  return typeof value === "string" && FITS.has(value as SpineFit)
    ? (value as SpineFit)
    : "contain";
}

export function normalizeSpineAlignment(value: unknown): SpineAlignment {
  return typeof value === "string" && ALIGNMENTS.has(value as SpineAlignment)
    ? (value as SpineAlignment)
    : "center";
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Calculates the stable first-frame camera state for a Spine skeleton.
 * Invalid/degenerate bounds or viewports return null so callers can keep the
 * runtime's existing camera state instead of introducing NaN/Infinity.
 */
export function calculateSpineCameraFrame(
  bounds: SpineBounds,
  viewport: SpineViewport,
  fit: SpineFit = "contain",
  alignment: SpineAlignment = "center",
  current: SpineCameraState = { x: 0, y: 0, zoom: 1 },
): SpineCameraFrame | null {
  if (
    !bounds ||
    !viewport ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    ![viewport.width, viewport.height].every(Number.isFinite) ||
    !isFinitePositive(bounds.width) ||
    !isFinitePositive(bounds.height) ||
    !isFinitePositive(viewport.width) ||
    !isFinitePositive(viewport.height)
  ) {
    return null;
  }

  const normalizedFit = normalizeSpineFit(fit);
  if (normalizedFit === "none") return { ...current };

  const zoom =
    normalizedFit === "cover"
      ? Math.min(bounds.width / viewport.width, bounds.height / viewport.height)
      : Math.max(bounds.width / viewport.width, bounds.height / viewport.height);
  if (!isFinitePositive(zoom)) return null;

  const visibleWidth = viewport.width * zoom;
  const visibleHeight = viewport.height * zoom;
  const normalizedAlignment = normalizeSpineAlignment(alignment);
  const horizontal = normalizedAlignment.includes("left")
    ? "left"
    : normalizedAlignment.includes("right")
      ? "right"
      : "center";
  const vertical = normalizedAlignment.includes("top")
    ? "top"
    : normalizedAlignment.includes("bottom")
      ? "bottom"
      : "center";

  const x =
    horizontal === "left"
      ? bounds.x + visibleWidth / 2
      : horizontal === "right"
        ? bounds.x + bounds.width - visibleWidth / 2
        : bounds.x + bounds.width / 2;
  const y =
    vertical === "bottom"
      ? bounds.y + visibleHeight / 2
      : vertical === "top"
        ? bounds.y + bounds.height - visibleHeight / 2
        : bounds.y + bounds.height / 2;

  return Number.isFinite(x) && Number.isFinite(y)
    ? { x, y, zoom }
    : null;
}
