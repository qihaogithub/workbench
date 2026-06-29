import fs from "fs";
import path from "path";

export interface PreviewRuntimeManifest {
  version: string;
  generatedAt?: string;
  imports: Record<string, string>;
  files?: Record<string, { hash: string; bytes: number }>;
  packages?: Record<string, string>;
}

export interface PreviewRuntimeResolveOptions {
  baseUrl?: string;
  preferCdn?: boolean;
}

export const PREVIEW_RUNTIME_MANIFEST_VERSION = "2026-06-preview-runtime-v4";

export const DEFAULT_PREVIEW_RUNTIME_IMPORTS: Record<string, string> = {
  react: "/preview-runtime/vendor/react.js",
  "react-dom": "/preview-runtime/vendor/react-dom.js",
  "react-dom/client": "/preview-runtime/vendor/react-dom-client.js",
  "react/jsx-runtime": "/preview-runtime/vendor/react-jsx-runtime.js",
  "react/jsx-dev-runtime": "/preview-runtime/vendor/react-jsx-dev-runtime.js",
  "lucide-react": "/preview-runtime/vendor/lucide-react.js",
  "framer-motion": "/preview-runtime/vendor/framer-motion.js",
  "@preview/sdk": "/preview-runtime/vendor/preview-sdk.js",
};

let cachedManifest: PreviewRuntimeManifest | null | undefined;

function getManifestPath(): string {
  return path.join(process.cwd(), "public", "preview-runtime", "manifest.json");
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "";
  return baseUrl.replace(/\/+$/u, "");
}

export function resolvePreviewRuntimeUrl(url: string, baseUrl?: string): string {
  if (/^https?:\/\//u.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedBase) return url;
  return `${normalizedBase}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function readPreviewRuntimeManifest(): PreviewRuntimeManifest | null {
  if (cachedManifest !== undefined) return cachedManifest;

  try {
    const manifest = JSON.parse(fs.readFileSync(getManifestPath(), "utf8")) as PreviewRuntimeManifest;
    cachedManifest = manifest;
    return manifest;
  } catch {
    cachedManifest = null;
    return null;
  }
}

export function getPreviewRuntimeImportMap(
  options: PreviewRuntimeResolveOptions = {},
): Record<string, string> {
  const manifest = readPreviewRuntimeManifest();
  const imports = manifest?.imports || DEFAULT_PREVIEW_RUNTIME_IMPORTS;
  const result: Record<string, string> = {};

  for (const [specifier, url] of Object.entries(imports)) {
    result[specifier] = resolvePreviewRuntimeUrl(url, options.baseUrl);
  }

  return result;
}

export function getPreviewRuntimeUrl(
  specifier: string,
  options: PreviewRuntimeResolveOptions = {},
): string | null {
  const imports = getPreviewRuntimeImportMap(options);
  return imports[specifier] || null;
}

export function shouldUsePreviewRuntimeCdn(): boolean {
  return (
    process.env.PREVIEW_RUNTIME_SOURCE === "cdn" ||
    process.env.PREVIEW_RUNTIME_CDN_FALLBACK === "1"
  );
}
