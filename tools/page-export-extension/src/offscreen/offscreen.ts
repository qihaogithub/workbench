import { buildEditableSnapshotBundle, createZip, decodeDataUrl } from "@workbench/editable-snapshot-core";
import * as prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
import htmlPlugin from "prettier/plugins/html";
import postcssPlugin from "prettier/plugins/postcss";
import { acceptCaptureChunk, assembleCaptureChunks } from "../shared/chunks.js";
import { safeBundleFilename, type CaptureConfig } from "../shared/protocol.js";
import { compareRgba, renderFidelity } from "./fidelity.js";

interface PendingCapture {
  config?: CaptureConfig;
  totalChunks?: number;
  chunks: Map<number, string>;
  cancelled: boolean;
}

interface PendingDownload {
  objectUrl: string;
  filename: string;
  expires: ReturnType<typeof setTimeout>;
}

const captures = new Map<string, PendingCapture>();
const pendingDownloads = new Map<string, PendingDownload>();

function getCapture(captureId: string): PendingCapture {
  const existing = captures.get(captureId);
  if (existing) return existing;
  const created: PendingCapture = { chunks: new Map(), cancelled: false };
  captures.set(captureId, created);
  return created;
}

async function sha256(content: Uint8Array): Promise<string> {
  const stableBuffer = content.slice().buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", stableBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function formatReadable(source: string, language: "html" | "css" | "javascript", sourcePath: string): Promise<string> {
  const maxCharacters = 8 * 1024 * 1024;
  if (source.length > maxCharacters) throw new Error(`Readable formatting skipped above 8MB: ${sourcePath}`);
  const parser = language === "html" ? "html" : language === "css" ? "css" : "babel";
  return prettier.format(source, {
    parser,
    plugins: [babelPlugin, estreePlugin, htmlPlugin, postcssPlugin],
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
  });
}

async function fetchResource(url: string): Promise<{ bytes: Uint8Array; mediaType: string; finalUrl?: string }> {
  const response = await chrome.runtime.sendMessage({ target: "background", type: "FETCH_AUTHORIZED_RESOURCE", url });
  if (response?.error) throw new Error(response.error);
  if (!Array.isArray(response?.bytes) || typeof response.mediaType !== "string") throw new Error("Source recovery returned an invalid resource response");
  return {
    bytes: new Uint8Array(response.bytes),
    mediaType: response.mediaType,
    finalUrl: typeof response.finalUrl === "string" ? response.finalUrl : url,
  };
}

async function pngRgba(bytes: Uint8Array): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas is unavailable while comparing fidelity screenshots");
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return { rgba: new Uint8Array(data.buffer.slice(0)), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function comparePng(left: Uint8Array, right: Uint8Array) {
  const [leftImage, rightImage] = await Promise.all([pngRgba(left), pngRgba(right)]);
  return compareRgba(leftImage.rgba, rightImage.rgba, leftImage.width, leftImage.height);
}

function upsertFile(files: Array<{ path: string; content: Uint8Array; mediaType: string }>, path: string, content: Uint8Array, mediaType: string): void {
  const index = files.findIndex((file) => file.path === path);
  const next = { path, content, mediaType };
  if (index >= 0) files[index] = next;
  else files.push(next);
}

async function finishCapture(captureId: string, totalChunks: number): Promise<void> {
  const pending = getCapture(captureId);
  if (pending.cancelled) return;
  if (!pending.config || pending.totalChunks !== totalChunks) {
    throw new Error(`捕获分块不完整：期望 ${pending.totalChunks ?? totalChunks}，收到 ${pending.chunks.size}`);
  }
  const html = assembleCaptureChunks(pending.chunks, totalChunks);
  await chrome.runtime.sendMessage({ target: "background", type: "TASK_PROGRESS", phase: "building_workspace", progress: 70, message: "正在生成 Agent 可编辑工程" });
  const screenshot = pending.config.screenshotDataUrl ? decodeDataUrl(pending.config.screenshotDataUrl)?.bytes : undefined;
  const bundle = await buildEditableSnapshotBundle({
    captureId,
    capturedAt: pending.config.capturedAt,
    url: pending.config.url,
    title: pending.config.title,
    sourceProjectKey: pending.config.sourceProjectKey,
    routeKey: pending.config.routeKey,
    pageStateNote: pending.config.pageStateNote,
    viewport: pending.config.viewport,
    html,
    screenshot,
    captureWarnings: pending.config.captureWarnings,
  }, { sha256, formatReadable, fetchResource });
  if (pending.cancelled) return;
  await chrome.runtime.sendMessage({ target: "background", type: "TASK_PROGRESS", phase: "checking_fidelity", progress: 82, message: "正在离线回放并生成视觉差异报告" });
  try {
    const replay = await renderFidelity(bundle.files, pending.config.viewport);
    const faithfulPath = "faithful/replay-script-disabled.png";
    const workspacePath = "reports/workspace-replay.png";
    upsertFile(bundle.files, faithfulPath, replay.faithful, "image/png");
    upsertFile(bundle.files, workspacePath, replay.workspace, "image/png");
    const workspaceComparison = await comparePng(replay.faithful, replay.workspace);
    const originalComparison = screenshot ? await comparePng(screenshot, replay.faithful) : null;
    const originalPass = originalComparison !== null
      && !originalComparison.sizeMismatch
      && originalComparison.changedPixelRatio <= 0.05
      && originalComparison.meanAbsoluteError <= 8;
    const workspacePass = !workspaceComparison.sizeMismatch
      && workspaceComparison.changedPixelRatio <= 0.01
      && workspaceComparison.meanAbsoluteError <= 2;
    const fidelityReport = {
      status: originalPass && workspacePass ? "pass" : "review-required",
      method: "offline-script-disabled-browser-replay",
      thresholds: {
        originalToFaithful: { changedPixelRatio: 0.05, meanAbsoluteError: 8 },
        faithfulToWorkspace: { changedPixelRatio: 0.01, meanAbsoluteError: 2 },
      },
      originalToFaithful: originalComparison,
      faithfulToWorkspace: workspaceComparison,
      screenshots: {
        original: screenshot ? "faithful/screenshot.png" : null,
        faithfulReplay: faithfulPath,
        workspaceReplay: workspacePath,
      },
      viewport: replay.viewport,
      warnings: replay.warnings,
      limitations: [
        "Replay disables scripts and all external network requests; runtime-only visual state is not reproduced.",
        "PNG comparison is pixel-based and does not prove interaction equivalence.",
      ],
    };
    upsertFile(bundle.files, "reports/fidelity-report.json", new TextEncoder().encode(`${JSON.stringify(fidelityReport, null, 2)}\n`), "application/json");
    for (const [path, content] of [[faithfulPath, replay.faithful], [workspacePath, replay.workspace]] as const) {
      const hash = await sha256(content);
      bundle.manifest.resources.push({
        id: `image:${hash.slice(0, 16)}`,
        kind: "image",
        localPath: path,
        hash,
        bytes: content.length,
        party: "first-party",
        status: "localized",
      });
    }
    upsertFile(bundle.files, "bundle.json", new TextEncoder().encode(`${JSON.stringify(bundle.manifest, null, 2)}\n`), "application/json");
  } catch (error) {
    const fidelityReport = {
      status: "render-failed",
      error: error instanceof Error ? error.message : String(error),
      faithfulScreenshot: screenshot ? "faithful/screenshot.png" : null,
      workspaceScreenshot: null,
      note: "Capture remains usable, but no visual-fidelity claim can be made.",
    };
    upsertFile(bundle.files, "reports/fidelity-report.json", new TextEncoder().encode(`${JSON.stringify(fidelityReport, null, 2)}\n`), "application/json");
  }
  await chrome.runtime.sendMessage({ target: "background", type: "TASK_PROGRESS", phase: "packaging", progress: 90, message: "正在生成 ZIP" });
  const zip = createZip(bundle.files);
  const filename = safeBundleFilename(pending.config.url, pending.config.routeKey, pending.config.capturedAt);
  const zipBuffer = zip.slice().buffer as ArrayBuffer;
  const objectUrl = URL.createObjectURL(new Blob([zipBuffer], { type: "application/zip" }));
  const expires = setTimeout(() => {
    const expired = pendingDownloads.get(captureId);
    if (!expired) return;
    URL.revokeObjectURL(expired.objectUrl);
    pendingDownloads.delete(captureId);
    void chrome.runtime.sendMessage({
      target: "background",
      type: "TASK_FAILED",
      captureId,
      error: "审核等待超过 30 分钟，临时 ZIP 已清理，请重新捕获",
    });
  }, 30 * 60_000);
  pendingDownloads.set(captureId, { objectUrl, filename, expires });
  const securityFile = bundle.files.find((file) => file.path === "reports/security-report.json");
  const fidelityFile = bundle.files.find((file) => file.path === "reports/fidelity-report.json");
  const securityReport = securityFile ? JSON.parse(new TextDecoder().decode(securityFile.content)) : { findings: [] };
  const fidelityReport = fidelityFile ? JSON.parse(new TextDecoder().decode(fidelityFile.content)) : { status: "missing" };
  const response = await chrome.runtime.sendMessage({
    target: "background",
    type: "TASK_REVIEW_READY",
    captureId,
    filename,
    review: {
      executableContent: true,
      findings: securityReport.findings ?? [],
      missingResources: bundle.manifest.missingResources.length,
      crossOriginResources: bundle.manifest.crossOriginResources.length,
      runtimeDependencies: bundle.manifest.runtimeDependencies.length,
      fidelityStatus: fidelityReport.status ?? "unknown",
    },
  });
  if (response?.error) {
    clearTimeout(expires);
    URL.revokeObjectURL(objectUrl);
    pendingDownloads.delete(captureId);
    throw new Error(response.error);
  }
  captures.delete(captureId);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return;
  void (async () => {
    if (message.type === "RESET_CAPTURE") {
      const previous = pendingDownloads.get(message.captureId);
      if (previous) {
        clearTimeout(previous.expires);
        URL.revokeObjectURL(previous.objectUrl);
      }
      pendingDownloads.delete(message.captureId);
      captures.set(message.captureId, { chunks: new Map(), cancelled: false });
    } else if (message.type === "CANCEL_CAPTURE") {
      if (message.captureId) {
        const capture = getCapture(message.captureId);
        capture.cancelled = true;
        capture.chunks.clear();
        captures.delete(message.captureId);
        const pendingDownload = pendingDownloads.get(message.captureId);
        if (pendingDownload) {
          clearTimeout(pendingDownload.expires);
          URL.revokeObjectURL(pendingDownload.objectUrl);
        }
        pendingDownloads.delete(message.captureId);
      }
    } else if (message.type === "APPROVE_DOWNLOAD") {
      const pendingDownload = pendingDownloads.get(message.captureId);
      if (!pendingDownload) throw new Error("待审核 ZIP 已丢失，请重新捕获");
      try {
        const response = await chrome.runtime.sendMessage({
          target: "background",
          type: "TASK_DOWNLOAD",
          captureId: message.captureId,
          objectUrl: pendingDownload.objectUrl,
          filename: pendingDownload.filename,
        });
        if (response?.error) throw new Error(response.error);
      } finally {
        clearTimeout(pendingDownload.expires);
        URL.revokeObjectURL(pendingDownload.objectUrl);
        pendingDownloads.delete(message.captureId);
        await chrome.runtime.sendMessage({ target: "background", type: "TASK_CLEANUP_COMPLETE", captureId: message.captureId });
      }
    } else if (message.type === "CAPTURE_CONTENT_START") {
      const capture = getCapture(message.config.captureId);
      capture.config = {
        ...message.config,
        viewport: message.config.viewport.width ? message.config.viewport : { width: 1440, height: 900, deviceScaleFactor: 1 },
      };
      capture.totalChunks = message.totalChunks;
    } else if (message.type === "CAPTURE_CONTENT_CHUNK") {
      const capture = getCapture(message.captureId);
      if (capture.cancelled) return { ok: true };
      acceptCaptureChunk(capture.chunks, message.sequence, message.checksum, message.chunk);
    } else if (message.type === "CAPTURE_CONTENT_END") {
      void finishCapture(message.captureId, message.totalChunks).catch(async (error) => {
        captures.delete(message.captureId);
        await chrome.runtime.sendMessage({ target: "background", type: "TASK_FAILED", captureId: message.captureId, error: error instanceof Error ? error.message : String(error) });
      });
    }
    return { ok: true };
  })().then(sendResponse, (error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
