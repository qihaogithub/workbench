export const EDITABLE_SNAPSHOT_CONTRACT_VERSION = "1.0.0" as const;

export interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface SnapshotCaptureInput {
  captureId: string;
  capturedAt: string;
  url: string;
  title: string;
  sourceProjectKey?: string;
  routeKey: string;
  pageStateNote?: string;
  viewport: CaptureViewport;
  html: string;
  screenshot?: Uint8Array;
  captureWarnings?: string[];
}

export type ResourceKind = "html" | "css" | "script" | "frame" | "image" | "font" | "media" | "other";

export interface BundleResource {
  id: string;
  kind: ResourceKind;
  originalUrl?: string;
  localPath: string;
  readablePath?: string;
  hash: string;
  bytes: number;
  party: "first-party" | "third-party" | "inline" | "unknown";
  status: "localized" | "preserved" | "missing";
}

export interface SourceMapDescriptor {
  script: string;
  mapUrl?: string;
  status: "recovered" | "partial" | "no-sources-content" | "invalid" | "fetch-failed" | "not-found";
  sources: string[];
  missingSources: string[];
}

export interface ScriptDescriptor {
  order: number;
  localPath?: string;
  originalUrl?: string;
  inline: boolean;
  party: BundleResource["party"];
  type?: string;
  async: boolean;
  defer: boolean;
  nomodule: boolean;
  crossorigin?: string;
  integrity?: string;
  referrerpolicy?: string;
}

export interface EditableSnapshotBundleManifest {
  contractVersion: typeof EDITABLE_SNAPSHOT_CONTRACT_VERSION;
  captureId: string;
  capturedAt: string;
  url: string;
  title: string;
  sourceProjectKey?: string;
  routeKey: string;
  pageStateNote?: string;
  viewport: CaptureViewport;
  executableContent: true;
  licenseStatus: "internal-prototype-pending-review";
  entries: {
    faithful: "faithful/snapshot.html";
    workspace: "workspace/index.html";
  };
  resources: BundleResource[];
  scripts: ScriptDescriptor[];
  sourceMaps: SourceMapDescriptor[];
  missingResources: string[];
  crossOriginResources: string[];
  runtimeDependencies: string[];
}

export interface VirtualFile {
  path: string;
  content: Uint8Array;
  mediaType: string;
}

export interface EditableSnapshotBundle {
  manifest: EditableSnapshotBundleManifest;
  files: VirtualFile[];
}

export interface SnapshotCoreAdapters {
  sha256(content: Uint8Array): Promise<string>;
  formatReadable?(source: string, language: "html" | "css" | "javascript", sourcePath: string): Promise<string>;
  fetchResource?(url: string): Promise<{ bytes: Uint8Array; mediaType: string; finalUrl?: string }>;
}
