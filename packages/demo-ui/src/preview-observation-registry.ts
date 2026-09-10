import {
  PREVIEW_OBSERVATION_LIMITS,
  createPreviewObservationResult,
  isPreviewObservationInput,
  isPreviewProbeFacts,
  isPreviewRenderIdentity,
  sanitizePreviewText,
  sanitizePreviewUrl,
  type ObservePreviewInput,
  type PreviewDocumentFacts,
  type PreviewNodeStyleFacts,
  type PreviewObservationCapability,
  type PreviewObservationFacts,
  type PreviewObservationResult,
  type PreviewObservedNode,
  type PreviewProbeFacts,
  type PreviewRenderIdentity,
  type PreviewRuntimeSummary,
} from "@workbench/shared/demo/preview-observation";
import { isValidWorkspacePathSegment } from "@workbench/shared/workspace-path";

export interface PreviewObservationRegistration {
  identity: PreviewRenderIdentity;
  root: Element;
  selectedElement?: Element | null;
  capabilities?: PreviewObservationCapability[];
  runtime?: Partial<PreviewRuntimeSummary>;
  /** A sleeping canvas/iframe runtime is retained for visual fallback only. */
  activityState?: "active" | "sleeping";
}

const PREVIEW_PROBE_PROPERTY = "__workbenchPreviewProbe__";

type PreviewProbeHandle = {
  inspect?: () => unknown;
  snapshot?: unknown;
};

function readPreviewProbe(root: Element): PreviewProbeFacts | undefined {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of elements) {
    const candidate = (
      element as Element & {
        __workbenchPreviewProbe__?: PreviewProbeHandle;
      }
    )[PREVIEW_PROBE_PROPERTY];
    if (!candidate || typeof candidate !== "object") continue;
    try {
      const value =
        typeof candidate.inspect === "function"
          ? candidate.inspect()
          : candidate.snapshot;
      if (isPreviewProbeFacts(value)) return value;
    } catch {
      // A runtime probe is advisory and must never break the base E1 adapter.
    }
  }
  return undefined;
}

function asFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function hasSafeSourceFile(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => isValidWorkspacePathSegment(segment))
  );
}

function rectOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    x: asFinite(rect.x),
    y: asFinite(rect.y),
    width: Math.max(0, asFinite(rect.width)),
    height: Math.max(0, asFinite(rect.height)),
  };
}

function styleOf(element: Element): PreviewNodeStyleFacts {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return {};
  const opacity = Number.parseFloat(style.opacity);
  return {
    display: style.display,
    visibility: style.visibility,
    opacity: Number.isFinite(opacity) ? opacity : undefined,
    position: style.position,
    zIndex: style.zIndex,
    overflow: style.overflow,
    clipPath: style.clipPath,
    transform: style.transform,
    transformOrigin: style.transformOrigin,
  };
}

function findStableNode(root: Element, nodeId: string): Element | null {
  const elements = [root, ...Array.from(root.querySelectorAll("[data-ow-id]"))];
  return (
    elements.find((element) => element.getAttribute("data-ow-id") === nodeId) ??
    null
  );
}

function findSourceNodes(
  root: Element,
  sourceFile: string,
  sourceLine?: number,
): Element[] {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  return elements
    .filter(
      (element) => element.getAttribute("data-source-file") === sourceFile,
    )
    .filter((element) => {
      if (sourceLine === undefined) return true;
      const value = Number.parseInt(
        element.getAttribute("data-source-line") || "",
        10,
      );
      return value === sourceLine;
    })
    .slice(0, PREVIEW_OBSERVATION_LIMITS.maxTargetCandidates);
}

function domPathOf(element: Element, root: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const tagName = current.tagName;
    const siblings: Element[] = Array.from(parent.children).filter(
      (child: Element) => child.tagName === tagName,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(
      `${tagName.toLowerCase()}:nth-of-type(${Math.max(index, 1)})`,
    );
    current = parent;
  }
  return parts.length ? `preview-root > ${parts.join(" > ")}` : "preview-root";
}

function nodeOf(element: Element, root: Element): PreviewObservedNode {
  const tagName = element.tagName.toLowerCase();
  const isFormOrEditable =
    ["input", "textarea", "select", "option"].includes(tagName) ||
    element.hasAttribute("contenteditable") ||
    (element as Element & { isContentEditable?: boolean }).isContentEditable ===
      true;
  const imageElement =
    tagName === "img"
      ? (element as Element & {
          complete?: boolean;
          naturalWidth?: number;
          naturalHeight?: number;
        })
      : null;
  const image = imageElement
    ? {
        complete: imageElement.complete === true,
        naturalWidth: Number(imageElement.naturalWidth) || 0,
        naturalHeight: Number(imageElement.naturalHeight) || 0,
        failed:
          imageElement.complete === true &&
          Number(imageElement.naturalWidth) === 0,
      }
    : undefined;
  const link =
    tagName === "a"
      ? element.getAttribute("href")
      : element.getAttribute("src");
  const sourceFile = element.getAttribute("data-source-file");
  const sourceLine = Number.parseInt(
    element.getAttribute("data-source-line") || "",
    10,
  );
  const safeSourceFile =
    sourceFile && hasSafeSourceFile(sourceFile) && sourceFile.length <= 512
      ? sourceFile
      : undefined;
  return {
    nodeId: element.getAttribute("data-ow-id") || undefined,
    nodeIdStability: element.hasAttribute("data-ow-id") ? "stable" : "unstable",
    domPath: domPathOf(element, root),
    componentName: element.tagName.toLowerCase(),
    rect: rectOf(element),
    clientRects: Array.from(element.getClientRects())
      .slice(0, 16)
      .map((rect) => ({
        x: asFinite(rect.x),
        y: asFinite(rect.y),
        width: Math.max(0, asFinite(rect.width)),
        height: Math.max(0, asFinite(rect.height)),
      })),
    style: styleOf(element),
    text: isFormOrEditable
      ? undefined
      : sanitizePreviewText(
          element.children.length === 0 ? element.textContent : null,
        ),
    ariaLabel: sanitizePreviewText(element.getAttribute("aria-label")),
    url: link ? sanitizePreviewUrl(link) : undefined,
    image,
    parentRect: element.parentElement
      ? rectOf(element.parentElement)
      : undefined,
    sourceCandidates: safeSourceFile
      ? [
          {
            file: safeSourceFile,
            line:
              Number.isInteger(sourceLine) && sourceLine > 0
                ? sourceLine
                : undefined,
          },
        ]
      : [],
  };
}

function documentFacts(document: Document): PreviewDocumentFacts {
  const root = document.documentElement;
  const body = document.body;
  const clientWidth = Math.max(0, root?.clientWidth ?? 0);
  const clientHeight = Math.max(0, root?.clientHeight ?? 0);
  const scrollWidth = Math.max(clientWidth, root?.scrollWidth ?? 0);
  const scrollHeight = Math.max(clientHeight, root?.scrollHeight ?? 0);
  return {
    clientWidth,
    clientHeight,
    scrollWidth,
    scrollHeight,
    bodyScrollWidth: body?.scrollWidth,
    bodyScrollHeight: body?.scrollHeight,
    horizontalOverflow: scrollWidth > clientWidth + 1,
    verticalOverflow: scrollHeight > clientHeight + 1,
  };
}

function unavailable(
  reason: string,
  capabilities: PreviewObservationCapability[] = [],
): PreviewObservationResult {
  return {
    availability: "unavailable",
    readiness: "partial",
    capabilities,
    assertions: [],
    assertionStatus: "not-requested",
    evidence: { kind: "runtime-structure", precision: "layout" },
    reasons: [reason],
  };
}

function unsupported(
  identity: PreviewRenderIdentity,
  reason: string,
  capabilities: PreviewObservationCapability[] = [],
): PreviewObservationResult {
  return {
    availability: "unsupported",
    readiness: "partial",
    identity,
    capabilities,
    assertions: [],
    assertionStatus: "not-requested",
    evidence: { kind: "runtime-structure", precision: "layout" },
    reasons: [reason],
  };
}

export function collectPreviewObservation(
  registration: PreviewObservationRegistration,
  input: ObservePreviewInput = {},
): PreviewObservationResult {
  if (!isPreviewObservationInput(input)) return unavailable("invalid-request");
  const { identity, root } = registration;
  if (input.pageId !== undefined && input.pageId !== identity.pageId)
    return unavailable("page-not-active", registration.capabilities ?? []);
  if (registration.activityState === "sleeping") {
    return unavailable("preview-sleeping", registration.capabilities ?? []);
  }
  if (!root.isConnected) {
    return unavailable("preview-unmounted", registration.capabilities ?? []);
  }
  if (identity.runtimeType === "sandboxed-html") {
    return unsupported(identity, "sandbox-runtime-observation-limited", [
      "limited-host-facts",
    ]);
  }
  if (identity.runtimeType === "sketch-scene") {
    return unsupported(identity, "sketch-runtime-observation-unsupported");
  }
  const document = root.ownerDocument;
  const view = document.defaultView;
  const baseCapabilities = registration.capabilities ?? [
    "page-summary",
    "target-node",
    "layout",
    "runtime",
    "media",
    "assertions",
  ];
  const needsProbe =
    input.detail === "media" ||
    input.assertions?.some((assertion) =>
      [
        "animation-playing",
        "animation-name",
        "loop-enabled",
        "painted-bounds-centered",
      ].includes(assertion.type),
    );
  const probe = needsProbe ? readPreviewProbe(root) : undefined;
  const capabilities = [...baseCapabilities];
  if (probe) {
    if (!capabilities.includes("media-probe")) capabilities.push("media-probe");
    if (probe.paintedBounds && !capabilities.includes("painted-bounds"))
      capabilities.push("painted-bounds");
  }
  const runtime: PreviewRuntimeSummary = {
    readyState:
      document.readyState === "loading" || document.readyState === "interactive"
        ? document.readyState
        : "complete",
    fontsReady: document.fonts?.status === "loaded",
    runtimeErrorCount: registration.runtime?.runtimeErrorCount ?? 0,
    consoleErrorCount: registration.runtime?.consoleErrorCount ?? 0,
  };
  const sourceCandidates = input.target?.sourceFile
    ? findSourceNodes(root, input.target.sourceFile, input.target.sourceLine)
    : [];
  const selectedElement =
    registration.selectedElement &&
    (registration.selectedElement === root ||
      root.contains(registration.selectedElement))
      ? registration.selectedElement
      : null;
  const targetElement = input.target?.nodeId
    ? findStableNode(root, input.target.nodeId)
    : input.target?.selectedElement
      ? selectedElement
      : input.target?.sourceFile && sourceCandidates.length === 1
        ? sourceCandidates[0]
        : undefined;
  const targetResolution = input.target
    ? input.target.sourceFile
      ? sourceCandidates.length === 0
        ? "not-found"
        : sourceCandidates.length === 1
          ? "resolved"
          : "ambiguous"
      : targetElement
        ? "resolved"
        : "not-found"
    : undefined;
  const target = targetElement ? nodeOf(targetElement, root) : undefined;
  const targetCandidates =
    input.target?.sourceFile && sourceCandidates.length > 1
      ? sourceCandidates.map((element) => nodeOf(element, root))
      : undefined;
  const ancestors =
    input.includeAncestors && targetElement
      ? (() => {
          const result: Element[] = [];
          let current = targetElement.parentElement;
          while (
            current &&
            current !== root &&
            result.length < PREVIEW_OBSERVATION_LIMITS.maxAncestors
          ) {
            result.push(current);
            current = current.parentElement;
          }
          return result.map((element) => nodeOf(element, root));
        })()
      : undefined;
  const width = view?.innerWidth ?? document.documentElement.clientWidth;
  const height = view?.innerHeight ?? document.documentElement.clientHeight;
  const facts: PreviewObservationFacts = {
    identity,
    capabilities,
    viewport: {
      width: Math.max(0, asFinite(width)),
      height: Math.max(0, asFinite(height)),
      devicePixelRatio: Math.max(0.1, asFinite(view?.devicePixelRatio ?? 1, 1)),
      scrollX: asFinite(view?.scrollX ?? 0),
      scrollY: asFinite(view?.scrollY ?? 0),
    },
    document: documentFacts(document),
    runtime,
    targetResolution,
    target,
    targetCandidates,
    ancestors,
    probe,
  };
  return createPreviewObservationResult(facts, input.assertions);
}

/** Connection-local registry; it never searches other tabs or pages. */
export class PreviewObservationRegistry {
  private registration: PreviewObservationRegistration | null = null;

  register(registration: PreviewObservationRegistration): () => void {
    if (!isPreviewRenderIdentity(registration.identity)) {
      this.registration = null;
      return () => {};
    }
    this.registration = registration;
    return () => {
      if (
        sameRenderIdentity(this.registration?.identity, registration.identity)
      ) {
        this.registration = null;
      }
    };
  }

  invalidate(previewInstanceId?: string): void {
    if (
      !previewInstanceId ||
      this.registration?.identity.previewInstanceId === previewInstanceId
    ) {
      this.registration = null;
    }
  }

  updateRuntime(
    previewInstanceId: string,
    runtime: Partial<PreviewRuntimeSummary>,
  ): void {
    const current = this.registration;
    if (!current || current.identity.previewInstanceId !== previewInstanceId)
      return;
    current.runtime = { ...current.runtime, ...runtime };
  }

  updateActivityState(
    previewInstanceId: string,
    activityState: "active" | "sleeping",
  ): void {
    const current = this.registration;
    if (!current || current.identity.previewInstanceId !== previewInstanceId)
      return;
    current.activityState = activityState;
  }

  recordRuntimeError(
    previewInstanceId: string,
    kind: "runtime" | "console",
  ): void {
    const current = this.registration;
    if (!current || current.identity.previewInstanceId !== previewInstanceId)
      return;
    const key = kind === "runtime" ? "runtimeErrorCount" : "consoleErrorCount";
    current.runtime = {
      ...current.runtime,
      [key]: (current.runtime?.[key] ?? 0) + 1,
    };
  }

  observe(input: ObservePreviewInput = {}): PreviewObservationResult {
    if (!this.registration) return unavailable("no-active-preview");
    return collectPreviewObservation(this.registration, input);
  }

  get identity(): PreviewRenderIdentity | null {
    return this.registration?.identity ?? null;
  }
}

function sameRenderIdentity(
  left: PreviewRenderIdentity | undefined,
  right: PreviewRenderIdentity,
): boolean {
  if (!left) return false;
  return (
    left.schemaVersion === right.schemaVersion &&
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.pageId === right.pageId &&
    left.runtimeType === right.runtimeType &&
    left.surface === right.surface &&
    left.previewInstanceId === right.previewInstanceId &&
    left.renderGeneration === right.renderGeneration &&
    left.revision === right.revision &&
    left.rootHash === right.rootHash
  );
}
