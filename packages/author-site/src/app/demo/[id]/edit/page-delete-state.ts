export function filterPendingDeletedPages<T extends { id: string }>(
  pages: readonly T[],
  pendingPageIds: ReadonlySet<string>,
): T[] {
  if (pendingPageIds.size === 0) return [...pages];
  return pages.filter((page) => !pendingPageIds.has(page.id));
}

/**
 * Keep pages that are hidden optimistically in the canonical list while
 * accepting edits made to the remaining visible pages (for example, a
 * reorder in the page tree during a pending delete).
 */
export function mergePendingDeletedPages<
  T extends { id: string; order?: number },
>(
  currentPages: readonly T[],
  visiblePages: readonly T[],
  pendingPageIds: ReadonlySet<string>,
): T[] {
  if (pendingPageIds.size === 0) return [...visiblePages];

  const visiblePageIds = new Set(visiblePages.map((page) => page.id));
  const merged = [
    ...visiblePages,
    ...currentPages.filter(
      (page) => pendingPageIds.has(page.id) && !visiblePageIds.has(page.id),
    ),
  ];
  if (!merged.every((page) => typeof page.order === "number")) return merged;
  return merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
