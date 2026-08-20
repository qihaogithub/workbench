export const CAPTURE_CHUNK_BYTES = 256 * 1024;

export type CapturePhase =
  | "idle" | "requesting_permission" | "preparing_page" | "capturing" | "parsing"
  | "building_workspace" | "recovering_sources" | "checking_fidelity" | "packaging"
  | "ready" | "failed" | "cancelled" | "batch_queued" | "review_required";

export interface CaptureConfig {
  captureId: string;
  routeKey: string;
  sourceProjectKey?: string;
  pageStateNote?: string;
  capturedAt: string;
  url: string;
  title: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  screenshotDataUrl?: string;
  captureWarnings?: string[];
  profileId?: "editable-fidelity" | "compact-review";
}

export interface CaptureTaskState {
  captureId?: string;
  phase: CapturePhase;
  progress: number;
  message: string;
  filename?: string;
  error?: string;
  review?: {
    executableContent: boolean;
    findings: Array<{ code: string; severity: "info" | "warning"; count: number }>;
    missingResources: number;
    crossOriginResources: number;
    runtimeDependencies: number;
    fidelityStatus: string;
  };
  updatedAt: string;
}

export function checksumChunk(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function safeBundleFilename(urlValue: string, routeKey: string, capturedAt: string): string {
  const url = new URL(urlValue);
  const route = routeKey.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root";
  return `editable-snapshot-${url.hostname}-${route}-${capturedAt.replace(/[:.]/g, "-")}.zip`;
}
