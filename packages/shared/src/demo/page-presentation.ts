/** The persisted default viewport for a page. Canvas card geometry is separate. */
export type PagePresentationMode = "fixed-canvas" | "responsive-page";
export type PagePresentationPreset = "desktop" | "tablet" | "mobile" | "custom";
export type PagePresentationSource = "figma" | "html-meta" | "user" | "recommended";
export type HtmlImportPresentationConfidence = "high" | "medium" | "low";

export interface PagePresentationProfile {
  version: 1;
  mode: PagePresentationMode;
  viewport: { width: number; height: number };
  heightBehavior: "fixed" | "content";
  preset: PagePresentationPreset;
  source: PagePresentationSource;
}

export interface HtmlImportPresentationRecommendation {
  profile: PagePresentationProfile;
  confidence: HtmlImportPresentationConfidence;
  confirmationRequired: boolean;
  reasonCodes: string[];
}

export const PAGE_PRESENTATION_PRESETS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

export const PAGE_PRESENTATION_LIMITS = {
  minWidth: 240,
  maxWidth: 3840,
  minHeight: 240,
  maxHeight: 4096,
} as const;

function presetFor(width: number, height: number): PagePresentationPreset {
  for (const [preset, size] of Object.entries(PAGE_PRESENTATION_PRESETS))
    if (size.width === width && size.height === height)
      return preset as PagePresentationPreset;
  return "custom";
}

export function isValidPagePresentationViewport(viewport: {
  width: number;
  height: number;
}): boolean {
  return (
    Number.isInteger(viewport.width) &&
    Number.isInteger(viewport.height) &&
    viewport.width >= PAGE_PRESENTATION_LIMITS.minWidth &&
    viewport.width <= PAGE_PRESENTATION_LIMITS.maxWidth &&
    viewport.height >= PAGE_PRESENTATION_LIMITS.minHeight &&
    viewport.height <= PAGE_PRESENTATION_LIMITS.maxHeight
  );
}

export function createPagePresentationProfile(input: {
  mode: PagePresentationMode;
  viewport: { width: number; height: number };
  source: PagePresentationSource;
  heightBehavior?: "fixed" | "content";
}): PagePresentationProfile {
  if (!isValidPagePresentationViewport(input.viewport))
    throw new RangeError("页面展示视口超出允许范围");
  return {
    version: 1,
    mode: input.mode,
    viewport: { ...input.viewport },
    heightBehavior:
      input.heightBehavior ?? (input.mode === "fixed-canvas" ? "fixed" : "content"),
    preset: presetFor(input.viewport.width, input.viewport.height),
    source: input.source,
  };
}

/**
 * Resolve the single presentation value stored under config.schema.json.$demo.
 * This deliberately has no previewSize or prototype metadata fallback.
 */
export function resolvePagePresentation(schema: string | Record<string, unknown>):
  | PagePresentationProfile
  | undefined {
  let parsed: unknown = schema;
  if (typeof schema === "string") {
    try {
      parsed = JSON.parse(schema);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const demo = (parsed as { $demo?: unknown }).$demo;
  if (!demo || typeof demo !== "object") return undefined;
  const value = (demo as { presentation?: unknown }).presentation;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const viewport = record.viewport;
  if (!viewport || typeof viewport !== "object") return undefined;
  const dimensions = viewport as Record<string, unknown>;
  if (
    record.version !== 1 ||
    (record.mode !== "fixed-canvas" && record.mode !== "responsive-page") ||
    (record.heightBehavior !== "fixed" && record.heightBehavior !== "content") ||
    !["desktop", "tablet", "mobile", "custom"].includes(String(record.preset)) ||
    !["figma", "html-meta", "user", "recommended"].includes(String(record.source)) ||
    typeof dimensions.width !== "number" ||
    typeof dimensions.height !== "number" ||
    !isValidPagePresentationViewport({ width: dimensions.width, height: dimensions.height })
  )
    return undefined;
  const mode = record.mode as PagePresentationMode;
  return {
    version: 1,
    mode,
    viewport: { width: dimensions.width as number, height: dimensions.height as number },
    heightBehavior: record.heightBehavior as "fixed" | "content",
    preset: record.preset as PagePresentationPreset,
    source: record.source as PagePresentationSource,
  };
}

export function applyPagePresentationToSchema(
  schema: string,
  presentation: PagePresentationProfile,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schema);
  } catch {
    throw new TypeError("config.schema.json 不是有效 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new TypeError("config.schema.json 必须是 JSON 对象");
  const root = parsed as Record<string, unknown>;
  const demo = root.$demo && typeof root.$demo === "object" && !Array.isArray(root.$demo)
    ? { ...(root.$demo as Record<string, unknown>) }
    : {};
  root.$demo = { ...demo, presentation };
  return `${JSON.stringify(root, null, 2)}\n`;
}

export function recommendHtmlImportPresentation(input: {
  figmaViewport?: { width: number; height: number };
  numericViewport?: { width: number; height: number };
  hasDeviceWidth?: boolean;
  hasViewportSignal?: boolean;
}): HtmlImportPresentationRecommendation {
  if (input.figmaViewport && isValidPagePresentationViewport(input.figmaViewport))
    return {
      profile: createPagePresentationProfile({
        mode: "fixed-canvas",
        viewport: input.figmaViewport,
        source: "figma",
      }),
      confidence: "high",
      confirmationRequired: false,
      reasonCodes: ["figma-fixed-canvas"],
    };
  if (input.numericViewport && isValidPagePresentationViewport(input.numericViewport))
    return {
      profile: createPagePresentationProfile({
        mode: "responsive-page",
        viewport: input.numericViewport,
        source: "html-meta",
        heightBehavior: "content",
      }),
      confidence: "medium",
      confirmationRequired: true,
      reasonCodes: ["numeric-viewport"],
    };
  return {
    profile: createPagePresentationProfile({
      mode: "responsive-page",
      viewport: PAGE_PRESENTATION_PRESETS.desktop,
      source: "recommended",
      heightBehavior: "content",
    }),
    confidence: "low",
    confirmationRequired: true,
    reasonCodes: input.hasDeviceWidth
      ? ["device-width-responsive"]
      : input.hasViewportSignal
        ? ["viewport-not-numeric", "desktop-recommended"]
        : ["viewport-missing", "desktop-recommended"],
  };
}
