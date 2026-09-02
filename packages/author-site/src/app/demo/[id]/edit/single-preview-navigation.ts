export type SinglePreviewPage = {
  id: string;
  name: string;
};

export type SinglePreviewNavigableItem = {
  value: string;
  group: "页面";
  label: string;
};

/** 单页目录和前后翻页只允许在页面之间导航。 */
export function buildSinglePreviewNavigableItems(
  pages: readonly SinglePreviewPage[],
): SinglePreviewNavigableItem[] {
  return pages.map((page) => ({
    value: `page:${page.id}`,
    group: "页面",
    label: page.name,
  }));
}
