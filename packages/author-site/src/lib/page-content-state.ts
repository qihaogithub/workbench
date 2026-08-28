export type PersistablePageContent = {
  code: string;
  schema: string;
};

/**
 * Content persistence is page-scoped.  In particular, do not fall back to the
 * editor's active code/schema state here: during an asynchronous page switch it
 * can still belong to the previously selected page.
 */
export function getPersistablePageContent(input: {
  pageId: string;
  pageCodes: Record<string, string>;
  pageSchemaMap: Record<string, string>;
}): PersistablePageContent | null {
  if (!Object.hasOwn(input.pageCodes, input.pageId)) return null;
  if (!Object.hasOwn(input.pageSchemaMap, input.pageId)) return null;

  return {
    code: input.pageCodes[input.pageId],
    schema: input.pageSchemaMap[input.pageId],
  };
}
