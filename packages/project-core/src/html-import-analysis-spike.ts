import { parse, serialize } from "parse5";

import {
  HTML_IMPORT_ANALYSIS_VERSION,
  HTML_IMPORT_MAX_DATA_URL_BYTES,
  HTML_IMPORT_MAX_INPUT_BYTES,
  HTML_IMPORT_MAX_TOTAL_DATA_URL_BYTES,
  hashHtmlImportSource,
  sortHtmlImportAnalysisCollections,
  type HtmlImportAnalysis,
  type HtmlImportResourceClassification,
  type HtmlImportSignal,
  type HtmlResourceReference,
  type HtmlUnsupportedCapability,
} from "./html-import-contract";
import { recommendHtmlImportPresentation } from "@workbench/shared";

interface ParsedNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: ParsedNode[];
}

const EXECUTABLE_SCRIPT_TYPES = new Set([
  "",
  "application/ecmascript",
  "application/javascript",
  "text/ecmascript",
  "text/javascript",
  "module",
]);
const URL_ATTRIBUTES = new Set([
  "action",
  "data",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);
const EMBED_TAGS = new Set(["embed", "iframe", "object"]);

export interface HtmlImportAnalysisSpikeResult {
  analysis: HtmlImportAnalysis;
  normalizedHtml?: string;
  normalizedHash?: string;
}

function classifyUrl(value: string): HtmlImportResourceClassification {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("#")) return "fragment";
  if (normalized.startsWith("data:")) return "data";
  if (normalized.startsWith("blob:")) return "blob";
  if (normalized.startsWith("javascript:")) return "javascript";
  if (/^(https?:)?\/\//.test(normalized)) return "remote";
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized)) return "other";
  return "relative";
}

function resourcePolicy(classification: HtmlImportResourceClassification): Pick<HtmlResourceReference, "impact" | "remediation"> {
  switch (classification) {
    case "data":
    case "fragment":
      return { impact: "preserved", remediation: "none" };
    case "blob":
      return { impact: "blocked", remediation: "embed-as-data-url" };
    case "relative":
      return { impact: "blocked", remediation: "include-in-bundle" };
    case "javascript":
      return { impact: "blocked", remediation: "replace-with-safe-link" };
    case "remote":
    case "other":
      return { impact: "blocked", remediation: "replace-or-localize" };
  }
}

function dataUrlPayloadBytes(value: string): number {
  const comma = value.indexOf(",");
  if (comma === -1) return Buffer.byteLength(value, "utf8");
  const metadata = value.slice(0, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  if (metadata.endsWith(";base64")) {
    try {
      return Buffer.from(payload, "base64").byteLength;
    } catch {
      return Buffer.byteLength(payload, "utf8");
    }
  }
  try {
    return Buffer.byteLength(decodeURIComponent(payload), "utf8");
  } catch {
    return Buffer.byteLength(payload, "utf8");
  }
}

function textContent(node: ParsedNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(textContent).join("");
}

function nodePath(parentPath: string, node: ParsedNode, index: number): string {
  const label = node.tagName ?? node.nodeName;
  return `${parentPath}/${label}[${index}]`;
}

/** Phase 0 structural prototype. It is intentionally not exported from package index or wired to writes. */
export function analyzeHtmlImportSpike(
  source: string,
): HtmlImportAnalysisSpikeResult {
  const sourceHash = hashHtmlImportSource(source);
  if (!source.trim()) {
    return {
      analysis: {
        analysisVersion: HTML_IMPORT_ANALYSIS_VERSION,
        compatibility: "blocked",
        outcome: { status: "rejected", code: "HTML_IMPORT_INVALID" },
        signals: [],
        unsupportedCapabilities: [],
        resourceReferences: [],
        warnings: [],
        source: { kind: "unknown", confirmationBypassEligible: false },
        presentation: recommendHtmlImportPresentation({}),
        sourceHash,
        normalizedHash: hashHtmlImportSource(""),
      },
    };
  }
  if (Buffer.byteLength(source, "utf8") > HTML_IMPORT_MAX_INPUT_BYTES) {
    return {
      analysis: {
        analysisVersion: HTML_IMPORT_ANALYSIS_VERSION,
        compatibility: "blocked",
        outcome: { status: "rejected", code: "HTML_IMPORT_TOO_LARGE" },
        signals: [],
        unsupportedCapabilities: [],
        resourceReferences: [],
        warnings: [],
        source: { kind: "unknown", confirmationBypassEligible: false },
        presentation: recommendHtmlImportPresentation({}),
        sourceHash,
        normalizedHash: hashHtmlImportSource(""),
      },
    };
  }

  const document = parse(source) as unknown as ParsedNode;
  const signals: HtmlImportSignal[] = [];
  const unsupportedCapabilities: HtmlUnsupportedCapability[] = [];
  const resourceReferences: HtmlResourceReference[] = [];
  let totalDataUrlBytes = 0;
  let hasForm = false;
  let detectedTitle: string | undefined;
  let detectedViewport: { width: number; height: number } | undefined;

  const visit = (node: ParsedNode, parentPath: string, index: number): void => {
    const path = nodePath(parentPath, node, index);
    const tagName = node.tagName?.toLowerCase();
    const attrs = new Map(
      (node.attrs ?? []).map((attr) => [attr.name.toLowerCase(), attr.value]),
    );
    if (tagName === "title")
      detectedTitle = textContent(node).trim() || undefined;
    if (tagName === "meta" && attrs.get("name")?.toLowerCase() === "viewport") {
      const content = attrs.get("content") ?? "";
      const width = /(?:^|,)\s*width\s*=\s*(\d+)/i.exec(content)?.[1];
      const height = /(?:^|,)\s*height\s*=\s*(\d+)/i.exec(content)?.[1];
      if (width && height)
        detectedViewport = { width: Number(width), height: Number(height) };
    }
    if (tagName && EMBED_TAGS.has(tagName)) {
      unsupportedCapabilities.push({
        code: "embedded-browsing-context",
        path,
        detail: tagName,
      });
    }
    if (tagName === "base")
      unsupportedCapabilities.push({ code: "base-url", path });
    if (
      tagName === "meta" &&
      attrs.get("http-equiv")?.toLowerCase() === "refresh"
    ) {
      unsupportedCapabilities.push({ code: "meta-refresh", path });
    }
    if (tagName === "form") hasForm = true;
    if (tagName === "script") {
      const type = (attrs.get("type") ?? "").trim().toLowerCase();
      const src = attrs.get("src")?.trim();
      const executable = EXECUTABLE_SCRIPT_TYPES.has(type);
      if (src)
        unsupportedCapabilities.push({
          code: "external-script",
          path,
          detail: src,
        });
      if (executable) {
        signals.push({
          code: type === "module" ? "inline-module-script" : "classic-script",
          path,
        });
        const body = textContent(node);
        if (
          type === "module" &&
          /(?:^|[;\n])\s*(?:import\s*(?:\(|[\s{*])|export\s+[^;]*?\sfrom\s*)/m.test(
            body,
          )
        ) {
          unsupportedCapabilities.push({
            code: "external-module-import",
            path,
          });
        }
        if (
          /\bnew\s+(?:Shared)?Worker\s*\(|\bnavigator\.serviceWorker\.register\s*\(/.test(
            body,
          )
        ) {
          unsupportedCapabilities.push({
            code: body.includes("serviceWorker") ? "service-worker" : "worker",
            path,
          });
        }
        if (/\bwindow\.open\s*\(/.test(body))
          unsupportedCapabilities.push({ code: "popup", path });
      } else {
        signals.push({
          code: "inert-data-script",
          path,
          detail: type || "unspecified",
        });
      }
    }
    if (tagName) {
      for (const [name, value] of attrs) {
        if (name.startsWith("on"))
          signals.push({ code: "event-handler-attribute", path, detail: name });
        if (name === "download")
          unsupportedCapabilities.push({ code: "download", path });
        if (!URL_ATTRIBUTES.has(name) || !value.trim()) continue;
        const classification = classifyUrl(value);
        resourceReferences.push({
          tagName,
          attributeName: name,
          value,
          classification,
          ...resourcePolicy(classification),
          path,
        });
        if (classification === "javascript")
          signals.push({ code: "javascript-url", path, detail: name });
        if (classification === "relative")
          unsupportedCapabilities.push({
            code: "relative-resource",
            path,
            detail: value,
          });
        if (classification === "remote")
          unsupportedCapabilities.push({
            code: "remote-resource",
            path,
            detail: value,
          });
        if (classification === "blob" && tagName === "script")
          unsupportedCapabilities.push({ code: "blob-script", path });
        if (classification === "data") {
          signals.push({ code: "data-url-resource", path, detail: name });
          const bytes = dataUrlPayloadBytes(value);
          totalDataUrlBytes += bytes;
          if (bytes > HTML_IMPORT_MAX_DATA_URL_BYTES)
            unsupportedCapabilities.push({
              code: "data-url-too-large",
              path,
              detail: `${bytes}`,
            });
        }
      }
    }
    (node.childNodes ?? []).forEach((child, childIndex) =>
      visit(child, path, childIndex),
    );
  };
  visit(document, "", 0);
  const hasInteractiveSignal = signals.some((signal) =>
    [
      "classic-script",
      "inline-module-script",
      "event-handler-attribute",
      "javascript-url",
    ].includes(signal.code),
  );
  if (hasForm && !hasInteractiveSignal) {
    unsupportedCapabilities.push({
      code: "form-submission",
      path: "/html/body/form",
    });
  }
  if (totalDataUrlBytes > HTML_IMPORT_MAX_TOTAL_DATA_URL_BYTES) {
    unsupportedCapabilities.push({
      code: "data-url-too-large",
      path: "/",
      detail: `${totalDataUrlBytes}`,
    });
  }

  const sorted = sortHtmlImportAnalysisCollections({
    signals,
    unsupportedCapabilities,
    resourceReferences,
    warnings: unsupportedCapabilities.map((capability) => ({
      code: "restricted-api-possible" as const,
      path: capability.path,
      detail: capability.code,
    })),
  });
  const hasOversizedData = sorted.unsupportedCapabilities.some(
    (capability) => capability.code === "data-url-too-large",
  );
  const outcome = hasOversizedData
    ? { status: "rejected" as const, code: "HTML_IMPORT_TOO_LARGE" as const }
    : {
        status: "accepted" as const,
        runtimeType: hasInteractiveSignal
          ? ("sandboxed-html" as const)
          : ("prototype-html-css" as const),
      };
  const normalizedHtml = serialize(document as never);
  const normalizedHash = hashHtmlImportSource(normalizedHtml);
  return {
    analysis: {
      analysisVersion: HTML_IMPORT_ANALYSIS_VERSION,
      runtimeType: outcome.status === "accepted" ? outcome.runtimeType : undefined,
      compatibility: hasOversizedData
        ? "blocked"
        : sorted.unsupportedCapabilities.length > 0
          ? "degraded"
          : "complete",
      outcome,
      ...sorted,
      source: { kind: "unknown", confirmationBypassEligible: false },
      ...(detectedTitle ? { detectedTitle } : {}),
      ...(detectedViewport ? { detectedViewport } : {}),
      presentation: recommendHtmlImportPresentation({
        numericViewport: detectedViewport,
        hasViewportSignal: detectedViewport !== undefined,
      }),
      sourceHash,
      normalizedHash,
    },
    normalizedHtml,
    normalizedHash,
  };
}
