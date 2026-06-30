interface ResolvePreviewPageCodeOptions {
  pageId: string;
  pageCodes: Record<string, string | undefined>;
  activeCodePageId?: string;
  activeCode?: string;
}

export function resolvePreviewPageCode({
  pageId,
  pageCodes,
  activeCodePageId,
  activeCode = "",
}: ResolvePreviewPageCodeOptions): string {
  const pageCode = pageCodes[pageId];
  if (pageCode !== undefined) {
    return pageCode;
  }

  return pageId === activeCodePageId ? activeCode : "";
}

export function hasPreviewPageCode(
  options: ResolvePreviewPageCodeOptions,
): boolean {
  return resolvePreviewPageCode(options).length > 0;
}
