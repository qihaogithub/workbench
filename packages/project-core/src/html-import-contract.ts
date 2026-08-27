import crypto from "node:crypto";
import type {
  HtmlImportPresentationRecommendation,
  PagePresentationProfile,
} from "@workbench/shared";

export const HTML_IMPORT_ANALYSIS_VERSION = 2 as const;
export const HTML_IMPORT_SANDBOX_POLICY_VERSION = 1 as const;
export const HTML_IMPORT_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const HTML_IMPORT_MAX_DATA_URL_BYTES = 1024 * 1024;
export const HTML_IMPORT_MAX_TOTAL_DATA_URL_BYTES = 2 * 1024 * 1024;

export type HtmlImportRuntime = "prototype-html-css" | "sandboxed-html";
export type HtmlImportCompatibility = "complete" | "degraded" | "blocked";
export type HtmlImportSourceKind = "figma-export" | "unknown";

/** Analyzer evidence for an import's origin; filenames never grant trust. */
export interface HtmlImportSource {
  kind: HtmlImportSourceKind;
  confirmationBypassEligible: boolean;
}

export const HTML_IMPORT_SIGNAL_CODES = [
  "classic-script",
  "inline-module-script",
  "event-handler-attribute",
  "javascript-url",
  "inert-data-script",
  "data-url-resource",
  "srcset-resource",
] as const;

export type HtmlImportSignalCode = (typeof HTML_IMPORT_SIGNAL_CODES)[number];

export const HTML_IMPORT_UNSUPPORTED_CAPABILITY_CODES = [
  "external-script",
  "external-module-import",
  "embedded-browsing-context",
  "base-url",
  "meta-refresh",
  "relative-resource",
  "remote-resource",
  "form-submission",
  "worker",
  "service-worker",
  "popup",
  "download",
  "sensitive-permission",
  "blob-script",
  "data-url-too-large",
  "css-external-resource",
] as const;

export type HtmlUnsupportedCapabilityCode =
  (typeof HTML_IMPORT_UNSUPPORTED_CAPABILITY_CODES)[number];

export const HTML_IMPORT_WARNING_CODES = [
  "runtime-error-possible",
  "empty-first-frame-possible",
  "continuous-animation-possible",
  "restricted-api-possible",
] as const;

export type HtmlImportWarningCode = (typeof HTML_IMPORT_WARNING_CODES)[number];

export const HTML_IMPORT_REJECTION_CODES = [
  "HTML_IMPORT_INVALID",
  "HTML_IMPORT_TOO_LARGE",
  "HTML_IMPORT_NOT_RENDERABLE",
  "HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED",
  "HTML_IMPORT_EMBED_UNSUPPORTED",
  "HTML_IMPORT_CAPABILITY_RESTRICTED",
  "HTML_IMPORT_INTERACTIVE_NOT_YET_SUPPORTED",
] as const;

export type HtmlImportRejectionCode = (typeof HTML_IMPORT_REJECTION_CODES)[number];

export type HtmlImportResourceClassification =
  | "fragment"
  | "data"
  | "blob"
  | "relative"
  | "remote"
  | "javascript"
  | "other";

/** Whether a reference remains usable by the single-document import policy. */
export type HtmlImportResourceImpact = "preserved" | "blocked";

/** A safe next action shown to users; it never asks the importer to fetch a URL. */
export type HtmlImportResourceRemediation =
  | "none"
  | "embed-as-data-url"
  | "include-in-bundle"
  | "replace-or-localize"
  | "replace-with-safe-link";

export interface HtmlImportSignal {
  code: HtmlImportSignalCode;
  path: string;
  detail?: string;
}

export interface HtmlUnsupportedCapability {
  code: HtmlUnsupportedCapabilityCode;
  path: string;
  detail?: string;
}

export interface HtmlResourceReference {
  tagName: string;
  attributeName: string;
  value: string;
  classification: HtmlImportResourceClassification;
  impact: HtmlImportResourceImpact;
  remediation: HtmlImportResourceRemediation;
  path: string;
}

export interface HtmlImportWarning {
  code: HtmlImportWarningCode;
  path?: string;
  detail?: string;
}

export type HtmlImportOutcome =
  | { status: "accepted"; runtimeType: HtmlImportRuntime }
  | { status: "rejected"; code: HtmlImportRejectionCode };

export interface HtmlImportAnalysis {
  analysisVersion: typeof HTML_IMPORT_ANALYSIS_VERSION;
  /** Execution is chosen solely from executable document capabilities. */
  runtimeType?: HtmlImportRuntime;
  /** Import quality is deliberately independent from the chosen runtime. */
  compatibility: HtmlImportCompatibility;
  outcome: HtmlImportOutcome;
  signals: HtmlImportSignal[];
  unsupportedCapabilities: HtmlUnsupportedCapability[];
  resourceReferences: HtmlResourceReference[];
  warnings: HtmlImportWarning[];
  source: HtmlImportSource;
  detectedTitle?: string;
  detectedViewport?: { width: number; height: number };
  presentation: HtmlImportPresentationRecommendation;
  sourceHash: string;
  normalizedHash: string;
}

/**
 * One shared confirmation decision for prepare and commit. Trusted Figma
 * exports may bypass acknowledgement, while resource blocking is unchanged.
 */
export function requiresHtmlImportConfirmation(
  analysis: Pick<
    HtmlImportAnalysis,
    "compatibility" | "presentation" | "source"
  >,
): boolean {
  if (analysis.source.confirmationBypassEligible) return false;
  return (
    analysis.compatibility === "degraded" ||
    analysis.presentation.confirmationRequired
  );
}

export type { HtmlImportPresentationRecommendation, PagePresentationProfile };

/** Hashes the exact UTF-8 analyzer input; callers must decode bytes before analysis. */
export function hashHtmlImportSource(source: string): string {
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

export function sortHtmlImportAnalysisCollections(
  input: Pick<
    HtmlImportAnalysis,
    "signals" | "unsupportedCapabilities" | "resourceReferences" | "warnings"
  >,
): typeof input {
  const compare = (left: { code: string; path?: string; detail?: string }, right: { code: string; path?: string; detail?: string }) =>
    left.code.localeCompare(right.code) ||
    (left.path ?? "").localeCompare(right.path ?? "") ||
    (left.detail ?? "").localeCompare(right.detail ?? "");
  return {
    signals: [...input.signals].sort(compare),
    unsupportedCapabilities: [...input.unsupportedCapabilities].sort(compare),
    resourceReferences: [...input.resourceReferences].sort((left, right) =>
      left.path.localeCompare(right.path) ||
      left.attributeName.localeCompare(right.attributeName) ||
      left.value.localeCompare(right.value),
    ),
    warnings: [...input.warnings].sort(compare),
  };
}
