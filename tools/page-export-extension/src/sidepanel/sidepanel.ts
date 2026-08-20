import { filterSelectableTabs, toggleTabSelection, type SelectableTab } from "./batch-selection.js";
import { permissionForUrl } from "../shared/permissions.js";
import { removeHistoryEntry, type CaptureHistoryEntry } from "../shared/history.js";
import type { CaptureTaskState } from "../shared/protocol.js";
import { CAPTURE_PROFILES, DEFAULT_CAPTURE_PROFILE_ID, exactOrigin, removeSiteRule, upsertSiteRule, type CaptureProfileId, type SiteRule } from "../shared/profiles.js";

const loadButton = document.querySelector<HTMLButtonElement>("#load")!;
const filterInput = document.querySelector<HTMLInputElement>("#filter")!;
const tabsNode = document.querySelector<HTMLElement>("#tabs")!;
const countNode = document.querySelector<HTMLElement>("#count")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const statusNode = document.querySelector<HTMLElement>("#status")!;
const continueButton = document.querySelector<HTMLButtonElement>("#continue")!;
const profileSelect = document.querySelector<HTMLSelectElement>("#profile")!;
const profileDescription = document.querySelector<HTMLElement>("#profile-description")!;
const ruleOrigin = document.querySelector<HTMLInputElement>("#rule-origin")!;
const saveRuleButton = document.querySelector<HTMLButtonElement>("#save-rule")!;
const deleteRuleButton = document.querySelector<HTMLButtonElement>("#delete-rule")!;
const rulesNode = document.querySelector<HTMLElement>("#rules")!;
const historyNode = document.querySelector<HTMLElement>("#history")!;
const clearHistoryButton = document.querySelector<HTMLButtonElement>("#clear-history")!;
const reviewNode = document.querySelector<HTMLElement>("#review")!;
const reviewSummaryNode = document.querySelector<HTMLElement>("#review-summary")!;
const approveDownloadButton = document.querySelector<HTMLButtonElement>("#approve-download")!;
const cancelReviewButton = document.querySelector<HTMLButtonElement>("#cancel-review")!;
let tabs: SelectableTab[] = [];
let selected: number[] = [];
let rules: SiteRule[] = [];
let history: CaptureHistoryEntry[] = [];
let profileId: CaptureProfileId = DEFAULT_CAPTURE_PROFILE_ID;

function render(): void {
  const visible = filterSelectableTabs(tabs, filterInput.value);
  tabsNode.replaceChildren(...visible.map((tab) => {
    const row = document.createElement("div"); row.className = "tab";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = `tab-${tab.id}`; checkbox.checked = selected.includes(tab.id);
    checkbox.addEventListener("change", () => { selected = toggleTabSelection(selected, tab.id, checkbox.checked); render(); });
    const label = document.createElement("label"); label.htmlFor = checkbox.id;
    const title = document.createElement("strong"); title.textContent = tab.title || tab.url;
    const url = document.createElement("small"); url.textContent = tab.url;
    label.append(title, url); row.append(checkbox, label); return row;
  }));
  countNode.textContent = selected.length ? `已选择 ${selected.length} 个标签页` : "未选择标签页";
  startButton.disabled = selected.length === 0;
}

function renderRules(): void {
  rulesNode.replaceChildren(...rules.map((rule) => {
    const item = document.createElement("div"); item.className = "history-item";
    const text = document.createElement("span"); text.textContent = `${rule.origin} · ${rule.profileId}`;
    const button = document.createElement("button"); button.type = "button"; button.textContent = "删除";
    button.addEventListener("click", () => void deleteRule(rule.origin)); item.append(text, button); return item;
  }));
}

function renderHistory(): void {
  historyNode.replaceChildren(...history.map((entry) => {
    const item = document.createElement("div"); item.className = "history-item";
    const text = document.createElement("span"); text.textContent = `${entry.status} · ${entry.url} · ${entry.time}`;
    const button = document.createElement("button"); button.type = "button"; button.textContent = "删除";
    button.addEventListener("click", () => { if (window.confirm("确认删除这条导出历史？页面内容不会受影响。")) void deleteHistory(entry.captureId); }); item.append(text, button); return item;
  }));
}

async function persistRules(): Promise<void> { await chrome.storage.local.set({ editableSnapshotSiteRules: rules }); }
async function deleteRule(origin: string): Promise<void> { rules = removeSiteRule(rules, origin); await persistRules(); renderRules(); }
async function deleteHistory(captureId: string): Promise<void> { history = removeHistoryEntry(history, captureId); await chrome.storage.local.set({ editableSnapshotHistory: history }); renderHistory(); }

function renderTask(task: CaptureTaskState): void {
  statusNode.textContent = task.message;
  if (task.phase !== "review_required" || !task.review) { reviewNode.hidden = true; return; }
  reviewNode.hidden = false;
  reviewSummaryNode.textContent = JSON.stringify(task.review, null, 2);
}

async function refreshTask(): Promise<void> {
  const task = await chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" }).catch(() => undefined) as CaptureTaskState | undefined;
  if (task) renderTask(task);
  const stored: Record<string, any> = await chrome.storage.local.get("editableSnapshotHistory").catch(() => ({}));
  history = Array.isArray(stored.editableSnapshotHistory) ? stored.editableSnapshotHistory : history;
  renderHistory();
}

for (const profile of CAPTURE_PROFILES) { const option = document.createElement("option"); option.value = profile.id; option.textContent = profile.name; profileSelect.append(option); }
profileSelect.value = profileId;
profileSelect.addEventListener("change", () => { profileId = profileSelect.value as CaptureProfileId; profileDescription.textContent = CAPTURE_PROFILES.find((item) => item.id === profileId)?.description ?? ""; });
profileDescription.textContent = CAPTURE_PROFILES[0]!.description;

loadButton.addEventListener("click", async () => {
  loadButton.disabled = true; statusNode.textContent = "正在请求 tabs 可选权限…";
  const granted = await chrome.permissions.request({ permissions: ["tabs"] }).catch(() => false);
  if (!granted) { statusNode.textContent = "未授权 tabs，未读取标签页列表。"; loadButton.disabled = false; return; }
  tabs = await chrome.tabs.query({ currentWindow: true }); filterInput.hidden = false; loadButton.hidden = true; statusNode.textContent = ""; render();
});
filterInput.addEventListener("input", render);
startButton.addEventListener("click", async () => {
  startButton.disabled = true; statusNode.textContent = "正在请求所选标签页的站点权限…";
  const origins = [...new Set(selected.map((id) => tabs.find((tab) => tab.id === id)?.url).map((url) => url ? permissionForUrl(url)?.pattern : undefined).filter((value): value is string => Boolean(value)))];
  const granted = await chrome.permissions.request({ origins }).catch(() => false);
  if (!granted) { statusNode.textContent = "未授权所选站点权限，批量队列未启动。"; startButton.disabled = false; return; }
  const response = await chrome.runtime.sendMessage({ target: "background", type: "START_BATCH_CAPTURE", tabIds: selected, profileId });
  statusNode.textContent = response?.error || response?.message || "队列已建立；请按提示激活标签页。";
  continueButton.hidden = !response?.needsActivation;
});
continueButton.addEventListener("click", async () => { const response = await chrome.runtime.sendMessage({ target: "background", type: "CONTINUE_BATCH_CAPTURE" }); statusNode.textContent = response?.error || response?.message || "已尝试继续队列。"; continueButton.hidden = !response?.needsActivation; });
approveDownloadButton.addEventListener("click", async () => { approveDownloadButton.disabled = true; const response = await chrome.runtime.sendMessage({ target: "background", type: "APPROVE_DOWNLOAD" }); statusNode.textContent = response?.error || response?.message || "已批准下载。"; await refreshTask(); approveDownloadButton.disabled = false; });
cancelReviewButton.addEventListener("click", async () => { await chrome.runtime.sendMessage({ target: "background", type: "CANCEL_CAPTURE" }); reviewNode.hidden = true; await refreshTask(); });
saveRuleButton.addEventListener("click", async () => { const origin = exactOrigin(ruleOrigin.value); if (!origin) { statusNode.textContent = "站点规则必须是 HTTP/HTTPS exact origin。"; return; } rules = upsertSiteRule(rules, { origin, profileId, updatedAt: new Date().toISOString() }); await persistRules(); renderRules(); statusNode.textContent = "站点规则已保存，后续单页与批量捕获会自动应用。"; });
deleteRuleButton.addEventListener("click", async () => { const origin = exactOrigin(ruleOrigin.value); if (origin) await deleteRule(origin); });
clearHistoryButton.addEventListener("click", async () => { if (!history.length || !window.confirm("确认清空全部导出历史？页面内容和已下载文件不会受影响。")) return; history = []; await chrome.storage.local.set({ editableSnapshotHistory: history }); renderHistory(); });
void Promise.all([
  chrome.storage.local.get(["editableSnapshotSiteRules", "editableSnapshotHistory"]),
  chrome.tabs.query({ active: true, currentWindow: true }),
]).then(([stored, activeTabs]) => {
  rules = Array.isArray(stored.editableSnapshotSiteRules) ? stored.editableSnapshotSiteRules : [];
  history = Array.isArray(stored.editableSnapshotHistory) ? stored.editableSnapshotHistory : [];
  const activeOrigin = activeTabs[0]?.url ? exactOrigin(activeTabs[0].url) : undefined;
  if (activeOrigin) {
    ruleOrigin.value = activeOrigin;
    const rule = rules.find((item) => item.origin === activeOrigin);
    if (rule) {
      profileId = rule.profileId;
      profileSelect.value = profileId;
      profileDescription.textContent = CAPTURE_PROFILES.find((item) => item.id === profileId)?.description ?? "";
    }
  }
  renderRules(); renderHistory();
}).catch(() => undefined);
void refreshTask();
window.setInterval(() => void refreshTask(), 750);
