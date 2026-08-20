import type { CaptureConfig, CaptureTaskState } from "../shared/protocol.js";
import { isApprovedDownloadRequest, shouldCloseOffscreen } from "../shared/lifecycle.js";
import { appendHistory, type CaptureHistoryStatus } from "../shared/history.js";
import { DEFAULT_CAPTURE_PROFILE_ID, exactOrigin, getCaptureProfile, type CaptureProfileId, type SiteRule } from "../shared/profiles.js";
import { permissionForUrl } from "../shared/permissions.js";

const STATE_KEY = "editableSnapshotTask";
const CONFIG_KEY = "editableSnapshotConfig";
const BATCH_KEY = "editableSnapshotBatch";
let capturePort: chrome.runtime.Port | undefined;
let captureCancellation: { port: chrome.runtime.Port; promise: Promise<void>; resolve: () => void } | undefined;
let batchQueue: number[] = [];
let batchRunning = false;
let batchProfileId: CaptureProfileId = DEFAULT_CAPTURE_PROFILE_ID;

async function restoreBatch(): Promise<void> {
  const stored = await chrome.storage.session.get(BATCH_KEY);
  const batch = stored[BATCH_KEY] as { queue?: number[]; running?: boolean; profileId?: string } | undefined;
  batchQueue = Array.isArray(batch?.queue) ? batch.queue.filter((value) => Number.isInteger(value) && value > 0) : [];
  batchRunning = Boolean(batch?.running);
  batchProfileId = getCaptureProfile(batch?.profileId).id;
}

async function persistBatch(): Promise<void> {
  if (!batchQueue.length && !batchRunning) {
    await chrome.storage.session.remove(BATCH_KEY);
    return;
  }
  await chrome.storage.session.set({ [BATCH_KEY]: { queue: batchQueue, running: batchRunning, profileId: batchProfileId } });
}

async function resetBatch(): Promise<void> {
  batchRunning = false;
  batchQueue = [];
  batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
  await persistBatch();
}

function state(phase: CaptureTaskState["phase"], progress: number, message: string, extra: Partial<CaptureTaskState> = {}): CaptureTaskState {
  return { phase, progress, message, updatedAt: new Date().toISOString(), ...extra };
}

async function setState(next: CaptureTaskState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: next });
}

async function recordHistory(status: CaptureHistoryStatus, filename?: string): Promise<void> {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(CONFIG_KEY),
    chrome.storage.local.get("editableSnapshotHistory"),
  ]);
  const config = session[CONFIG_KEY] as CaptureConfig | undefined;
  if (!config) return;
  const current = Array.isArray(local.editableSnapshotHistory) ? local.editableSnapshotHistory : [];
  await chrome.storage.local.set({
    editableSnapshotHistory: appendHistory(current, {
      captureId: config.captureId,
      url: config.url,
      routeKey: config.routeKey,
      time: config.capturedAt,
      filename,
      status,
    }),
  });
}

async function getState(): Promise<CaptureTaskState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  const current = stored[STATE_KEY] as CaptureTaskState | undefined;
  if (!current) return state("idle", 0, "准备捕获当前标签页");
  const age = Date.now() - Date.parse(current.updatedAt);
  const lostActiveCapture = ["preparing_page", "capturing"].includes(current.phase) && !capturePort && age > 10_000;
  const staleTask = !["idle", "ready", "failed", "cancelled", "review_required", "batch_queued"].includes(current.phase)
    && age > 5 * 60_000;
  if (lostActiveCapture || staleTask) {
    const failed = state("failed", 0, "扩展服务工作线程已重启，请重新捕获（不支持续传）", {
      captureId: current.captureId,
      error: "CAPTURE_STATE_LOST_RETRY_REQUIRED",
    });
    await recordHistory("failed");
    batchRunning = false;
    batchQueue = [];
    batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
    await Promise.all([
      chrome.storage.session.set({ [STATE_KEY]: failed }),
      chrome.storage.session.remove(CONFIG_KEY),
      persistBatch(),
      current.captureId
        ? chrome.runtime.sendMessage({ target: "offscreen", type: "CANCEL_CAPTURE", captureId: current.captureId }).catch(() => undefined)
        : Promise.resolve(),
    ]);
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument().catch(() => undefined);
    }
    return failed;
  }
  return current;
}

async function closeOffscreenWhenIdle(): Promise<void> {
  const [hasDocument, current] = await Promise.all([chrome.offscreen.hasDocument(), getState()]);
  if (shouldCloseOffscreen({ hasDocument, capturePortActive: Boolean(capturePort), phase: current.phase })) {
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
}

function closeOffscreenAfterReply(): void {
  setTimeout(() => void closeOffscreenWhenIdle(), 0);
}

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["BLOBS"],
    justification: "Build and download large editable snapshot ZIP bundles outside the service worker lifecycle.",
  });
}

/** Fetch source-map material in the service worker, where host permissions are authoritative. */
async function fetchAuthorizedResource(urlValue: unknown): Promise<{ bytes: number[]; mediaType: string; finalUrl: string }> {
  if (typeof urlValue !== "string") throw new Error("资源地址无效");
  const parsed = new URL(urlValue);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`不支持的资源协议：${parsed.protocol}`);
  const permission = permissionForUrl(parsed.href);
  if (!permission || !(await chrome.permissions.contains({ origins: [permission.pattern] }))) {
    throw new Error(`source map 恢复需要已授权的 scheme-and-host：${parsed.protocol}//${parsed.hostname}`);
  }
  const response = await fetch(parsed.href, { credentials: "omit", cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(`资源读取失败（${response.status}）：${parsed.href}`);
  return {
    bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    mediaType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
    finalUrl: response.url || parsed.href,
  };
}

async function startCapture(request: { routeKey?: string; sourceProjectKey?: string; pageStateNote?: string; tabId?: number; profileId?: string }): Promise<{ ok: true; captureId: string }> {
  const candidateTabs = await chrome.tabs.query(request.tabId ? {} : { active: true, currentWindow: true });
  const tab = request.tabId ? candidateTabs.find((item) => item.id === request.tabId) : candidateTabs[0];
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error("只能捕获当前活动的 HTTP/HTTPS 页面");
  const captureId = crypto.randomUUID();
  await setState(state("preparing_page", 5, "正在准备当前页面", { captureId }));
  await ensureOffscreen();

  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }).catch(() => undefined);
  const tabUrl = tab.url;
  const url = new URL(tabUrl);
  const storedRules = await chrome.storage.local.get("editableSnapshotSiteRules");
  const rules = Array.isArray(storedRules.editableSnapshotSiteRules) ? storedRules.editableSnapshotSiteRules as SiteRule[] : [];
  const siteProfileId = rules.find((rule) => rule.origin === exactOrigin(tabUrl))?.profileId;
  const profile = getCaptureProfile(siteProfileId ?? request.profileId);
  const config: CaptureConfig = {
    captureId,
    routeKey: request.routeKey?.trim() || url.pathname || "/",
    sourceProjectKey: request.sourceProjectKey?.trim() || undefined,
    pageStateNote: request.pageStateNote?.trim() || undefined,
    capturedAt: new Date().toISOString(),
    url: tabUrl,
    title: tab.title || url.hostname,
    viewport: { width: 0, height: 0, deviceScaleFactor: 1 },
    screenshotDataUrl,
    profileId: profile.id,
    captureWarnings: [
      "activeTab capture hooks were injected after page load; states created before injection may be incomplete.",
      ...(!screenshotDataUrl ? ["Visible-tab screenshot permission was unavailable; original-to-faithful pixel comparison was skipped."] : []),
      ...(profile.id === "compact-review" ? ["Compact Review removes selected hidden/unused resources and is not an editable-fidelity original."] : []),
    ],
  };
  await chrome.storage.session.set({ [CONFIG_KEY]: config });
  await chrome.runtime.sendMessage({ target: "offscreen", type: "RESET_CAPTURE", captureId });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["vendor/single-file-hook.js"],
      world: "MAIN",
      injectImmediately: true,
    });
  } catch {
    config.captureWarnings?.push("Cross-origin frame hook injection was denied; capture fell back to the top frame.");
    await chrome.storage.session.set({ [CONFIG_KEY]: config });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/single-file-hook.js"],
      world: "MAIN",
      injectImmediately: true,
    });
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/capture.js"],
    world: "ISOLATED",
    injectImmediately: true,
  });
  return { ok: true, captureId };
}

async function advanceBatch(): Promise<{ ok: true; message: string; needsActivation?: boolean }> {
  await restoreBatch();
  if (batchRunning) return { ok: true, message: "当前批量捕获仍在进行" };
  const nextId = batchQueue[0];
  if (nextId === undefined) return { ok: true, message: "批量捕获队列已完成" };
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id !== nextId) {
    await setState(state("batch_queued", 0, `请切换到选中的标签页后继续（剩余 ${batchQueue.length} 个）`));
    return { ok: true, message: "请切换到下一个选中的标签页后继续；插件不会自动切换或伪造截图", needsActivation: true };
  }
  batchRunning = true;
  await persistBatch();
  try {
    await startCapture({ tabId: nextId, profileId: batchProfileId });
  } catch (error) {
    batchRunning = false;
    batchQueue = [];
    batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
    await persistBatch();
    throw error;
  }
  return { ok: true, message: `已启动批量队列中的标签页（剩余 ${batchQueue.length} 个）` };
}

async function startBatchCapture(tabIds: unknown, profileId: unknown): Promise<{ ok: true; message: string; needsActivation?: boolean }> {
  await restoreBatch();
  const current = await getState();
  if (!["idle", "ready", "failed", "cancelled"].includes(current.phase)) throw new Error("已有捕获或审核任务，请先完成或取消");
  const ids = Array.isArray(tabIds) ? [...new Set(tabIds.filter((value): value is number => Number.isInteger(value) && value > 0))] : [];
  if (!ids.length) throw new Error("请至少选择一个标签页");
  if (batchRunning || batchQueue.length) throw new Error("已有批量捕获队列，请先完成或取消当前任务");
  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  const selectedTabs = currentWindowTabs.filter((tab) => tab.id && ids.includes(tab.id) && tab.url && /^https?:\/\//i.test(tab.url));
  if (selectedTabs.length !== ids.length) throw new Error("批量队列只接受当前窗口中显式选择的 HTTP/HTTPS 标签页");
  const origins = [...new Set(selectedTabs.flatMap((tab) => {
    const permission = tab.url ? permissionForUrl(tab.url) : undefined;
    return permission ? [permission.pattern] : [];
  }))];
  if (!(await chrome.permissions.contains({ origins }))) throw new Error("所选标签页的 scheme-and-host 权限未完整授权");
  batchQueue = ids;
  batchProfileId = getCaptureProfile(typeof profileId === "string" ? profileId : undefined).id;
  await persistBatch();
  return advanceBatch();
}

async function cancelCapture(): Promise<void> {
  const current = await getState();
  const port = capturePort;
  let cancellationAcknowledged = true;
  if (port) {
    let resolveCancellation!: () => void;
    const promise = new Promise<void>((resolve) => { resolveCancellation = resolve; });
    captureCancellation = { port, promise, resolve: resolveCancellation };
    await setState(state(current.phase, current.progress, "正在等待页面释放捕获资源", { captureId: current.captureId }));
    port.postMessage({ type: "CAPTURE_CANCEL" });
    cancellationAcknowledged = await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30_000)),
    ]);
    if (captureCancellation?.port === port) captureCancellation = undefined;
  }
  if (capturePort === port) capturePort = undefined;
  port?.disconnect();
  await chrome.runtime.sendMessage({ target: "offscreen", type: "CANCEL_CAPTURE", captureId: current.captureId });
  await recordHistory("cancelled");
  await chrome.storage.session.remove(CONFIG_KEY);
  batchRunning = false;
  batchQueue = [];
  batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
  await persistBatch();
  await setState(state("cancelled", current.progress, cancellationAcknowledged ? "捕获已取消，页面资源已释放" : "捕获已取消，但页面资源释放超时；重试前请刷新页面", {
    captureId: current.captureId,
    ...(!cancellationAcknowledged ? { error: "CAPTURE_CANCEL_ACK_TIMEOUT_RELOAD_REQUIRED" } : {}),
  }));
  await closeOffscreenWhenIdle();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "editable-snapshot-capture") return;
  capturePort = port;
  let messageQueue = Promise.resolve();
  let forwardedChunks = 0;
  let expectedChunks = 0;
  port.onMessage.addListener((message) => {
    messageQueue = messageQueue.then(async () => {
      if (message.type === "CAPTURE_CANCELLED" && captureCancellation?.port === port) {
        captureCancellation.resolve();
        return;
      }
      if (capturePort !== port || captureCancellation?.port === port) return;
      if (message.type === "CAPTURE_READY") {
        const stored = await chrome.storage.session.get(CONFIG_KEY);
        const config = stored[CONFIG_KEY] as CaptureConfig | undefined;
        if (!config) return port.disconnect();
        port.postMessage({ type: "CAPTURE_START", config });
      } else if (message.type === "CAPTURE_PROGRESS") {
        const current = await getState();
        await setState(state(message.phase, message.progress, message.message, { captureId: current.captureId }));
      } else if (message.type === "CAPTURE_WARNING") {
        const stored = await chrome.storage.session.get(CONFIG_KEY);
        const config = stored[CONFIG_KEY] as CaptureConfig | undefined;
        if (config) {
          config.captureWarnings = [...(config.captureWarnings ?? []), message.message];
          await chrome.storage.session.set({ [CONFIG_KEY]: config });
        }
      } else if (["CAPTURE_CONTENT_START", "CAPTURE_CONTENT_CHUNK", "CAPTURE_CONTENT_END"].includes(message.type)) {
        let forwardedMessage = message;
        if (message.type === "CAPTURE_CONTENT_START") {
          forwardedChunks = 0;
          expectedChunks = message.totalChunks;
          const stored = await chrome.storage.session.get(CONFIG_KEY);
          const storedConfig = stored[CONFIG_KEY] as CaptureConfig | undefined;
          forwardedMessage = {
            ...message,
            config: { ...message.config, captureWarnings: storedConfig?.captureWarnings ?? message.config.captureWarnings },
          };
        }
        const response = await chrome.runtime.sendMessage({ target: "offscreen", ...forwardedMessage });
        if (response?.error) throw new Error(response.error);
        if (message.type === "CAPTURE_CONTENT_START") {
          await setState(state("capturing", 20, `页面已生成 ${message.totalChunks} 个分块，正在传输`, { captureId: message.config.captureId }));
        } else if (message.type === "CAPTURE_CONTENT_CHUNK") {
          forwardedChunks += 1;
          if (forwardedChunks === expectedChunks || forwardedChunks % 16 === 0) {
            const progress = Math.min(54, 20 + Math.floor(34 * forwardedChunks / Math.max(1, expectedChunks)));
            await setState(state("capturing", progress, `正在传输分块 ${forwardedChunks}/${expectedChunks}`, { captureId: message.captureId }));
          }
        } else if (message.type === "CAPTURE_CONTENT_END") {
          await setState(state("parsing", 55, "分块传输完成，正在校验并组装页面", { captureId: message.captureId }));
        }
      } else if (message.type === "CAPTURE_ERROR") {
        const current = await getState();
        await recordHistory("failed");
        await chrome.storage.session.remove(CONFIG_KEY);
        await setState(state("failed", current.progress, "捕获失败", { captureId: current.captureId, error: message.error }));
        await resetBatch();
        port.disconnect();
        if (capturePort === port) capturePort = undefined;
        await closeOffscreenWhenIdle();
      }
    }).catch(async (error) => {
      if (capturePort !== port) return;
      const current = await getState();
      await recordHistory("failed");
      await chrome.storage.session.remove(CONFIG_KEY);
      await setState(state("failed", current.progress, "处理捕获数据失败", {
        captureId: current.captureId,
        error: error instanceof Error ? error.message : String(error),
      }));
      await resetBatch();
      if (capturePort === port) {
        capturePort = undefined;
        port.disconnect();
        await closeOffscreenWhenIdle();
      }
    });
  });
  port.onDisconnect.addListener(() => {
    if (captureCancellation?.port === port) captureCancellation.resolve();
    if (capturePort === port) capturePort = undefined;
    void closeOffscreenWhenIdle();
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target && message.target !== "background") return;
  void (async () => {
    if (message.type === "GET_STATE") return getState();
    if (message.type === "FETCH_AUTHORIZED_RESOURCE") return fetchAuthorizedResource(message.url);
    if (message.type === "START_CAPTURE") {
      const current = await getState();
      await restoreBatch();
      if (!["idle", "ready", "failed", "cancelled"].includes(current.phase) || batchQueue.length || batchRunning) {
        throw new Error("已有捕获、批量队列或审核任务，请先完成或取消");
      }
      try {
        return await startCapture(message);
      } catch (error) {
        await recordHistory("failed");
        await chrome.storage.session.remove(CONFIG_KEY);
        capturePort?.disconnect();
        capturePort = undefined;
        await setState(state("failed", 0, "无法启动捕获", { error: error instanceof Error ? error.message : String(error) }));
        await closeOffscreenWhenIdle();
        throw error;
      }
    }
    if (message.type === "CANCEL_CAPTURE") return cancelCapture().then(() => ({ ok: true }));
    if (message.type === "TASK_PROGRESS") {
      const current = await getState();
      await setState(state(message.phase, message.progress, message.message, { captureId: current.captureId }));
      return { ok: true };
    }
    if (message.type === "TASK_REVIEW_READY") {
      await setState(state("review_required", 96, "ZIP 已生成，请检查安全与保真摘要后确认下载", {
        captureId: message.captureId,
        filename: message.filename,
        review: message.review,
      }));
      capturePort?.disconnect();
      capturePort = undefined;
      return { ok: true };
    }
    if (message.type === "APPROVE_DOWNLOAD") {
      const current = await getState();
      if (current.phase !== "review_required" || !current.captureId) throw new Error("当前没有待审核 ZIP");
      const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "APPROVE_DOWNLOAD", captureId: current.captureId });
      if (response?.error) {
        await setState(state("failed", current.progress, "待审核 ZIP 已丢失，请重新捕获", {
          captureId: current.captureId,
          error: response.error,
        }));
        await closeOffscreenWhenIdle();
      }
      return response;
    }
    if (message.type === "TASK_DOWNLOAD") {
      const current = await getState();
      if (!isApprovedDownloadRequest({
        state: current,
        captureId: message.captureId,
        filename: message.filename,
        objectUrl: message.objectUrl,
        extensionRoot: chrome.runtime.getURL(""),
      })) {
        throw new Error("下载请求未通过 review_required/captureId/extension Blob 校验");
      }
      await chrome.downloads.download({ url: message.objectUrl, filename: message.filename, saveAs: true });
      await recordHistory("ready", message.filename);
      await chrome.storage.session.remove(CONFIG_KEY);
      await setState(state("ready", 100, "ZIP 下载已发起", { captureId: message.captureId, filename: message.filename }));
      capturePort?.disconnect();
      capturePort = undefined;
      await restoreBatch();
      if (batchRunning) {
        batchRunning = false;
        batchQueue.shift();
        await persistBatch();
        if (batchQueue.length) void advanceBatch();
        else batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
      } else if (!batchQueue.length) {
        batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
      }
      await persistBatch();
      return { ok: true };
    }
    if (message.type === "TASK_CLEANUP_COMPLETE") {
      const current = await getState();
      if (current.captureId === message.captureId && ["ready", "failed", "cancelled"].includes(current.phase)) {
        closeOffscreenAfterReply();
      }
      return { ok: true };
    }
    if (message.type === "TASK_FAILED") {
      await recordHistory("failed");
      await chrome.storage.session.remove(CONFIG_KEY);
      await setState(state("failed", 0, "快照打包失败", { captureId: message.captureId, error: message.error }));
      capturePort?.disconnect();
      capturePort = undefined;
      closeOffscreenAfterReply();
      batchRunning = false;
      batchQueue = [];
      batchProfileId = DEFAULT_CAPTURE_PROFILE_ID;
      await persistBatch();
      return { ok: true };
    }
    if (message.type === "START_BATCH_CAPTURE") return startBatchCapture(message.tabIds, message.profileId);
    if (message.type === "CONTINUE_BATCH_CAPTURE") return advanceBatch();
  })().then(sendResponse, (error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
