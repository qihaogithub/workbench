import type { CaptureTaskState } from "../shared/protocol.js";
import { permissionRequestForUrl } from "../shared/permissions.js";

const form = document.querySelector<HTMLFormElement>("#capture-form")!;
const routeInput = document.querySelector<HTMLInputElement>("#route-key")!;
const projectInput = document.querySelector<HTMLInputElement>("#project-key")!;
const noteInput = document.querySelector<HTMLTextAreaElement>("#page-note")!;
const captureButton = document.querySelector<HTMLButtonElement>("#capture")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
const statusNode = document.querySelector<HTMLElement>("#status")!;
const progressNode = document.querySelector<HTMLProgressElement>("#progress")!;
const detailNode = document.querySelector<HTMLElement>("#detail")!;
const permissionStatusNode = document.querySelector<HTMLElement>("#permission-status")!;
const permissionButton = document.querySelector<HTMLButtonElement>("#grant-permission")!;
const permissionDetailNode = document.querySelector<HTMLElement>("#permission-detail")!;
const reviewNode = document.querySelector<HTMLElement>("#review")!;
const approveButton = document.querySelector<HTMLButtonElement>("#approve-download")!;

let polling: number | undefined;
let activeUrl: string | undefined;

async function refreshPermission(): Promise<boolean> {
  const request = activeUrl ? permissionRequestForUrl(activeUrl) : undefined;
  if (!request) {
    permissionStatusNode.textContent = "当前页面不支持捕获";
    permissionButton.hidden = true;
    return false;
  }
  const granted = await chrome.permissions.contains(request).catch(() => false);
  permissionStatusNode.textContent = granted ? "当前站点已授权，可完整注入捕获钩子" : "当前站点尚未授权，将使用 activeTab 降级捕获";
  permissionButton.hidden = granted;
  permissionDetailNode.textContent = granted
    ? "授权覆盖当前页面的 scheme 与 host（Chrome 无法按端口细分）；不会读取 Cookie、storage 或 history。"
    : "可选授权当前页面的 scheme 与 host 以提高跨页面/跨 iframe 保真度；拒绝后仍可捕获当前标签，但页面加载前状态和部分跨域 iframe 可能无法还原。";
  return granted;
}

async function requestPermission(): Promise<boolean> {
  const request = activeUrl ? permissionRequestForUrl(activeUrl) : undefined;
  if (!request) return false;
  const granted = await chrome.permissions.request(request).catch(() => false);
  await refreshPermission();
  return granted;
}

async function refresh(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" });
  const task = response as CaptureTaskState;
  progressNode.value = task.progress;
  statusNode.textContent = task.message;
  detailNode.textContent = task.error || task.filename || "";
  const reviewRequired = task.phase === "review_required";
  reviewNode.hidden = !reviewRequired;
  approveButton.hidden = !reviewRequired;
  reviewNode.textContent = reviewRequired
    ? JSON.stringify((task as CaptureTaskState & { review?: unknown }).review ?? { warning: "审核摘要缺失" }, null, 2)
    : "";
  const running = !["idle", "ready", "failed", "cancelled"].includes(task.phase);
  captureButton.disabled = running;
  cancelButton.hidden = !running;
  if (running && polling === undefined) polling = window.setInterval(() => void refresh(), 500);
  if (!running && polling !== undefined) { clearInterval(polling); polling = undefined; }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  captureButton.disabled = true;
  detailNode.textContent = "";
  const granted = await requestPermission();
  if (!granted) detailNode.textContent = "未授权站点权限，使用 activeTab 降级捕获；保真限制已记录在报告中。";
  const response = await chrome.runtime.sendMessage({
    target: "background",
    type: "START_CAPTURE",
    routeKey: routeInput.value,
    sourceProjectKey: projectInput.value,
    pageStateNote: noteInput.value,
  });
  if (response?.error) detailNode.textContent = response.error;
  await refresh();
});

permissionButton.addEventListener("click", () => void requestPermission());

cancelButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ target: "background", type: "CANCEL_CAPTURE" });
  await refresh();
});

approveButton.addEventListener("click", async () => {
  approveButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ target: "background", type: "APPROVE_DOWNLOAD" });
  if (response?.error) detailNode.textContent = response.error;
  approveButton.disabled = false;
  await refresh();
});

void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (tab?.url) {
    activeUrl = tab.url;
    routeInput.value = new URL(tab.url).pathname || "/";
    void refreshPermission();
  }
}).catch(() => undefined);
void refresh();
