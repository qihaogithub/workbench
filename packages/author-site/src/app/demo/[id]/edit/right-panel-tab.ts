export type RightPanelTab = "edit" | "config" | "comments";
export type CanvasRightPanelTab = Exclude<RightPanelTab, "edit">;

export function resolveCanvasRightPanelTab(
  rightPanelTab: RightPanelTab,
  hasAnyConfig: boolean,
): CanvasRightPanelTab {
  if (!hasAnyConfig) return "comments";
  return rightPanelTab === "comments" ? "comments" : "config";
}
