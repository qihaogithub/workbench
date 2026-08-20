export interface SelectableTab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
}

export function isHttpTab(tab: SelectableTab): tab is SelectableTab & { id: number; url: string } {
  return typeof tab.id === "number" && typeof tab.url === "string" && /^https?:\/\//i.test(tab.url);
}

export function filterSelectableTabs(tabs: SelectableTab[], query = ""): Array<SelectableTab & { id: number; url: string }> {
  const normalized = query.trim().toLocaleLowerCase();
  return tabs.filter(isHttpTab).filter((tab) => {
    if (!normalized) return true;
    return `${tab.title ?? ""} ${tab.url}`.toLocaleLowerCase().includes(normalized);
  }).sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url));
}

export function toggleTabSelection(selected: number[], tabId: number, checked: boolean): number[] {
  const next = new Set(selected);
  if (checked) next.add(tabId); else next.delete(tabId);
  return [...next].sort((a, b) => a - b);
}
