export type CaptureProfileId = "editable-fidelity" | "compact-review";

/** The subset is deliberately expressed with SingleFile's camelCase option names. */
export type SingleFileCaptureOptions = Readonly<Record<string, boolean | number | string>>;

export interface CaptureProfile {
  id: CaptureProfileId;
  name: string;
  description: string;
  options: SingleFileCaptureOptions;
}

export const CAPTURE_PROFILES: readonly CaptureProfile[] = [
  {
    id: "editable-fidelity",
    name: "Editable Fidelity",
    description: "保留脚本、iframe、隐藏节点和资源，适合后续 Agent 编辑。",
    options: {
      blockScripts: false,
      blockVideos: false,
      blockAudios: false,
      compressHTML: false,
      removeHiddenElements: false,
      removeUnusedStyles: false,
      removeUnusedFonts: false,
      removeAlternativeFonts: false,
      removeAlternativeMedias: false,
      removeAlternativeImages: false,
      removeNoScriptTags: false,
      removeFrames: false,
      insertMetaCSP: false,
      loadDeferredImages: true,
      loadDeferredImagesMaxIdleTime: 1500,
      loadDeferredImagesKeepZoomLevel: true,
    },
  },
  {
    id: "compact-review",
    name: "Compact Review",
    description: "压缩静态资源以便快速评审；不适合作为可编辑原件。",
    options: {
      blockScripts: false,
      blockVideos: true,
      blockAudios: true,
      compressHTML: true,
      removeHiddenElements: true,
      removeUnusedStyles: true,
      removeUnusedFonts: true,
      removeAlternativeFonts: true,
      removeAlternativeMedias: true,
      removeAlternativeImages: true,
      removeNoScriptTags: true,
      removeFrames: false,
      insertMetaCSP: false,
      loadDeferredImages: true,
      loadDeferredImagesMaxIdleTime: 500,
      loadDeferredImagesKeepZoomLevel: true,
    },
  },
];

export const DEFAULT_CAPTURE_PROFILE_ID: CaptureProfileId = "editable-fidelity";

export function getCaptureProfile(id: string | undefined): CaptureProfile {
  return CAPTURE_PROFILES.find((profile) => profile.id === id) ?? CAPTURE_PROFILES[0]!;
}

export interface SiteRule {
  origin: string;
  profileId: CaptureProfileId;
  updatedAt: string;
}

export function exactOrigin(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeSiteRule(rule: SiteRule): SiteRule | undefined {
  const origin = exactOrigin(rule.origin);
  if (!origin || !CAPTURE_PROFILES.some((profile) => profile.id === rule.profileId)) return undefined;
  return { origin, profileId: rule.profileId, updatedAt: rule.updatedAt };
}

export function upsertSiteRule(rules: readonly SiteRule[], next: SiteRule): SiteRule[] {
  const normalized = normalizeSiteRule(next);
  if (!normalized) return [...rules];
  return [...rules.filter((rule) => rule.origin !== normalized.origin), normalized]
    .sort((a, b) => a.origin.localeCompare(b.origin));
}

export function removeSiteRule(rules: readonly SiteRule[], origin: string): SiteRule[] {
  const normalized = exactOrigin(origin);
  return normalized ? rules.filter((rule) => rule.origin !== normalized) : [...rules];
}

