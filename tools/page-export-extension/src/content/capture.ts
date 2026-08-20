import { CAPTURE_CHUNK_BYTES, checksumChunk, type CaptureConfig } from "../shared/protocol.js";
import { getCaptureProfile } from "../shared/profiles.js";

const port = chrome.runtime.connect({ name: "editable-snapshot-capture" });
let cancelled = false;

port.onDisconnect.addListener(() => { cancelled = true; });
port.postMessage({ type: "CAPTURE_READY" });
port.onMessage.addListener((message) => {
  if (message.type === "CAPTURE_START") void capture(message.config as CaptureConfig);
  if (message.type === "CAPTURE_CANCEL") cancelled = true;
});

async function capture(config: CaptureConfig): Promise<void> {
  const restoreCanvas = preserveCanvasPixels();
  const restoreScriptOrigins = preserveExternalScriptOrigins();
  try {
    singlefile.init({ fetch: globalThis.fetch.bind(globalThis) });
    port.postMessage({ type: "CAPTURE_PROGRESS", phase: "capturing", progress: 15, message: "SingleFile 正在采集当前页面状态" });
    const result = await singlefile.getPageData({ ...getCaptureProfile(config.profileId).options });
    if (cancelled) return;
    const html = typeof result.content === "string" ? result.content : new TextDecoder().decode(result.content);
    config.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio || 1,
    };
    const totalChunks = Math.ceil(html.length / CAPTURE_CHUNK_BYTES);
    port.postMessage({ type: "CAPTURE_CONTENT_START", config: { ...config, title: result.title || config.title }, totalChunks, totalCharacters: html.length });
    for (let sequence = 0; sequence < totalChunks; sequence += 1) {
      if (cancelled) return;
      const chunk = html.slice(sequence * CAPTURE_CHUNK_BYTES, (sequence + 1) * CAPTURE_CHUNK_BYTES);
      port.postMessage({ type: "CAPTURE_CONTENT_CHUNK", captureId: config.captureId, sequence, checksum: checksumChunk(chunk), chunk });
      if (sequence % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    port.postMessage({ type: "CAPTURE_CONTENT_END", captureId: config.captureId, totalChunks });
  } catch (error) {
    port.postMessage({ type: "CAPTURE_ERROR", error: error instanceof Error ? error.message : String(error) });
  } finally {
    restoreCanvas();
    restoreScriptOrigins();
    if (cancelled) {
      try { port.postMessage({ type: "CAPTURE_CANCELLED" }); } catch { /* The background may have already closed the port. */ }
    }
  }
}

/**
 * SingleFile inlines external scripts as data URLs. Retain their resolved source
 * URL in the captured document so the bundle builder can resolve an external
 * sourceMappingURL relative to the script that originally declared it.
 */
function preserveExternalScriptOrigins(): () => void {
  const restores: Array<() => void> = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>("script[src]")) {
    const sourceUrl = script.src;
    if (!/^https?:/i.test(sourceUrl)) continue;
    const previous = script.getAttribute("data-editable-snapshot-original-src");
    script.setAttribute("data-editable-snapshot-original-src", sourceUrl);
    restores.push(() => {
      if (previous === null) script.removeAttribute("data-editable-snapshot-original-src");
      else script.setAttribute("data-editable-snapshot-original-src", previous);
    });
  }
  return () => restores.forEach((restore) => restore());
}

function preserveCanvasPixels(): () => void {
  const restores: Array<() => void> = [];
  for (const canvas of document.querySelectorAll("canvas")) {
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const previousMarker = canvas.getAttribute("data-editable-snapshot-canvas");
      const previousBackground = canvas.style.backgroundImage;
      const previousSize = canvas.style.backgroundSize;
      canvas.setAttribute("data-editable-snapshot-canvas", dataUrl);
      canvas.style.backgroundImage = `url("${dataUrl}")`;
      canvas.style.backgroundSize = "100% 100%";
      restores.push(() => {
        if (previousMarker === null) canvas.removeAttribute("data-editable-snapshot-canvas");
        else canvas.setAttribute("data-editable-snapshot-canvas", previousMarker);
        canvas.style.backgroundImage = previousBackground;
        canvas.style.backgroundSize = previousSize;
      });
    } catch {
      configWarning("A canvas was tainted or unreadable and could not be serialized.");
    }
  }
  return () => restores.forEach((restore) => restore());
}

function configWarning(message: string): void {
  port.postMessage({ type: "CAPTURE_WARNING", message });
}
