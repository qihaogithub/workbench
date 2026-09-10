/** Wire-level preview observation shapes. Runtime validation lives in @workbench/shared. */
export interface ObservePreviewInput {
  pageId?: string;
  target?: {
    nodeId?: string;
    sourceFile?: string;
    sourceLine?: number;
    selectedElement?: true;
  };
  detail?: "summary" | "layout" | "runtime" | "media";
  includeAncestors?: boolean;
  assertions?: Array<Record<string, unknown>>;
  timeoutMs?: number;
}

export interface PreviewRenderIdentity {
  schemaVersion: 1;
  projectId: string;
  workspaceId: string;
  pageId: string;
  runtimeType: string;
  surface: string;
  previewInstanceId: string;
  renderGeneration: number;
  revision: number;
  rootHash?: string;
}

export type PreviewObservationCapability = string;

export interface PreviewObservationResult {
  availability: "observed" | "stale" | "unavailable" | "unsupported";
  readiness: "ready" | "partial" | "runtime-error";
  identity?: PreviewRenderIdentity;
  observedAt?: number;
  capabilities: PreviewObservationCapability[];
  targetResolution?: "resolved" | "not-found" | "ambiguous" | "unsupported";
  viewport?: Record<string, unknown>;
  target?: Record<string, unknown>;
  targetCandidates?: Array<Record<string, unknown>>;
  ancestors?: Array<Record<string, unknown>>;
  probe?: {
    kind: "spine";
    ready: boolean;
    animationName?: string;
    animationPlaying?: boolean;
    loopEnabled?: boolean;
    trackTime?: number;
    duration?: number;
    skeletonBounds?: Record<string, number>;
    camera?: Record<string, number>;
    fit?: "contain" | "cover" | "none";
    alignment?: string;
    canvas?: Record<string, number>;
    paintedBounds?: Record<string, number>;
    sampledAt: number;
    precision: "runtime-self-reported" | "painted-bounds";
  };
  runtime?: Record<string, unknown>;
  assertions: Array<Record<string, unknown>>;
  assertionStatus:
    | "not-requested"
    | "passed"
    | "failed"
    | "uncertain"
    | "unsupported";
  evidence: Record<string, unknown>;
  reasons?: string[];
}
