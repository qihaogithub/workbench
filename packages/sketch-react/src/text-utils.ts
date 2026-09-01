import type {
  SketchSceneNode,
  SketchSceneTextStyleOverride,
} from "@workbench/sketch-core";

export const SKETCH_TEXT_PLACEHOLDER = "输入文本";
export const SKETCH_TEXT_DEFAULT_FONT_SIZE = 24;
export const SKETCH_TEXT_DEFAULT_FONT_WEIGHT = 500;
export const SKETCH_TEXT_DEFAULT_COLOR = "#111827";
export const SKETCH_TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.35;
export const SKETCH_TEXT_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
export const SKETCH_TEXT_MIN_SIZE = 8;

export type SketchTextDecoration = "none" | "underline" | "line-through";

export interface SketchTextComputedStyle {
  color: string;
  fontSize: number;
  fontWeight: string | number;
  fontFamily: string;
  italic: boolean;
  textDecoration: SketchTextDecoration;
  lineHeight: number;
  letterSpacing: number;
}

export interface SketchTextAutoSize {
  width: number;
  height: number;
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDecoration(value: unknown): SketchTextDecoration {
  return value === "underline" || value === "line-through" ? value : "none";
}

function normalizeFontWeight(value: unknown, fallback: string | number): string | number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function styleOverrideFromNode(node: SketchSceneNode): SketchSceneTextStyleOverride {
  const style = node.style ?? {};
  return {
    color: typeof style.color === "string" && style.color !== "transparent" ? style.color : SKETCH_TEXT_DEFAULT_COLOR,
    fontSize: finitePositive(style.fontSize, node.type === "text" ? SKETCH_TEXT_DEFAULT_FONT_SIZE : 18),
    fontWeight: normalizeFontWeight(style.fontWeight, node.type === "text" ? SKETCH_TEXT_DEFAULT_FONT_WEIGHT : 400),
    italic: style.italic ?? false,
    textDecoration: normalizeDecoration(style.textDecoration),
  };
}

export function getSketchTextComputedStyle(node: SketchSceneNode, offset?: number): SketchTextComputedStyle {
  const base = styleOverrideFromNode(node);
  const activeRun = typeof offset === "number"
    ? (node.textStyleRuns ?? []).find((run) => offset >= run.start && offset < run.start + run.length)
    : undefined;
  const override = activeRun?.style ?? {};
  const fontSize = finitePositive(override.fontSize, finitePositive(base.fontSize, SKETCH_TEXT_DEFAULT_FONT_SIZE));
  return {
    color: typeof override.color === "string" && override.color !== "transparent" ? override.color : String(base.color),
    fontSize,
    fontWeight: normalizeFontWeight(override.fontWeight, base.fontWeight ?? SKETCH_TEXT_DEFAULT_FONT_WEIGHT),
    fontFamily: override.fontFamily || SKETCH_TEXT_FONT_FAMILY,
    italic: override.italic ?? Boolean(base.italic),
    textDecoration: normalizeDecoration(override.textDecoration ?? base.textDecoration),
    lineHeight: finitePositive(override.lineHeight, fontSize * SKETCH_TEXT_DEFAULT_LINE_HEIGHT_RATIO),
    letterSpacing: finiteNumber(override.letterSpacing, 0),
  };
}

let cachedCanvasContext: CanvasRenderingContext2D | null | undefined;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (cachedCanvasContext !== undefined) return cachedCanvasContext;
  if (typeof document === "undefined") {
    cachedCanvasContext = null;
    return cachedCanvasContext;
  }
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    cachedCanvasContext = null;
    return cachedCanvasContext;
  }
  try {
    const canvas = document.createElement("canvas");
    cachedCanvasContext = canvas.getContext("2d");
  } catch {
    cachedCanvasContext = null;
  }
  return cachedCanvasContext;
}

function fallbackCharacterWidth(character: string, fontSize: number): number {
  if (/\s/.test(character)) return fontSize * 0.32;
  if ((character.codePointAt(0) ?? 0) > 0xff) return fontSize;
  return fontSize * 0.56;
}

function measureSegment(
  context: CanvasRenderingContext2D | null,
  text: string,
  style: SketchTextComputedStyle,
): number {
  if (!text) return 0;
  if (!context) {
    return Array.from(text).reduce(
      (width, character) => width + fallbackCharacterWidth(character, style.fontSize) + style.letterSpacing,
      0,
    );
  }
  context.font = `${style.italic ? "italic " : ""}${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  return context.measureText(text).width + style.letterSpacing * text.length;
}

function getLineRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const lineBreak = /\r?\n/g;
  let lineStart = 0;
  let match: RegExpExecArray | null;
  while ((match = lineBreak.exec(text))) {
    ranges.push({ start: lineStart, end: match.index });
    lineStart = match.index + match[0].length;
  }
  ranges.push({ start: lineStart, end: text.length });
  return ranges;
}

function measureLine(
  node: SketchSceneNode,
  context: CanvasRenderingContext2D | null,
  start: number,
  end: number,
): { width: number; height: number } {
  if (start >= end) {
    const style = getSketchTextComputedStyle(node, start);
    return { width: 0, height: style.lineHeight };
  }
  const boundaries = new Set<number>([start, end]);
  for (const run of node.textStyleRuns ?? []) {
    const runStart = Math.max(start, Math.min(end, run.start));
    const runEnd = Math.max(start, Math.min(end, run.start + run.length));
    if (runStart < runEnd) {
      boundaries.add(runStart);
      boundaries.add(runEnd);
    }
  }
  const sortedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  let width = 0;
  let height = getSketchTextComputedStyle(node, start).lineHeight;
  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const segmentStart = sortedBoundaries[index];
    const segmentEnd = sortedBoundaries[index + 1];
    const style = getSketchTextComputedStyle(node, segmentStart);
    width += measureSegment(context, node.text?.slice(segmentStart, segmentEnd) ?? "", style);
    height = Math.max(height, style.lineHeight);
  }
  return { width, height };
}

export function measureSketchText(node: SketchSceneNode, text: string): SketchTextAutoSize {
  const context = getCanvasContext();
  const lineRanges = getLineRanges(text);
  let width = 0;
  let height = 0;
  for (const range of lineRanges) {
    const line = measureLine({ ...node, text }, context, range.start, range.end);
    width = Math.max(width, line.width);
    height += line.height;
  }
  const baseLineHeight = getSketchTextComputedStyle({ ...node, text: "" }).lineHeight;
  return {
    width: Math.max(0, Math.ceil(width)),
    height: Math.max(Math.ceil(baseLineHeight), Math.ceil(height)),
  };
}

export function getSketchTextAutoSize(node: SketchSceneNode, text: string): SketchTextAutoSize {
  const hasVisibleText = text.replace(/\r?\n/g, "").trim().length > 0;
  const measured = measureSketchText(node, text);
  const placeholder = hasVisibleText ? null : measureSketchText(node, SKETCH_TEXT_PLACEHOLDER);
  return {
    width: Math.max(SKETCH_TEXT_MIN_SIZE, placeholder ? placeholder.width : measured.width),
    height: Math.max(SKETCH_TEXT_MIN_SIZE, measured.height, placeholder?.height ?? 0),
  };
}
