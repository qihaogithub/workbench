import * as parse5 from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import {
  EDITABLE_SNAPSHOT_CONTRACT_VERSION,
  type BundleResource,
  type EditableSnapshotBundle,
  type EditableSnapshotBundleManifest,
  type ScriptDescriptor,
  type SourceMapDescriptor,
  type SnapshotCaptureInput,
  type SnapshotCoreAdapters,
  type VirtualFile,
} from "./contracts.js";
import { decodeDataUrl, decodeText, encodeText } from "./encoding.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

const URL_ATTRIBUTES = ["src", "href", "poster", "data"] as const;

function getAttr(element: Element, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name.toLowerCase() === name)?.value;
}

function hasAttr(element: Element, name: string): boolean {
  return getAttr(element, name) !== undefined;
}

function setAttr(element: Element, name: string, value: string): void {
  const existing = element.attrs.find((attribute) => attribute.name.toLowerCase() === name);
  if (existing) existing.value = value;
  else element.attrs.push({ name, value });
}

function removeAttr(element: Element, name: string): void {
  element.attrs = element.attrs.filter((attribute) => attribute.name.toLowerCase() !== name);
}

function removeChildren(element: Element): void {
  element.childNodes = [];
}

function textContent(element: Element): string {
  return element.childNodes
    .filter((node): node is DefaultTreeAdapterMap["textNode"] => node.nodeName === "#text")
    .map((node) => node.value)
    .join("");
}

function appendText(element: Element, value: string): void {
  const textNode: DefaultTreeAdapterMap["textNode"] = {
    nodeName: "#text",
    value,
    parentNode: element,
  };
  element.childNodes.push(textNode);
}

function walk(node: Node, visit: (element: Element) => void): void {
  if ((node as Element).tagName) visit(node as Element);
  const parent = node as ParentNode;
  for (const child of parent.childNodes ?? []) walk(child, visit);
  const template = node as Element & { content?: ParentNode };
  if (template.content) walk(template.content, visit);
}

function sanitizePath(value: string): string {
  return value
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^webpack:\/\/?/i, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[^a-zA-Z0-9._@-]+/g, "_"))
    .join("/") || "source.txt";
}

function mediaExtension(mediaType: string): string {
  const type = mediaType.toLowerCase().split(";")[0];
  const known: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
    "image/svg+xml": "svg", "font/woff": "woff", "font/woff2": "woff2",
    "video/mp4": "mp4", "audio/mpeg": "mp3", "text/css": "css",
    "text/javascript": "js", "application/javascript": "js", "application/json": "json",
  };
  return known[type] ?? type.split("/")[1]?.replace(/[^a-z0-9]+/g, "") ?? "bin";
}

function assetDirectory(mediaType: string): "images" | "fonts" | "media" | "other" {
  if (mediaType.startsWith("image/")) return "images";
  if (mediaType.startsWith("font/") || /woff|font/.test(mediaType)) return "fonts";
  if (mediaType.startsWith("audio/") || mediaType.startsWith("video/")) return "media";
  return "other";
}

function classifyParty(value: string | undefined, pageUrl: URL, inline = false): BundleResource["party"] {
  if (inline) return "inline";
  if (!value) return "unknown";
  try {
    const url = new URL(value, pageUrl);
    return url.origin === pageUrl.origin ? "first-party" : "third-party";
  } catch {
    return "unknown";
  }
}

function jsonFile(path: string, value: unknown): VirtualFile {
  return { path, content: encodeText(`${JSON.stringify(value, null, 2)}\n`), mediaType: "application/json" };
}

function textFile(path: string, value: string, mediaType = "text/plain"): VirtualFile {
  return { path, content: encodeText(value), mediaType };
}

function attrRecord(element: Element): Record<string, string> {
  return Object.fromEntries(element.attrs.map(({ name, value }) => [name, value]));
}

function securityFindings(html: string): Array<{ code: string; severity: "info" | "warning"; count: number }> {
  const checks = [
    ["EXECUTABLE_SCRIPT", /<script\b/gi, "warning"],
    ["INLINE_EVENT_HANDLER", /\son[a-z]+\s*=/gi, "warning"],
    ["POSSIBLE_BEARER_TOKEN", /bearer\s+[a-z0-9._~-]{16,}/gi, "warning"],
    ["POSSIBLE_SECRET", /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/gi, "warning"],
    ["POSSIBLE_URL_CREDENTIAL", /[?&](?:access[_-]?token|api[_-]?key|auth|session|token)=[^&#"'\s]{8,}/gi, "warning"],
    ["PRIVATE_KEY_MATERIAL", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "warning"],
    ["EMAIL_ADDRESS_IN_DOM", /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi, "info"],
    ["PASSWORD_FIELD", /<input\b[^>]*\btype\s*=\s*["']?password\b/gi, "warning"],
    ["FORM_ACTION", /<form\b[^>]*\baction\s*=/gi, "info"],
  ] as const;
  return checks.flatMap(([code, pattern, severity]) => {
    const count = html.match(pattern)?.length ?? 0;
    return count ? [{ code, severity, count }] : [];
  });
}

export async function buildEditableSnapshotBundle(
  input: SnapshotCaptureInput,
  adapters: SnapshotCoreAdapters,
): Promise<EditableSnapshotBundle> {
  const pageUrl = new URL(input.url);
  const document = parse5.parse(input.html);
  const files: VirtualFile[] = [textFile("faithful/snapshot.html", input.html, "text/html")];
  const resources: BundleResource[] = [];
  const scripts: ScriptDescriptor[] = [];
  const crossOriginResources = new Set<string>();
  const runtimeDependencies = new Set<string>();
  const missingResources = new Set<string>();
  const dependencyEdges: Array<{ from: string; to: string; kind: string }> = [];
  const sourceMapResults: SourceMapDescriptor[] = [];
  const formattingResults: Array<{ source: string; readablePath?: string; status: "formatted" | "not-configured" | "failed"; error?: string }> = [];
  let inlineStyleIndex = 0;
  let inlineScriptIndex = 0;
  let scriptOrder = 0;
  let frameIndex = 0;

  const addResource = async (
    path: string,
    content: Uint8Array,
    mediaType: string,
    kind: BundleResource["kind"],
    party: BundleResource["party"],
    originalUrl?: string,
  ): Promise<BundleResource> => {
    const hash = await adapters.sha256(content);
    const resource: BundleResource = {
      id: `${kind}:${hash.slice(0, 16)}`,
      kind,
      originalUrl,
      localPath: path,
      hash,
      bytes: content.length,
      party,
      status: "localized",
    };
    files.push({ path, content, mediaType });
    resources.push(resource);
    return resource;
  };

  const addReadableCopy = async (
    resource: BundleResource,
    source: string,
    language: "html" | "css" | "javascript",
  ): Promise<void> => {
    if (!adapters.formatReadable) {
      formattingResults.push({ source: resource.localPath, status: "not-configured" });
      return;
    }
    const readablePath = `workspace/readable/${resource.localPath.replace(/^workspace\//, "")}`;
    try {
      const formatted = await adapters.formatReadable(source, language, resource.localPath);
      files.push(textFile(readablePath, formatted, resource.kind === "html" ? "text/html" : resource.kind === "css" ? "text/css" : "text/javascript"));
      resource.readablePath = readablePath;
      formattingResults.push({ source: resource.localPath, readablePath, status: "formatted" });
    } catch (error) {
      formattingResults.push({
        source: resource.localPath,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const localizeDataUrl = async (value: string): Promise<string | undefined> => {
    const decoded = decodeDataUrl(value);
    if (!decoded) return undefined;
    const hash = await adapters.sha256(decoded.bytes);
    const dir = assetDirectory(decoded.mediaType);
    const path = `workspace/assets/${dir}/${hash.slice(0, 24)}.${mediaExtension(decoded.mediaType)}`;
    if (!files.some((file) => file.path === path)) {
      const kind = dir === "images" ? "image" : dir === "fonts" ? "font" : dir === "media" ? "media" : "other";
      await addResource(path, decoded.bytes, decoded.mediaType, kind, "inline");
    }
    return path.replace(/^workspace\//, "");
  };

  const localizeCssDataUrls = async (css: string): Promise<string> => {
    const pattern = /url\(\s*(?:(["'])(data:[\s\S]*?)\1|(data:[^)\s]+))\s*\)/gi;
    let result = "";
    let cursor = 0;
    for (const match of css.matchAll(pattern)) {
      const index = match.index ?? 0;
      result += css.slice(cursor, index);
      const value = match[2] ?? match[3];
      const localized = await localizeDataUrl(value);
      result += localized ? `url("../${localized.replace(/^assets\//, "assets/")}")` : match[0];
      cursor = index + match[0].length;
    }
    return result + css.slice(cursor);
  };

  const storeRecoveredSource = async (sourceName: string, content: string): Promise<string> => {
    const preferredPath = `sources/${sanitizePath(sourceName)}`;
    const encoded = encodeText(content);
    const existing = files.find((file) => file.path === preferredPath);
    if (!existing) {
      files.push(textFile(preferredPath, content));
      return preferredPath;
    }
    if (decodeText(existing.content) === content) return preferredPath;
    const hash = await adapters.sha256(encoded);
    const extensionIndex = preferredPath.lastIndexOf(".");
    const uniquePath = extensionIndex > preferredPath.lastIndexOf("/")
      ? `${preferredPath.slice(0, extensionIndex)}-${hash.slice(0, 8)}${preferredPath.slice(extensionIndex)}`
      : `${preferredPath}-${hash.slice(0, 8)}`;
    if (!files.some((file) => file.path === uniquePath)) files.push(textFile(uniquePath, content));
    return uniquePath;
  };

  const recoverSourceMap = async (scriptSource: string, scriptPath: string, sourceBaseUrl: string): Promise<void> => {
    const match = /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=\s*([^\s*]+)(?:\s*\*\/)?/i.exec(scriptSource);
    if (!match) {
      sourceMapResults.push({ script: scriptPath, status: "not-found", sources: [], missingSources: [] });
      return;
    }
    const reference = match[1].trim().replace(/["']$/, "");
    let mapUrl: string | undefined;
    let mapBytes: Uint8Array | undefined;
    if (reference.startsWith("data:")) {
      mapBytes = decodeDataUrl(reference)?.bytes;
    } else {
      try {
        mapUrl = new URL(reference, sourceBaseUrl).href;
      } catch {
        sourceMapResults.push({ script: scriptPath, status: "invalid", sources: [], missingSources: [reference] });
        return;
      }
      if (!adapters.fetchResource) {
        sourceMapResults.push({ script: scriptPath, mapUrl, status: "fetch-failed", sources: [], missingSources: [mapUrl] });
        return;
      }
      try {
        const fetched = await adapters.fetchResource(mapUrl);
        mapBytes = fetched.bytes;
        mapUrl = fetched.finalUrl ?? mapUrl;
      } catch {
        sourceMapResults.push({ script: scriptPath, mapUrl, status: "fetch-failed", sources: [], missingSources: [mapUrl] });
        return;
      }
    }
    if (!mapBytes) {
      sourceMapResults.push({ script: scriptPath, mapUrl, status: "invalid", sources: [], missingSources: [reference] });
      return;
    }
    try {
      const map = JSON.parse(decodeText(mapBytes)) as {
        sources?: string[];
        sourcesContent?: Array<string | null>;
        sourceRoot?: string;
      };
      const recovered: string[] = [];
      const missing: string[] = [];
      for (let index = 0; index < (map.sources?.length ?? 0); index += 1) {
        const sourceName = map.sources![index];
        let content = map.sourcesContent?.[index];
        if (typeof content !== "string" && adapters.fetchResource && mapUrl) {
          try {
            const resolved = new URL(`${map.sourceRoot ?? ""}${sourceName}`, mapUrl).href;
            content = decodeText((await adapters.fetchResource(resolved)).bytes);
          } catch {
            content = null;
          }
        }
        if (typeof content === "string") recovered.push(await storeRecoveredSource(sourceName, content));
        else missing.push(sourceName);
      }
      const status: SourceMapDescriptor["status"] = recovered.length === 0
        ? "no-sources-content"
        : missing.length > 0 ? "partial" : "recovered";
      sourceMapResults.push({ script: scriptPath, mapUrl, status, sources: recovered, missingSources: missing });
    } catch {
      sourceMapResults.push({ script: scriptPath, mapUrl, status: "invalid", sources: [], missingSources: [reference] });
    }
  };

  const elements: Element[] = [];
  walk(document, (element) => elements.push(element));

  for (const element of elements) {
    if (element.tagName === "style") {
      inlineStyleIndex += 1;
      const css = await localizeCssDataUrls(textContent(element));
      const path = `workspace/styles/inline-${String(inlineStyleIndex).padStart(3, "0")}.css`;
      const styleResource = await addResource(path, encodeText(css), "text/css", "css", "inline");
      await addReadableCopy(styleResource, css, "css");
      element.tagName = "link";
      element.nodeName = "link";
      element.attrs = [
        { name: "rel", value: "stylesheet" },
        { name: "href", value: path.replace(/^workspace\//, "") },
        { name: "data-editable-snapshot-origin", value: "inline-style" },
      ];
      removeChildren(element);
      dependencyEdges.push({ from: "workspace/index.html", to: path, kind: "stylesheet" });
      continue;
    }

    if (element.tagName === "script") {
      scriptOrder += 1;
      const src = getAttr(element, "src");
      const inline = !src;
      let localPath: string | undefined;
      let originalUrl = src;
      if (inline) {
        inlineScriptIndex += 1;
        localPath = `workspace/scripts/first-party/inline-${String(inlineScriptIndex).padStart(3, "0")}.js`;
        const source = textContent(element);
        const scriptResource = await addResource(localPath, encodeText(source), "text/javascript", "script", "inline");
        await addReadableCopy(scriptResource, source, "javascript");
        removeChildren(element);
        setAttr(element, "src", localPath.replace(/^workspace\//, ""));
        setAttr(element, "data-editable-snapshot-origin", "inline-script");
        dependencyEdges.push({ from: "workspace/index.html", to: localPath, kind: "script" });

        await recoverSourceMap(source, localPath, input.url);
      } else {
        const decoded = decodeDataUrl(src);
        if (decoded) {
          const hash = await adapters.sha256(decoded.bytes);
          const originalScriptUrl = getAttr(element, "data-editable-snapshot-original-src")
            ?? getAttr(element, "data-sf-original-src");
          const party = classifyParty(originalScriptUrl, pageUrl);
          const bucket = party === "third-party" ? "vendor" : "first-party";
          localPath = `workspace/scripts/${bucket}/script-${hash.slice(0, 20)}.js`;
          originalUrl = originalScriptUrl ?? src;
          const scriptResource = await addResource(localPath, decoded.bytes, decoded.mediaType, "script", party, originalScriptUrl);
          const source = decodeText(decoded.bytes);
          await addReadableCopy(scriptResource, source, "javascript");
          await recoverSourceMap(source, localPath, originalScriptUrl ?? input.url);
          setAttr(element, "src", localPath.replace(/^workspace\//, ""));
          removeAttr(element, "data-editable-snapshot-original-src");
          dependencyEdges.push({ from: "workspace/index.html", to: localPath, kind: "script" });
        } else {
          try {
            const absolute = new URL(src, pageUrl).href;
            originalUrl = absolute;
            runtimeDependencies.add(absolute);
            if (new URL(absolute).origin !== pageUrl.origin) crossOriginResources.add(absolute);
          } catch {
            missingResources.add(src);
          }
        }
      }
      scripts.push({
        order: scriptOrder,
        localPath,
        originalUrl,
        inline,
        party: classifyParty(originalUrl, pageUrl, inline),
        type: getAttr(element, "type"),
        async: hasAttr(element, "async"),
        defer: hasAttr(element, "defer"),
        nomodule: hasAttr(element, "nomodule"),
        crossorigin: getAttr(element, "crossorigin"),
        integrity: getAttr(element, "integrity"),
        referrerpolicy: getAttr(element, "referrerpolicy"),
      });
    }

    for (const attributeName of URL_ATTRIBUTES) {
      const value = getAttr(element, attributeName);
      if (!value || value.startsWith("#") || value.startsWith("javascript:") || value.startsWith("mailto:")) continue;
      if (element.tagName === "iframe" && attributeName === "src") continue;
      if (/^(?:scripts|styles|assets|frames)\//.test(value)) continue;
      if (value.startsWith("data:")) {
        const localized = await localizeDataUrl(value);
        if (localized) {
          setAttr(element, attributeName, localized);
          dependencyEdges.push({ from: "workspace/index.html", to: `workspace/${localized}`, kind: `${element.tagName}.${attributeName}` });
        }
        continue;
      }
      try {
        const absolute = new URL(value, pageUrl);
        if (["http:", "https:"].includes(absolute.protocol)) {
          runtimeDependencies.add(absolute.href);
          if (absolute.origin !== pageUrl.origin) crossOriginResources.add(absolute.href);
        }
      } catch {
        missingResources.add(value);
      }
    }

    if (element.tagName === "iframe") {
      frameIndex += 1;
      const src = getAttr(element, "src");
      const srcdoc = getAttr(element, "srcdoc");
      const decodedSrc = src?.startsWith("data:") ? decodeDataUrl(src) : undefined;
      const capturedHtml = srcdoc ?? (decodedSrc?.mediaType.includes("html") ? decodeText(decodedSrc.bytes) : undefined);
      const frameDir = `workspace/frames/frame-${String(frameIndex).padStart(3, "0")}`;
      if (capturedHtml) {
        const indexPath = `${frameDir}/index.html`;
        await addResource(indexPath, encodeText(capturedHtml), "text/html", "frame", classifyParty(src, pageUrl), src);
        setAttr(element, "src", indexPath.replace(/^workspace\//, ""));
        removeAttr(element, "srcdoc");
        dependencyEdges.push({ from: "workspace/index.html", to: indexPath, kind: "iframe" });
      } else if (src) {
        try {
          const absolute = new URL(src, pageUrl).href;
          runtimeDependencies.add(absolute);
          if (new URL(absolute).origin !== pageUrl.origin) crossOriginResources.add(absolute);
        } catch {
          missingResources.add(src);
        }
      }
      const framePath = `${frameDir}/frame.json`;
      await addResource(framePath, encodeText(`${JSON.stringify({ src, captured: Boolean(capturedHtml), attributes: attrRecord(element) }, null, 2)}\n`), "application/json", "frame", classifyParty(src, pageUrl), src);
    }

    if (element.tagName === "canvas") {
      const canvasData = getAttr(element, "data-editable-snapshot-canvas");
      if (canvasData) {
        const localized = await localizeDataUrl(canvasData);
        if (localized) {
          setAttr(element, "data-editable-snapshot-canvas", localized);
          const existingStyle = getAttr(element, "style") ?? "";
          const withoutSnapshotBackground = existingStyle
            .replace(/background-image\s*:\s*url\([^;]+\)\s*;?/i, "")
            .replace(/background-size\s*:\s*100%\s+100%\s*;?/i, "");
          setAttr(element, "style", `${withoutSnapshotBackground};background-image:url("${localized}");background-size:100% 100%`);
        }
      }
    }
  }

  const workspaceHtml = parse5.serialize(document);
  const faithfulHash = await adapters.sha256(encodeText(input.html));
  resources.unshift({
    id: `html:${faithfulHash.slice(0, 16)}`,
    kind: "html",
    localPath: "faithful/snapshot.html",
    hash: faithfulHash,
    bytes: encodeText(input.html).length,
    party: "first-party",
    status: "preserved",
  });
  const workspaceResource = await addResource("workspace/index.html", encodeText(workspaceHtml), "text/html", "html", "first-party", input.url);
  await addReadableCopy(workspaceResource, workspaceHtml, "html");
  if (input.screenshot) await addResource("faithful/screenshot.png", input.screenshot, "image/png", "image", "first-party");

  const manifest: EditableSnapshotBundleManifest = {
    contractVersion: EDITABLE_SNAPSHOT_CONTRACT_VERSION,
    captureId: input.captureId,
    capturedAt: input.capturedAt,
    url: input.url,
    title: input.title,
    sourceProjectKey: input.sourceProjectKey,
    routeKey: input.routeKey,
    pageStateNote: input.pageStateNote,
    viewport: input.viewport,
    executableContent: true,
    licenseStatus: "internal-prototype-pending-review",
    entries: { faithful: "faithful/snapshot.html", workspace: "workspace/index.html" },
    resources,
    scripts,
    sourceMaps: sourceMapResults,
    missingResources: [...missingResources].sort(),
    crossOriginResources: [...crossOriginResources].sort(),
    runtimeDependencies: [...runtimeDependencies].sort(),
  };

  files.push(
    jsonFile("bundle.json", manifest),
    jsonFile("reports/capture-report.json", {
      captureId: input.captureId,
      source: "single-file-cli@2.0.83 embedded core",
      warnings: input.captureWarnings ?? [],
      limitations: [
        "Runtime JavaScript heap, closures, browser storage, service workers and WebSockets are not serialized.",
        "Cross-origin frames and resources may remain network dependencies.",
      ],
    }),
    jsonFile("reports/dependency-graph.json", { nodes: resources, edges: dependencyEdges }),
    jsonFile("reports/readability-report.json", {
      html: { parser: "parse5", status: "serialized-without-node-reordering" },
      css: { extractedInlineStyles: inlineStyleIndex, executionUsesOriginalBytes: true },
      javascript: { extractedInlineScripts: inlineScriptIndex, executionUsesOriginalBytes: true },
      formatting: formattingResults,
      sourceMaps: sourceMapResults,
    }),
    jsonFile("reports/fidelity-report.json", {
      status: "workspace-render-not-run",
      faithfulScreenshot: input.screenshot ? "faithful/screenshot.png" : null,
      workspaceScreenshot: null,
      note: "Run the isolated preview and compare at the manifest viewport before claiming visual fidelity.",
    }),
    jsonFile("reports/security-report.json", {
      executableContent: true,
      findings: securityFindings(input.html),
      storageExported: false,
      cookieExported: false,
      reviewRequiredBeforeOpening: true,
    }),
    jsonFile("reports/workspace-history.json", {
      version: 1,
      entries: [{
        createdAt: input.capturedAt,
        note: "Initial generated workspace",
        files: Object.fromEntries(resources
          .filter((resource) => resource.localPath.startsWith("workspace/"))
          .map((resource) => [resource.localPath, { hash: resource.hash, bytes: resource.bytes }])),
      }],
    }),
    textFile("README.md", buildReadme(input)),
    textFile("AGENT.md", buildAgentGuide(input, manifest)),
    textFile("runner/serve.mjs", previewRunner()),
    textFile("runner/repack.mjs", repackRunner()),
  );

  files.sort((left, right) => left.path.localeCompare(right.path));
  return { manifest, files };
}

function buildReadme(input: SnapshotCaptureInput): string {
  return `# Editable Snapshot: ${input.title}\n\nCaptured from \`${input.url}\` at ${input.capturedAt}.\n\nThis bundle contains executable third-party page content. Treat it as untrusted code. The embedded SingleFile capture engine is AGPL-3.0-or-later; this bundle was produced by an internal prototype pending distribution-license review.\n\n- \`faithful/snapshot.html\`: immutable capture baseline.\n- \`workspace/index.html\`: editable page entry.\n- \`workspace/readable/\`: formatted reading copies; execution continues to use the original-byte workspace files.\n- \`sources/\`: recovered source-map sources; these are evidence, not runtime entries.\n- \`reports/\`: capture, dependency, readability, fidelity, security and workspace-history evidence.\n- \`runner/serve.mjs\`: offline-by-default local preview. Set \`SNAPSHOT_NETWORK=read-only\` for a credential-free GET/HEAD proxy, or \`original\` only after explicit review.\n- \`runner/repack.mjs\`: append a content-hash workspace history entry and create a new ZIP after edits.\n`;
}

function buildAgentGuide(input: SnapshotCaptureInput, manifest: EditableSnapshotBundleManifest): string {
  return `# Agent Guide\n\n## Goal\n\nEdit the captured route \`${input.routeKey}\` while preserving the faithful baseline.\n\n## Rules\n\n- Read \`bundle.json\`, \`reports/dependency-graph.json\` and \`reports/security-report.json\` first.\n- Modify files under \`workspace/\`; never overwrite \`faithful/\`.\n- Prefer first-party scripts. Do not modify \`workspace/scripts/vendor/\` unless explicitly required.\n- Execution uses the original-byte workspace files. \`workspace/readable/\` and \`sources/\` are reading/source-map evidence only.\n- Missing runtime dependencies: ${manifest.missingResources.length ? manifest.missingResources.join(", ") : "none reported"}.\n\n## Preview\n\nRun \`node runner/serve.mjs\`, then open the printed localhost URL. The default is offline. \`SNAPSHOT_NETWORK=read-only\` permits credential-free GET/HEAD requests through the local proxy. Set \`SNAPSHOT_NETWORK=original\` only after explicit review because page code can contact the real backend directly.\n\nCompare at ${input.viewport.width}x${input.viewport.height}; record workspace results in \`reports/fidelity-report.json\`. After edits, run \`SNAPSHOT_CHANGE_NOTE="what changed" node runner/repack.mjs\` to append content hashes to \`reports/workspace-history.json\` and produce a new ZIP.\n`;
}

function repackRunner(): string {
  return `import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(dirname(root), "editable-snapshot-repacked.zip"));
const historyPath = join(root, "reports/workspace-history.json");
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, start) => { let value = start; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const u16 = value => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; };
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const concat = parts => { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; };
async function walk(directory) { const result = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) result.push(...await walk(path)); else if (resolve(path) !== output && !entry.name.endsWith(".zip")) result.push(path); } return result; }
const workspaceFiles = (await walk(join(root, "workspace"))).sort();
const workspaceHashes = Object.fromEntries(await Promise.all(workspaceFiles.map(async path => { const bytes = await readFile(path); return [relative(root, path).split(sep).join("/"), { hash: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length }]; })));
const history = JSON.parse(await readFile(historyPath, "utf8").catch(() => '{"version":1,"entries":[]}'));
history.entries.push({ createdAt: new Date().toISOString(), note: process.env.SNAPSHOT_CHANGE_NOTE || "Repacked workspace", files: workspaceHashes });
await writeFile(historyPath, JSON.stringify(history, null, 2) + "\\n");
const manifestPath = join(root, "bundle.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const knownPaths = new Set(manifest.resources.map(resource => resource.localPath));
for (const resource of manifest.resources) { const current = workspaceHashes[resource.localPath]; if (current) { resource.hash = current.hash; resource.bytes = current.bytes; } }
for (const [localPath, current] of Object.entries(workspaceHashes)) { if (!knownPaths.has(localPath) && !localPath.startsWith("workspace/readable/")) manifest.resources.push({ id: "other:" + current.hash.slice(0, 16), kind: "other", localPath, hash: current.hash, bytes: current.bytes, party: "first-party", status: "localized" }); }
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
const paths = (await walk(root)).sort();
const localParts = []; const centralParts = []; let offset = 0;
for (const path of paths) { const name = encoder.encode(relative(root, path).split(sep).join("/")); const data = new Uint8Array(await readFile(path)); const crc = crc32(data); const local = concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]); localParts.push(local); centralParts.push(concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name])); offset += local.length; }
const central = concat(centralParts); const end = concat([u32(0x06054b50),u16(0),u16(0),u16(paths.length),u16(paths.length),u32(central.length),u32(offset),u16(0)]);
await writeFile(output, concat([...localParts, central, end]));
console.log(\`Repacked [36m\${paths.length}[0m files to \${output}\`);
`;
}

function previewRunner(): string {
  return [
    'import { createServer } from "node:http";',
    'import { readFile, stat } from "node:fs/promises";',
    'import { extname, join, normalize, relative, resolve, sep } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    '',
    'const root = normalize(join(fileURLToPath(new URL("..", import.meta.url)), "workspace"));',
    'const networkMode = process.env.SNAPSHOT_NETWORK ?? "offline";',
    'if (!["offline", "read-only", "original"].includes(networkMode)) throw new Error("SNAPSHOT_NETWORK must be offline, read-only, or original");',
    'const proxyPrefix = "/__snapshot_proxy?url=";',
    'const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };',
    'const server = createServer(async (request, response) => {',
    '  const requestUrl = new URL(request.url ?? "/", "http://localhost");',
    '  if (requestUrl.pathname === "/__snapshot_proxy") {',
    '    if (networkMode !== "read-only" || !["GET", "HEAD"].includes(request.method ?? "GET")) { response.writeHead(405).end("Read-only proxy disabled"); return; }',
    '    let upstream; try { upstream = new URL(requestUrl.searchParams.get("url") ?? ""); } catch { response.writeHead(400).end("Invalid proxy URL"); return; }',
    '    if (!["http:", "https:"].includes(upstream.protocol)) { response.writeHead(400).end("Unsupported proxy protocol"); return; }',
    '    try {',
    '      const result = await fetch(upstream, { method: request.method, redirect: "follow", credentials: "omit", headers: { accept: request.headers.accept ?? "*/*" } });',
    '      response.writeHead(result.status, { "content-type": result.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" });',
    '      response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));',
    '    } catch (error) { response.writeHead(502).end(error instanceof Error ? error.message : "Proxy request failed"); }',
    '    return;',
    '  }',
    '  const pathname = decodeURIComponent(requestUrl.pathname);',
    '  const target = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);',
    '  const rel = relative(root, target);',
    '  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== target || !(await stat(target).catch(() => null))?.isFile()) { response.writeHead(404).end("Not found"); return; }',
    '  response.setHeader("Content-Type", types[extname(target)] ?? "application/octet-stream");',
    '  const connections = networkMode === "original" ? "http: https: ws: wss:" : networkMode === "read-only" ? "\'self\'" : "\'none\'";',
    '  response.setHeader("Content-Security-Policy", `sandbox allow-scripts allow-forms allow-same-origin; default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' data: blob:; style-src \'self\' \'unsafe-inline\' data: blob:; img-src \'self\' data: blob:; font-src \'self\' data: blob:; media-src \'self\' data: blob:; connect-src ${connections}; form-action \'self\'; navigate-to \'self\'`);',
    '  let body = await readFile(target);',
    '  if (networkMode === "read-only" && extname(target) === ".html") {',
    '    const source = body.toString("utf8");',
    '    const rewritten = source.replace(/(src|href|poster)=([' + "\"'" + '])(https?:\\/\\/[^' + "\"'" + ']+)\\2/gi, (_match, attr, quote, url) => `${attr}=${quote}${proxyPrefix}${encodeURIComponent(url)}${quote}`);',
    '    const bridge = `<script>(()=>{const p=${JSON.stringify("/__snapshot_proxy?url=")};const u=v=>{try{const x=new URL(String(v),location.href);return /^https?:$/.test(x.protocol)?p+encodeURIComponent(x.href):v}catch{return v}};const f=window.fetch;window.fetch=(i,o={})=>{const m=String(o.method||"GET").toUpperCase();if(!["GET","HEAD"].includes(m))return Promise.reject(new Error("Editable snapshot read-only mode blocked "+m));return f.call(window,u(i instanceof Request?i.url:i),{...o,credentials:"omit"})};const O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,url,...a){if(!["GET","HEAD"].includes(String(m).toUpperCase()))throw new Error("Editable snapshot read-only mode blocked "+m);return O.call(this,m,u(url),...a)}})();<\\/script>`;',
    '    body = Buffer.from(rewritten.replace(/<head([^>]*)>/i, `<head$1>${bridge}`));',
    '  }',
    '  response.end(body);',
    '});',
    'server.listen(0, "127.0.0.1", () => { const address = server.address(); console.log(`Editable snapshot preview (${networkMode}): http://127.0.0.1:${address.port}`); });',
    '',
  ].join("\n");
}
