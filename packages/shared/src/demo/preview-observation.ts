/**
 * Shared, bounded contract for observing the active preview at runtime.
 *
 * The browser adapter only reports facts.  The service-side evaluator consumes
 * this same envelope and never executes page supplied code or selectors.
 */

import { isValidWorkspacePathSegment } from "../workspace-path";

export const PREVIEW_OBSERVATION_SCHEMA_VERSION = 1 as const;

export const PREVIEW_OBSERVATION_LIMITS = {
  maxRequestBytes: 16 * 1024,
  maxResponseBytes: 64 * 1024,
  maxTargetCandidates: 8,
  maxAncestors: 12,
  maxTextLength: 256,
  maxAssertions: 32,
  maxConcurrentPerConnection: 4,
  maxPending: 256,
  defaultTimeoutMs: 5_000,
  maxTimeoutMs: 10_000,
} as const;

export type PreviewObservationSurface = "active-single-page";
export type PreviewObservationRuntime =
  | "prototype-html-css"
  | "high-fidelity-react"
  | "sandboxed-html"
  | "sketch-scene";

export type PreviewObservationCapability =
  | "page-summary"
  | "target-node"
  | "ancestors"
  | "layout"
  | "runtime"
  | "media"
  | "media-probe"
  | "painted-bounds"
  | "assertions"
  | "limited-host-facts";

export type PreviewObservationAvailability =
  | "observed"
  | "stale"
  | "unavailable"
  | "unsupported";
export type PreviewObservationReadiness = "ready" | "partial" | "runtime-error";
export type PreviewObservationEvidenceKind =
  | "runtime-structure"
  | "current-surface-pixels"
  | "reference-render";
export type PreviewObservationPrecision =
  | "layout"
  | "runtime-self-reported"
  | "painted-bounds"
  | "compositor"
  | "reference";

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewRenderIdentity {
  schemaVersion: typeof PREVIEW_OBSERVATION_SCHEMA_VERSION;
  projectId: string;
  workspaceId: string;
  pageId: string;
  runtimeType: PreviewObservationRuntime;
  surface: PreviewObservationSurface;
  previewInstanceId: string;
  renderGeneration: number;
  revision: number;
  rootHash?: string;
}

export interface PreviewObservationTarget {
  nodeId?: string;
  sourceFile?: string;
  sourceLine?: number;
  selectedElement?: true;
}

export type PreviewObservationDetail =
  | "summary"
  | "layout"
  | "runtime"
  | "media";

export interface PreviewAssertionBase {
  /** A stable, declarative id used to correlate the result. */
  id?: string;
  type: string;
  tolerancePx?: number;
}

export type PreviewAssertion =
  | (PreviewAssertionBase & { type: "exists" })
  | (PreviewAssertionBase & { type: "visible" })
  | (PreviewAssertionBase & {
      type: "centered";
      relativeTo?: "viewport" | "parent" | "node";
      relativeNodeId?: string;
    })
  | (PreviewAssertionBase & { type: "inside"; containerNodeId?: string })
  | (PreviewAssertionBase & { type: "no-horizontal-overflow" })
  | (PreviewAssertionBase & {
      type: "size-range";
      minWidth?: number;
      maxWidth?: number;
      minHeight?: number;
      maxHeight?: number;
    })
  | (PreviewAssertionBase & {
      type: "text-equals" | "text-contains";
      value: string;
    })
  | (PreviewAssertionBase & { type: "image-loaded" })
  | (PreviewAssertionBase & { type: "runtime-ready" })
  | (PreviewAssertionBase & { type: "no-runtime-errors" })
  | (PreviewAssertionBase & { type: "animation-playing" })
  | (PreviewAssertionBase & { type: "animation-name"; value: string })
  | (PreviewAssertionBase & { type: "loop-enabled" })
  | (PreviewAssertionBase & {
      type: "painted-bounds-centered";
      relativeTo?: "viewport" | "parent" | "node";
      relativeNodeId?: string;
    });

export interface ObservePreviewInput {
  pageId?: string;
  target?: PreviewObservationTarget;
  detail?: PreviewObservationDetail;
  includeAncestors?: boolean;
  assertions?: PreviewAssertion[];
  timeoutMs?: number;
}

export interface PreviewViewportFacts {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  designWidth?: number;
  designHeight?: number;
  hostScale?: number;
}

export interface PreviewNodeStyleFacts {
  display?: string;
  visibility?: string;
  opacity?: number;
  position?: string;
  zIndex?: string;
  overflow?: string;
  clipPath?: string;
  transform?: string;
  transformOrigin?: string;
}

export interface PreviewImageFacts {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  failed?: boolean;
}

export type PreviewProbePrecision = "runtime-self-reported" | "painted-bounds";

/** Bounded facts reported by a canonical player probe (currently Spine). */
export interface PreviewSpineProbeFacts {
  kind: "spine";
  ready: boolean;
  animationName?: string;
  animationPlaying?: boolean;
  loopEnabled?: boolean;
  trackTime?: number;
  duration?: number;
  skeletonBounds?: PreviewRect;
  camera?: {
    x: number;
    y: number;
    zoom: number;
    viewportWidth: number;
    viewportHeight: number;
  };
  fit?: "contain" | "cover" | "none";
  alignment?:
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "center"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";
  canvas?: {
    cssWidth: number;
    cssHeight: number;
    backingWidth: number;
    backingHeight: number;
  };
  /** Viewport-relative painted bounds, when projection math is available. */
  paintedBounds?: PreviewRect;
  sampledAt: number;
  precision: PreviewProbePrecision;
}

export type PreviewProbeFacts = PreviewSpineProbeFacts;

export interface PreviewSanitizedUrl {
  origin: string;
  path: string;
  queryHash?: string;
}

export interface PreviewObservedNode {
  nodeId?: string;
  nodeIdStability?: "stable" | "unstable";
  domPath?: string;
  sourceCandidates?: Array<{ file: string; line?: number; column?: number }>;
  componentName?: string;
  rect: PreviewRect;
  clientRects?: PreviewRect[];
  style?: PreviewNodeStyleFacts;
  text?: string;
  ariaLabel?: string;
  url?: PreviewSanitizedUrl;
  image?: PreviewImageFacts;
  parentRect?: PreviewRect;
}

export interface PreviewDocumentFacts {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  bodyScrollWidth?: number;
  bodyScrollHeight?: number;
  horizontalOverflow: boolean;
  verticalOverflow: boolean;
}

export interface PreviewRuntimeSummary {
  readyState: "loading" | "interactive" | "complete";
  fontsReady?: boolean;
  runtimeErrorCount: number;
  consoleErrorCount: number;
}

export interface PreviewObservationFacts {
  identity: PreviewRenderIdentity;
  capabilities: PreviewObservationCapability[];
  viewport: PreviewViewportFacts;
  document: PreviewDocumentFacts;
  runtime: PreviewRuntimeSummary;
  targetResolution?: "resolved" | "not-found" | "ambiguous" | "unsupported";
  target?: PreviewObservedNode;
  targetCandidates?: PreviewObservedNode[];
  ancestors?: PreviewObservedNode[];
  probe?: PreviewProbeFacts;
}

export interface PreviewAssertionEvidence {
  actual?: unknown;
  expected?: unknown;
  /** Optional geometry context for painter-facing assertions. */
  containerRect?: PreviewRect;
  paintedBounds?: PreviewRect;
  skeletonBounds?: PreviewRect;
  tolerancePx?: number;
  precision: PreviewObservationPrecision;
  capability?: PreviewObservationCapability;
}

export interface PreviewAssertionResult {
  id?: string;
  type: PreviewAssertion["type"];
  status: "passed" | "failed" | "uncertain" | "unsupported";
  message?: string;
  evidence?: PreviewAssertionEvidence;
}

export interface PreviewObservationResult {
  availability: PreviewObservationAvailability;
  readiness: PreviewObservationReadiness;
  identity?: PreviewRenderIdentity;
  observedAt?: number;
  capabilities: PreviewObservationCapability[];
  targetResolution?: PreviewObservationFacts["targetResolution"];
  viewport?: PreviewViewportFacts;
  target?: PreviewObservedNode;
  targetCandidates?: PreviewObservedNode[];
  ancestors?: PreviewObservedNode[];
  probe?: PreviewProbeFacts;
  runtime?: PreviewRuntimeSummary;
  assertions: PreviewAssertionResult[];
  assertionStatus:
    | "not-requested"
    | "passed"
    | "failed"
    | "uncertain"
    | "unsupported";
  evidence: {
    kind: PreviewObservationEvidenceKind;
    precision: PreviewObservationPrecision;
  };
  reasons?: string[];
}

const MAX_ID_LENGTH = 256;

function hasSafeCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

function isSafeString(
  value: unknown,
  maxLength = MAX_ID_LENGTH,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    hasSafeCharacters(value)
  );
}

function isSafeIdentitySegment(value: unknown): value is string {
  return isSafeString(value) && isValidWorkspacePathSegment(value);
}

function isSafeRelativeSourcePath(
  value: unknown,
  maxLength = 512,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => isValidWorkspacePathSegment(segment)) &&
    hasSafeCharacters(value)
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPreviewRect(value: unknown): value is PreviewRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  return (
    [rect.x, rect.y, rect.width, rect.height].every(
      (part) => typeof part === "number" && Number.isFinite(part),
    ) &&
    isFiniteNonNegative(rect.width) &&
    isFiniteNonNegative(rect.height)
  );
}

function isPreviewSanitizedUrl(value: unknown): value is PreviewSanitizedUrl {
  if (!value || typeof value !== "object") return false;
  const url = value as Record<string, unknown>;
  return (
    typeof url.origin === "string" &&
    url.origin.length <= 256 &&
    /^https?:\/\//u.test(url.origin) &&
    hasSafeCharacters(url.origin) &&
    typeof url.path === "string" &&
    url.path.length <= 512 &&
    hasSafeCharacters(url.path) &&
    (url.queryHash === undefined ||
      (typeof url.queryHash === "string" &&
        /^[a-f0-9]{1,16}$/u.test(url.queryHash)))
  );
}

export function isPreviewObservedNode(
  value: unknown,
): value is PreviewObservedNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (!isPreviewRect(node.rect)) return false;
  if (
    node.clientRects !== undefined &&
    (!Array.isArray(node.clientRects) ||
      node.clientRects.length > 16 ||
      !node.clientRects.every(isPreviewRect))
  )
    return false;
  if (node.parentRect !== undefined && !isPreviewRect(node.parentRect))
    return false;
  if (node.nodeId !== undefined && !isSafeString(node.nodeId)) return false;
  if (
    node.domPath !== undefined &&
    (typeof node.domPath !== "string" ||
      node.domPath.length === 0 ||
      node.domPath.length > 512 ||
      !hasSafeCharacters(node.domPath))
  )
    return false;
  if (
    node.nodeIdStability !== undefined &&
    node.nodeIdStability !== "stable" &&
    node.nodeIdStability !== "unstable"
  )
    return false;
  if (
    node.componentName !== undefined &&
    !isSafeString(node.componentName, 128)
  )
    return false;
  if (
    node.sourceCandidates !== undefined &&
    (!Array.isArray(node.sourceCandidates) ||
      node.sourceCandidates.length >
        PREVIEW_OBSERVATION_LIMITS.maxTargetCandidates ||
      node.sourceCandidates.some((candidate) => {
        if (!candidate || typeof candidate !== "object") return true;
        const source = candidate as Record<string, unknown>;
        return (
          !isSafeRelativeSourcePath(source.file) ||
          (source.line !== undefined &&
            (!Number.isInteger(source.line) || (source.line as number) < 1)) ||
          (source.column !== undefined &&
            (!Number.isInteger(source.column) || (source.column as number) < 1))
        );
      }))
  )
    return false;
  if (
    node.text !== undefined &&
    (typeof node.text !== "string" ||
      node.text.length > PREVIEW_OBSERVATION_LIMITS.maxTextLength ||
      !hasSafeCharacters(node.text))
  )
    return false;
  if (
    node.ariaLabel !== undefined &&
    (typeof node.ariaLabel !== "string" ||
      node.ariaLabel.length > PREVIEW_OBSERVATION_LIMITS.maxTextLength ||
      !hasSafeCharacters(node.ariaLabel))
  )
    return false;
  if (node.url !== undefined && !isPreviewSanitizedUrl(node.url)) return false;
  if (node.style !== undefined) {
    const style = node.style as Record<string, unknown>;
    if (
      style.opacity !== undefined &&
      (typeof style.opacity !== "number" || !Number.isFinite(style.opacity))
    )
      return false;
    for (const key of [
      "display",
      "visibility",
      "position",
      "zIndex",
      "overflow",
      "clipPath",
      "transform",
      "transformOrigin",
    ]) {
      if (
        style[key] !== undefined &&
        (typeof style[key] !== "string" ||
          style[key].length > 256 ||
          !hasSafeCharacters(style[key] as string))
      )
        return false;
    }
  }
  if (node.image !== undefined) {
    const image = node.image as Record<string, unknown>;
    if (
      typeof image.complete !== "boolean" ||
      !isFiniteNonNegative(image.naturalWidth) ||
      !isFiniteNonNegative(image.naturalHeight) ||
      (image.failed !== undefined && typeof image.failed !== "boolean")
    )
      return false;
  }
  return true;
}

const MAX_PROBE_COORDINATE = 10_000_000;

function isBoundedProbeRect(value: unknown): value is PreviewRect {
  if (!isPreviewRect(value)) return false;
  return [value.x, value.y, value.width, value.height].every(
    (part) => Math.abs(part) <= MAX_PROBE_COORDINATE,
  );
}

const SPINE_FITS = ["contain", "cover", "none"] as const;
const SPINE_ALIGNMENTS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export function isPreviewProbeFacts(
  value: unknown,
): value is PreviewProbeFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const probe = value as Record<string, unknown>;
  if (probe.kind !== "spine" || typeof probe.ready !== "boolean") return false;
  if (
    !isFiniteNonNegative(probe.sampledAt) ||
    !["runtime-self-reported", "painted-bounds"].includes(
      probe.precision as string,
    )
  )
    return false;
  for (const key of ["animationName"] as const) {
    if (probe[key] !== undefined && !isSafeString(probe[key], 256))
      return false;
  }
  for (const key of ["animationPlaying", "loopEnabled"] as const) {
    if (probe[key] !== undefined && typeof probe[key] !== "boolean")
      return false;
  }
  for (const key of ["trackTime", "duration"] as const) {
    if (probe[key] !== undefined && !isFiniteNonNegative(probe[key]))
      return false;
  }
  for (const key of ["skeletonBounds", "paintedBounds"] as const) {
    if (probe[key] !== undefined && !isBoundedProbeRect(probe[key]))
      return false;
  }
  if (
    probe.fit !== undefined &&
    !SPINE_FITS.includes(probe.fit as (typeof SPINE_FITS)[number])
  )
    return false;
  if (
    probe.alignment !== undefined &&
    !SPINE_ALIGNMENTS.includes(
      probe.alignment as (typeof SPINE_ALIGNMENTS)[number],
    )
  )
    return false;
  if (probe.camera !== undefined) {
    if (
      !probe.camera ||
      typeof probe.camera !== "object" ||
      Array.isArray(probe.camera)
    )
      return false;
    const camera = probe.camera as Record<string, unknown>;
    if (
      !["x", "y", "zoom", "viewportWidth", "viewportHeight"].every(
        (key) =>
          typeof camera[key] === "number" && Number.isFinite(camera[key]),
      ) ||
      (camera.zoom as number) <= 0 ||
      (camera.viewportWidth as number) < 0 ||
      (camera.viewportHeight as number) < 0 ||
      [
        camera.x,
        camera.y,
        camera.zoom,
        camera.viewportWidth,
        camera.viewportHeight,
      ].some((part) => Math.abs(part as number) > MAX_PROBE_COORDINATE)
    )
      return false;
  }
  if (probe.canvas !== undefined) {
    if (
      !probe.canvas ||
      typeof probe.canvas !== "object" ||
      Array.isArray(probe.canvas)
    )
      return false;
    const canvas = probe.canvas as Record<string, unknown>;
    if (
      !["cssWidth", "cssHeight", "backingWidth", "backingHeight"].every((key) =>
        isFiniteNonNegative(canvas[key]),
      ) ||
      [
        canvas.cssWidth,
        canvas.cssHeight,
        canvas.backingWidth,
        canvas.backingHeight,
      ].some((part) => (part as number) > MAX_PROBE_COORDINATE)
    )
      return false;
  }
  return true;
}

export function isPreviewObservationFacts(
  value: unknown,
): value is PreviewObservationFacts {
  if (!value || typeof value !== "object") return false;
  const facts = value as Record<string, unknown>;
  if (!isPreviewRenderIdentity(facts.identity)) return false;
  const knownCapabilities = new Set<PreviewObservationCapability>([
    "page-summary",
    "target-node",
    "ancestors",
    "layout",
    "runtime",
    "media",
    "media-probe",
    "painted-bounds",
    "assertions",
    "limited-host-facts",
  ]);
  if (
    !Array.isArray(facts.capabilities) ||
    facts.capabilities.length > knownCapabilities.size ||
    facts.capabilities.some(
      (capability) =>
        typeof capability !== "string" ||
        !knownCapabilities.has(capability as PreviewObservationCapability),
    )
  )
    return false;
  if (
    facts.targetResolution !== undefined &&
    !["resolved", "not-found", "ambiguous", "unsupported"].includes(
      facts.targetResolution as string,
    )
  )
    return false;
  const viewport = facts.viewport as Record<string, unknown> | undefined;
  if (
    !viewport ||
    !isFiniteNonNegative(viewport.width) ||
    !isFiniteNonNegative(viewport.height) ||
    typeof viewport.devicePixelRatio !== "number" ||
    !Number.isFinite(viewport.devicePixelRatio) ||
    viewport.devicePixelRatio <= 0 ||
    typeof viewport.scrollX !== "number" ||
    !Number.isFinite(viewport.scrollX) ||
    typeof viewport.scrollY !== "number" ||
    !Number.isFinite(viewport.scrollY)
  )
    return false;
  const documentFacts = facts.document as Record<string, unknown> | undefined;
  if (
    !documentFacts ||
    !["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"].every(
      (key) => isFiniteNonNegative(documentFacts[key]),
    ) ||
    typeof documentFacts.horizontalOverflow !== "boolean" ||
    typeof documentFacts.verticalOverflow !== "boolean"
  )
    return false;
  const runtime = facts.runtime as Record<string, unknown> | undefined;
  if (
    !runtime ||
    !["loading", "interactive", "complete"].includes(
      runtime.readyState as string,
    ) ||
    !isFiniteNonNegative(runtime.runtimeErrorCount) ||
    !isFiniteNonNegative(runtime.consoleErrorCount)
  )
    return false;
  if (facts.target !== undefined && !isPreviewObservedNode(facts.target))
    return false;
  if (
    facts.targetCandidates !== undefined &&
    (!Array.isArray(facts.targetCandidates) ||
      facts.targetCandidates.length >
        PREVIEW_OBSERVATION_LIMITS.maxTargetCandidates ||
      !facts.targetCandidates.every(isPreviewObservedNode))
  )
    return false;
  if (
    facts.ancestors !== undefined &&
    (!Array.isArray(facts.ancestors) ||
      facts.ancestors.length > PREVIEW_OBSERVATION_LIMITS.maxAncestors ||
      !facts.ancestors.every(isPreviewObservedNode))
  )
    return false;
  if (facts.probe !== undefined && !isPreviewProbeFacts(facts.probe))
    return false;
  return true;
}

const PREVIEW_ASSERTION_TYPES = [
  "exists",
  "visible",
  "centered",
  "inside",
  "no-horizontal-overflow",
  "size-range",
  "text-equals",
  "text-contains",
  "image-loaded",
  "runtime-ready",
  "no-runtime-errors",
  "animation-playing",
  "animation-name",
  "loop-enabled",
  "painted-bounds-centered",
] as const;

function isPreviewAssertionResult(
  value: unknown,
): value is PreviewAssertionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (
    typeof result.type !== "string" ||
    !PREVIEW_ASSERTION_TYPES.includes(
      result.type as (typeof PREVIEW_ASSERTION_TYPES)[number],
    )
  )
    return false;
  if (
    !["passed", "failed", "uncertain", "unsupported"].includes(
      result.status as string,
    )
  )
    return false;
  if (result.id !== undefined && !isSafeString(result.id, 64)) return false;
  if (result.message !== undefined && !isSafeString(result.message, 256))
    return false;
  if (result.evidence !== undefined) {
    if (
      !result.evidence ||
      typeof result.evidence !== "object" ||
      Array.isArray(result.evidence)
    )
      return false;
    const evidence = result.evidence as Record<string, unknown>;
    if (
      ![
        "layout",
        "runtime-self-reported",
        "painted-bounds",
        "compositor",
        "reference",
      ].includes(evidence.precision as string) ||
      (evidence.tolerancePx !== undefined &&
        (typeof evidence.tolerancePx !== "number" ||
          !Number.isFinite(evidence.tolerancePx) ||
          evidence.tolerancePx < 0))
    )
      return false;
    if (
      evidence.capability !== undefined &&
      ![
        "page-summary",
        "target-node",
        "ancestors",
        "layout",
        "runtime",
        "media",
        "media-probe",
        "painted-bounds",
        "assertions",
        "limited-host-facts",
      ].includes(evidence.capability as string)
    )
      return false;
    if (
      (evidence.containerRect !== undefined &&
        !isPreviewRect(evidence.containerRect)) ||
      (evidence.paintedBounds !== undefined &&
        !isPreviewRect(evidence.paintedBounds)) ||
      (evidence.skeletonBounds !== undefined &&
        !isPreviewRect(evidence.skeletonBounds))
    )
      return false;
  }
  return true;
}

export function isPreviewObservationResult(
  value: unknown,
): value is PreviewObservationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (
    !["observed", "stale", "unavailable", "unsupported"].includes(
      result.availability as string,
    )
  )
    return false;
  if (
    !["ready", "partial", "runtime-error"].includes(result.readiness as string)
  )
    return false;
  if (
    result.identity !== undefined &&
    !isPreviewRenderIdentity(result.identity)
  )
    return false;
  if (result.availability === "observed" && result.identity === undefined)
    return false;
  if (
    result.observedAt !== undefined &&
    (typeof result.observedAt !== "number" ||
      !Number.isFinite(result.observedAt) ||
      result.observedAt < 0)
  )
    return false;
  const knownCapabilities = [
    "page-summary",
    "target-node",
    "ancestors",
    "layout",
    "runtime",
    "media",
    "media-probe",
    "painted-bounds",
    "assertions",
    "limited-host-facts",
  ];
  if (
    !Array.isArray(result.capabilities) ||
    result.capabilities.length > knownCapabilities.length ||
    result.capabilities.some(
      (capability) => !knownCapabilities.includes(capability as string),
    )
  )
    return false;
  if (
    result.targetResolution !== undefined &&
    !["resolved", "not-found", "ambiguous", "unsupported"].includes(
      result.targetResolution as string,
    )
  )
    return false;
  if (
    result.viewport !== undefined &&
    !isPreviewObservationFacts({
      identity: result.identity,
      capabilities: result.capabilities,
      viewport: result.viewport,
      document: {
        clientWidth: 0,
        clientHeight: 0,
        scrollWidth: 0,
        scrollHeight: 0,
        horizontalOverflow: false,
        verticalOverflow: false,
      },
      runtime: {
        readyState: "complete",
        runtimeErrorCount: 0,
        consoleErrorCount: 0,
      },
    })
  )
    return false;
  if (result.target !== undefined && !isPreviewObservedNode(result.target))
    return false;
  if (
    result.targetCandidates !== undefined &&
    (!Array.isArray(result.targetCandidates) ||
      result.targetCandidates.length >
        PREVIEW_OBSERVATION_LIMITS.maxTargetCandidates ||
      !result.targetCandidates.every(isPreviewObservedNode))
  )
    return false;
  if (
    result.ancestors !== undefined &&
    (!Array.isArray(result.ancestors) ||
      result.ancestors.length > PREVIEW_OBSERVATION_LIMITS.maxAncestors ||
      !result.ancestors.every(isPreviewObservedNode))
  )
    return false;
  if (result.runtime !== undefined) {
    const runtime = result.runtime as Record<string, unknown>;
    if (
      !["loading", "interactive", "complete"].includes(
        runtime.readyState as string,
      ) ||
      !isFiniteNonNegative(runtime.runtimeErrorCount) ||
      !isFiniteNonNegative(runtime.consoleErrorCount)
    )
      return false;
  }
  if (result.probe !== undefined && !isPreviewProbeFacts(result.probe))
    return false;
  if (
    !Array.isArray(result.assertions) ||
    result.assertions.length > PREVIEW_OBSERVATION_LIMITS.maxAssertions ||
    !result.assertions.every(isPreviewAssertionResult)
  )
    return false;
  if (
    !["not-requested", "passed", "failed", "uncertain", "unsupported"].includes(
      result.assertionStatus as string,
    )
  )
    return false;
  if (
    Array.isArray(result.assertions) &&
    ((result.assertions.length === 0 &&
      result.assertionStatus !== "not-requested") ||
      (result.assertions.length > 0 &&
        result.assertionStatus === "not-requested"))
  )
    return false;
  const evidence = result.evidence as Record<string, unknown> | undefined;
  if (
    !evidence ||
    ![
      "runtime-structure",
      "current-surface-pixels",
      "reference-render",
    ].includes(evidence.kind as string) ||
    ![
      "layout",
      "runtime-self-reported",
      "painted-bounds",
      "compositor",
      "reference",
    ].includes(evidence.precision as string)
  )
    return false;
  if (
    result.reasons !== undefined &&
    (!Array.isArray(result.reasons) ||
      result.reasons.length > 16 ||
      result.reasons.some((reason) => !isSafeString(reason, 256)))
  )
    return false;
  return true;
}

export function isPreviewRenderIdentity(
  value: unknown,
): value is PreviewRenderIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  return (
    identity.schemaVersion === PREVIEW_OBSERVATION_SCHEMA_VERSION &&
    isSafeIdentitySegment(identity.projectId) &&
    isSafeIdentitySegment(identity.workspaceId) &&
    isSafeIdentitySegment(identity.pageId) &&
    [
      "prototype-html-css",
      "high-fidelity-react",
      "sandboxed-html",
      "sketch-scene",
    ].includes(identity.runtimeType as string) &&
    identity.surface === "active-single-page" &&
    isSafeIdentitySegment(identity.previewInstanceId) &&
    typeof identity.renderGeneration === "number" &&
    Number.isInteger(identity.renderGeneration) &&
    identity.renderGeneration >= 0 &&
    typeof identity.revision === "number" &&
    Number.isInteger(identity.revision) &&
    identity.revision >= 0 &&
    (identity.rootHash === undefined || isSafeString(identity.rootHash, 128))
  );
}

export function isPreviewObservationInput(
  value: unknown,
): value is ObservePreviewInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const allowedInputKeys = new Set([
    "pageId",
    "target",
    "detail",
    "includeAncestors",
    "assertions",
    "timeoutMs",
  ]);
  if (Object.keys(input).some((key) => !allowedInputKeys.has(key)))
    return false;
  if (
    input.pageId !== undefined &&
    (!isSafeString(input.pageId) || !isValidWorkspacePathSegment(input.pageId))
  )
    return false;
  if (
    input.detail !== undefined &&
    !["summary", "layout", "runtime", "media"].includes(input.detail as string)
  )
    return false;
  if (
    input.includeAncestors !== undefined &&
    typeof input.includeAncestors !== "boolean"
  )
    return false;
  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) ||
      (input.timeoutMs as number) < 1 ||
      (input.timeoutMs as number) > PREVIEW_OBSERVATION_LIMITS.maxTimeoutMs)
  )
    return false;
  if (input.target !== undefined) {
    if (
      !input.target ||
      typeof input.target !== "object" ||
      Array.isArray(input.target)
    )
      return false;
    const target = input.target as Record<string, unknown>;
    const allowedTargetKeys = new Set([
      "nodeId",
      "sourceFile",
      "sourceLine",
      "selectedElement",
    ]);
    if (Object.keys(target).some((key) => !allowedTargetKeys.has(key)))
      return false;
    const keys = [
      target.nodeId !== undefined,
      target.sourceFile !== undefined,
      target.selectedElement !== undefined,
    ].filter(Boolean).length;
    if (keys !== 1) return false;
    if (target.nodeId !== undefined && !isSafeString(target.nodeId))
      return false;
    if (
      target.sourceFile !== undefined &&
      (typeof target.sourceFile !== "string" ||
        !isSafeRelativeSourcePath(target.sourceFile))
    )
      return false;
    if (
      target.sourceLine !== undefined &&
      (!Number.isInteger(target.sourceLine) ||
        (target.sourceLine as number) < 1)
    )
      return false;
    if (target.selectedElement !== undefined && target.selectedElement !== true)
      return false;
  }
  if (
    input.assertions !== undefined &&
    (!Array.isArray(input.assertions) ||
      input.assertions.length > PREVIEW_OBSERVATION_LIMITS.maxAssertions ||
      input.assertions.some((assertion) => !isPreviewAssertion(assertion)))
  )
    return false;
  return true;
}

export function isPreviewAssertion(value: unknown): value is PreviewAssertion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const assertion = value as Record<string, unknown>;
  const type = assertion.type;
  if (
    typeof type !== "string" ||
    ![
      "exists",
      "visible",
      "centered",
      "inside",
      "no-horizontal-overflow",
      "size-range",
      "text-equals",
      "text-contains",
      "image-loaded",
      "runtime-ready",
      "no-runtime-errors",
      "animation-playing",
      "animation-name",
      "loop-enabled",
      "painted-bounds-centered",
    ].includes(type)
  )
    return false;
  const allowedKeys = new Set(["id", "type", "tolerancePx"]);
  if (type === "centered") {
    allowedKeys.add("relativeTo");
    allowedKeys.add("relativeNodeId");
  } else if (type === "inside") {
    allowedKeys.add("containerNodeId");
  } else if (type === "size-range") {
    allowedKeys.add("minWidth");
    allowedKeys.add("maxWidth");
    allowedKeys.add("minHeight");
    allowedKeys.add("maxHeight");
  } else if (type === "text-equals" || type === "text-contains") {
    allowedKeys.add("value");
  } else if (type === "animation-name") {
    allowedKeys.add("value");
  } else if (type === "painted-bounds-centered") {
    allowedKeys.add("relativeTo");
    allowedKeys.add("relativeNodeId");
  }
  if (Object.keys(assertion).some((key) => !allowedKeys.has(key))) return false;
  if (assertion.id !== undefined && !isSafeString(assertion.id, 64))
    return false;
  if (
    assertion.tolerancePx !== undefined &&
    (typeof assertion.tolerancePx !== "number" ||
      !Number.isFinite(assertion.tolerancePx) ||
      assertion.tolerancePx < 0 ||
      assertion.tolerancePx > 10_000)
  )
    return false;
  if (
    (type === "text-equals" || type === "text-contains") &&
    (typeof assertion.value !== "string" ||
      assertion.value.length > PREVIEW_OBSERVATION_LIMITS.maxTextLength ||
      !hasSafeCharacters(assertion.value))
  )
    return false;
  if (
    type === "animation-name" &&
    (typeof assertion.value !== "string" ||
      assertion.value.length === 0 ||
      assertion.value.length > PREVIEW_OBSERVATION_LIMITS.maxTextLength ||
      !hasSafeCharacters(assertion.value))
  )
    return false;
  for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
    if (
      assertion[key] !== undefined &&
      (typeof assertion[key] !== "number" ||
        !Number.isFinite(assertion[key] as number) ||
        (assertion[key] as number) < 0)
    )
      return false;
  }
  if (
    (type === "centered" || type === "painted-bounds-centered") &&
    assertion.relativeTo !== undefined &&
    !["viewport", "parent", "node"].includes(assertion.relativeTo as string)
  )
    return false;
  if (
    (type === "centered" || type === "painted-bounds-centered") &&
    assertion.relativeNodeId !== undefined &&
    !isSafeString(assertion.relativeNodeId)
  )
    return false;
  return true;
}

export function sanitizePreviewText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let sanitized = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    sanitized += code <= 0x1f || code === 0x7f ? " " : char;
  }
  return sanitized.slice(0, PREVIEW_OBSERVATION_LIMITS.maxTextLength);
}

/** Remove credentials/query content before a URL is included in facts. */
export function sanitizePreviewUrl(
  value: unknown,
): PreviewSanitizedUrl | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const result: PreviewSanitizedUrl = {
      origin: url.origin,
      path: url.pathname,
    };
    if (url.search) {
      // A stable opaque marker is sufficient for diagnostics without exposing
      // query values.  This intentionally does not attempt to be cryptographic.
      let hash = 2166136261;
      for (const char of url.search)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      result.queryHash = (hash >>> 0).toString(16);
    }
    return result;
  } catch {
    return undefined;
  }
}

function center(rect: PreviewRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function assertionTarget(
  facts: PreviewObservationFacts,
): PreviewObservedNode | undefined {
  return facts.target;
}

export function evaluatePreviewAssertions(
  facts: PreviewObservationFacts,
  assertions: readonly PreviewAssertion[] = [],
): PreviewAssertionResult[] {
  return assertions.map((assertion) => {
    const target = assertionTarget(facts);
    const base = { id: assertion.id, type: assertion.type } as const;
    if (assertion.type === "runtime-ready") {
      return {
        ...base,
        status:
          facts.runtime.readyState === "complete" &&
          facts.targetResolution !== "unsupported"
            ? "passed"
            : "failed",
        evidence: {
          actual: facts.runtime.readyState,
          expected: "complete",
          precision: "layout",
          capability: "runtime",
        },
      };
    }
    if (assertion.type === "no-runtime-errors") {
      const actual =
        facts.runtime.runtimeErrorCount + facts.runtime.consoleErrorCount;
      return {
        ...base,
        status: actual === 0 ? "passed" : "failed",
        evidence: {
          actual,
          expected: 0,
          precision: "runtime-self-reported",
          capability: "runtime",
        },
      };
    }
    if (
      assertion.type === "animation-playing" ||
      assertion.type === "animation-name" ||
      assertion.type === "loop-enabled"
    ) {
      const probe = facts.probe;
      if (
        !probe ||
        probe.kind !== "spine" ||
        !facts.capabilities.includes("media-probe")
      ) {
        return {
          ...base,
          status: "unsupported",
          message: "当前预览没有可用的 Spine runtime probe",
          evidence: {
            precision: "runtime-self-reported",
            capability: "media-probe",
          },
        };
      }
      if (assertion.type === "animation-playing") {
        if (probe.animationPlaying === undefined)
          return {
            ...base,
            status: "unsupported",
            message: "Spine probe 未提供播放状态",
            evidence: {
              precision: "runtime-self-reported",
              capability: "media-probe",
            },
          };
        return {
          ...base,
          status: probe.animationPlaying ? "passed" : "failed",
          evidence: {
            actual: probe.animationPlaying,
            expected: true,
            precision: "runtime-self-reported",
            capability: "media-probe",
          },
        };
      }
      if (assertion.type === "loop-enabled") {
        if (probe.loopEnabled === undefined)
          return {
            ...base,
            status: "unsupported",
            message: "Spine probe 未提供循环状态",
            evidence: {
              precision: "runtime-self-reported",
              capability: "media-probe",
            },
          };
        return {
          ...base,
          status: probe.loopEnabled ? "passed" : "failed",
          evidence: {
            actual: probe.loopEnabled,
            expected: true,
            precision: "runtime-self-reported",
            capability: "media-probe",
          },
        };
      }
      if (probe.animationName === undefined)
        return {
          ...base,
          status: "unsupported",
          message: "Spine probe 未提供动画名称",
          evidence: {
            precision: "runtime-self-reported",
            capability: "media-probe",
          },
        };
      return {
        ...base,
        status: probe.animationName === assertion.value ? "passed" : "failed",
        evidence: {
          actual: probe.animationName,
          expected: assertion.value,
          precision: "runtime-self-reported",
          capability: "media-probe",
        },
      };
    }
    if (assertion.type === "painted-bounds-centered") {
      const probe = facts.probe;
      if (
        !probe ||
        probe.kind !== "spine" ||
        !facts.capabilities.includes("painted-bounds") ||
        probe.precision !== "painted-bounds" ||
        !probe.paintedBounds
      ) {
        return {
          ...base,
          status: "unsupported",
          message: "当前预览没有可用的 painted bounds probe",
          evidence: {
            precision: "painted-bounds",
            capability: "painted-bounds",
          },
        };
      }
      const relativeTo = assertion.relativeTo ?? "viewport";
      const container =
        relativeTo === "viewport"
          ? {
              x: 0,
              y: 0,
              width: facts.viewport.width,
              height: facts.viewport.height,
            }
          : relativeTo === "parent"
            ? target?.parentRect
            : facts.ancestors?.find(
                (node) => node.nodeId === assertion.relativeNodeId,
              )?.rect;
      if (!container)
        return {
          ...base,
          status: "uncertain",
          message: "未找到 painted bounds 的居中参照节点",
          evidence: {
            precision: "painted-bounds",
            capability: "painted-bounds",
          },
        };
      const actual = center(probe.paintedBounds);
      const expected = center(container);
      const tolerance = assertion.tolerancePx ?? 1;
      const passed =
        Math.abs(actual.x - expected.x) <= tolerance &&
        Math.abs(actual.y - expected.y) <= tolerance;
      return {
        ...base,
        status: passed ? "passed" : "failed",
        evidence: {
          actual,
          expected,
          containerRect: container,
          paintedBounds: probe.paintedBounds,
          ...(probe.skeletonBounds
            ? { skeletonBounds: probe.skeletonBounds }
            : {}),
          tolerancePx: tolerance,
          precision: "painted-bounds",
          capability: "painted-bounds",
        },
      };
    }
    if (assertion.type === "no-horizontal-overflow") {
      return {
        ...base,
        status: facts.document.horizontalOverflow ? "failed" : "passed",
        evidence: {
          actual: facts.document.horizontalOverflow,
          expected: false,
          precision: "layout",
          capability: "layout",
        },
      };
    }
    if (!target && assertion.type === "exists") {
      const missing = facts.targetResolution === "not-found";
      if (facts.targetResolution === "unsupported") {
        return {
          ...base,
          status: "unsupported",
          message: "当前目标定位能力不支持该目标类型",
        };
      }
      return {
        ...base,
        status: missing ? "failed" : "uncertain",
        message: missing ? "目标节点不存在" : "未能确定目标节点是否存在",
        evidence: {
          actual: false,
          expected: true,
          precision: "layout",
          capability: "target-node",
        },
      };
    }
    if (!target) {
      if (facts.targetResolution === "unsupported") {
        return {
          ...base,
          status: "unsupported",
          message: "当前目标定位能力不支持该目标类型",
        };
      }
      return {
        ...base,
        status: "uncertain",
        message: "断言需要已解析的目标节点",
      };
    }
    if (assertion.type === "exists") {
      return {
        ...base,
        status: "passed",
        evidence: {
          actual: true,
          expected: true,
          precision: "layout",
          capability: "target-node",
        },
      };
    }
    if (assertion.type === "visible") {
      const style = target.style;
      const visible =
        target.rect.width > 0 &&
        target.rect.height > 0 &&
        style?.display !== "none" &&
        style?.visibility !== "hidden" &&
        (style?.opacity === undefined || style.opacity > 0);
      return {
        ...base,
        status: visible ? "passed" : "failed",
        evidence: {
          actual: visible,
          expected: true,
          precision: "layout",
          capability: "layout",
        },
      };
    }
    if (assertion.type === "image-loaded") {
      const image = target.image;
      if (!image)
        return {
          ...base,
          status: "unsupported",
          message: "目标不是可观测图片",
          evidence: { precision: "runtime-self-reported", capability: "media" },
        };
      const loaded =
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0 &&
        image.failed !== true;
      return {
        ...base,
        status: loaded ? "passed" : "failed",
        evidence: {
          actual: loaded,
          expected: true,
          precision: "runtime-self-reported",
          capability: "media",
        },
      };
    }
    if (
      assertion.type === "text-equals" ||
      assertion.type === "text-contains"
    ) {
      const actual = target.text ?? "";
      const passed =
        assertion.type === "text-equals"
          ? actual === assertion.value
          : actual.includes(assertion.value);
      return {
        ...base,
        status: passed ? "passed" : "failed",
        evidence: {
          actual,
          expected: assertion.value,
          precision: "layout",
          capability: "target-node",
        },
      };
    }
    if (assertion.type === "size-range") {
      const { width, height } = target.rect;
      const passed =
        (assertion.minWidth === undefined || width >= assertion.minWidth) &&
        (assertion.maxWidth === undefined || width <= assertion.maxWidth) &&
        (assertion.minHeight === undefined || height >= assertion.minHeight) &&
        (assertion.maxHeight === undefined || height <= assertion.maxHeight);
      return {
        ...base,
        status: passed ? "passed" : "failed",
        evidence: {
          actual: { width, height },
          expected: {
            minWidth: assertion.minWidth,
            maxWidth: assertion.maxWidth,
            minHeight: assertion.minHeight,
            maxHeight: assertion.maxHeight,
          },
          precision: "layout",
          capability: "layout",
        },
      };
    }
    if (assertion.type === "inside") {
      const container = assertion.containerNodeId
        ? facts.ancestors?.find(
            (node) => node.nodeId === assertion.containerNodeId,
          )
        : target.parentRect
          ? ({ rect: target.parentRect } as PreviewObservedNode)
          : undefined;
      if (!container)
        return { ...base, status: "uncertain", message: "未找到容器节点" };
      const tolerance = assertion.tolerancePx ?? 0;
      const passed =
        target.rect.x >= container.rect.x - tolerance &&
        target.rect.y >= container.rect.y - tolerance &&
        target.rect.x + target.rect.width <=
          container.rect.x + container.rect.width + tolerance &&
        target.rect.y + target.rect.height <=
          container.rect.y + container.rect.height + tolerance;
      return {
        ...base,
        status: passed ? "passed" : "failed",
        evidence: {
          actual: target.rect,
          expected: container.rect,
          tolerancePx: tolerance,
          precision: "layout",
          capability: "layout",
        },
      };
    }
    if (assertion.type === "centered") {
      const relativeTo = assertion.relativeTo ?? "viewport";
      const container =
        relativeTo === "viewport"
          ? {
              x: 0,
              y: 0,
              width: facts.viewport.width,
              height: facts.viewport.height,
            }
          : relativeTo === "parent"
            ? target.parentRect
            : facts.ancestors?.find(
                (node) => node.nodeId === assertion.relativeNodeId,
              )?.rect;
      if (!container)
        return { ...base, status: "uncertain", message: "未找到居中参照节点" };
      const actual = center(target.rect);
      const expected = center(container);
      const tolerance = assertion.tolerancePx ?? 1;
      const passed =
        Math.abs(actual.x - expected.x) <= tolerance &&
        Math.abs(actual.y - expected.y) <= tolerance;
      return {
        ...base,
        status: passed ? "passed" : "failed",
        evidence: {
          actual,
          expected,
          tolerancePx: tolerance,
          precision: "layout",
          capability: "layout",
        },
      };
    }
    return { ...base, status: "unsupported" };
  });
}

export function summarizePreviewAssertionStatus(
  results: readonly PreviewAssertionResult[],
): PreviewObservationResult["assertionStatus"] {
  if (results.length === 0) return "not-requested";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.some((result) => result.status === "uncertain"))
    return "uncertain";
  if (results.every((result) => result.status === "unsupported"))
    return "unsupported";
  if (results.some((result) => result.status === "unsupported"))
    return "uncertain";
  return "passed";
}

/** Build the bounded E1 result returned to an ObservationBroker. */
export function createPreviewObservationResult(
  facts: PreviewObservationFacts,
  assertions: readonly PreviewAssertion[] = [],
): PreviewObservationResult {
  const assertionResults = evaluatePreviewAssertions(facts, assertions);
  return {
    availability: "observed",
    readiness:
      facts.runtime.runtimeErrorCount > 0
        ? "runtime-error"
        : facts.runtime.readyState === "complete"
          ? "ready"
          : "partial",
    identity: facts.identity,
    observedAt: Date.now(),
    capabilities: facts.capabilities,
    targetResolution: facts.targetResolution,
    viewport: facts.viewport,
    target: facts.target,
    targetCandidates: facts.targetCandidates,
    ancestors: facts.ancestors,
    probe: facts.probe,
    runtime: facts.runtime,
    assertions: assertionResults,
    assertionStatus: summarizePreviewAssertionStatus(assertionResults),
    evidence: { kind: "runtime-structure", precision: "layout" },
    reasons:
      facts.runtime.runtimeErrorCount > 0
        ? ["runtime-error-present"]
        : undefined,
  };
}

export function isPreviewObservationPayloadWithinLimit(
  value: unknown,
  limit = PREVIEW_OBSERVATION_LIMITS.maxResponseBytes,
): boolean {
  try {
    const serialized = JSON.stringify(value);
    const byteLength =
      typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(serialized).byteLength
        : serialized.length;
    return byteLength <= limit;
  } catch {
    return false;
  }
}
