import type { DemoPageRuntimeType } from "./workspace.js";

export type PageRuntimeSourceKind = "prototype" | "sandbox-html" | "react" | "sketch";
export type PageRuntimeRendererId = "prototype" | "sandbox-html" | "react-module" | "sketch";

export interface PageRuntimeCapabilities {
  sourceKind: PageRuntimeSourceKind;
  sourceFiles: readonly string[];
  supportsScripts: boolean;
  supportsVisualEdit: boolean;
  supportsConfigBinding: boolean;
  previewRenderer: PageRuntimeRendererId;
  screenshotRenderer: PageRuntimeRendererId;
  publishRenderer: PageRuntimeRendererId;
}

export class PageRuntimeCapabilityError extends Error {
  readonly code = "PAGE_RUNTIME_CAPABILITY_UNKNOWN" as const;
  readonly runtimeType: unknown;
  readonly details: { runtimeType: unknown; knownRuntimeTypes: DemoPageRuntimeType[] };

  constructor(runtimeType: unknown) {
    super(`Unknown page runtime type: ${String(runtimeType)}`);
    this.name = "PageRuntimeCapabilityError";
    this.runtimeType = runtimeType;
    this.details = {
      runtimeType,
      knownRuntimeTypes: ["prototype-html-css", "sandboxed-html", "high-fidelity-react", "sketch-scene"],
    };
  }
}

/** The single exhaustive runtime capability registry. Consumers must use the helper. */
export const PAGE_RUNTIME_CAPABILITIES = {
  "prototype-html-css": {
    sourceKind: "prototype",
    sourceFiles: ["prototype.html", "prototype.css"],
    supportsScripts: false,
    supportsVisualEdit: true,
    supportsConfigBinding: true,
    previewRenderer: "prototype",
    screenshotRenderer: "prototype",
    publishRenderer: "prototype",
  },
  "sandboxed-html": {
    sourceKind: "sandbox-html",
    sourceFiles: ["sandbox.html"],
    supportsScripts: true,
    supportsVisualEdit: false,
    supportsConfigBinding: false,
    previewRenderer: "sandbox-html",
    screenshotRenderer: "sandbox-html",
    publishRenderer: "sandbox-html",
  },
  "high-fidelity-react": {
    sourceKind: "react",
    sourceFiles: ["index.tsx"],
    supportsScripts: true,
    supportsVisualEdit: true,
    supportsConfigBinding: true,
    previewRenderer: "react-module",
    screenshotRenderer: "react-module",
    publishRenderer: "react-module",
  },
  "sketch-scene": {
    sourceKind: "sketch",
    sourceFiles: ["sketch.scene.json"],
    supportsScripts: false,
    supportsVisualEdit: true,
    supportsConfigBinding: true,
    previewRenderer: "sketch",
    screenshotRenderer: "sketch",
    publishRenderer: "sketch",
  },
} satisfies Record<DemoPageRuntimeType, PageRuntimeCapabilities>;

export function isDemoPageRuntimeType(value: unknown): value is DemoPageRuntimeType {
  return typeof value === "string" && value in PAGE_RUNTIME_CAPABILITIES;
}

export function getPageRuntimeCapabilities(runtimeType: unknown): PageRuntimeCapabilities {
  if (!isDemoPageRuntimeType(runtimeType)) throw new PageRuntimeCapabilityError(runtimeType);
  return PAGE_RUNTIME_CAPABILITIES[runtimeType];
}
