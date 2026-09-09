import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";
import { encodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";
import type { ResourceDirectoryEntry } from "./types.js";

/** Metadata only: callers supply already authorized, current-project resources. */
export function buildCandidateDirectoryEntries(input: {
  projectId: string;
  pages: readonly {
    id: string;
    name: string;
    parentId?: string | null;
    schema?: string;
  }[];
  folders?: readonly { id: string; name: string; parentId?: string | null }[];
}): ResourceDirectoryEntry[] {
  const entries: ResourceDirectoryEntry[] = [];
  const nodes = new Map(
    [...(input.folders ?? []), ...input.pages].map((node) => [node.id, node]),
  );
  const pageIds = new Set(input.pages.map((page) => page.id));
  for (const page of input.pages) {
    const hierarchy: NonNullable<ResourceDirectoryEntry["hierarchy"]> = [];
    const seen = new Set([page.id]);
    let parent = page.parentId;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const node = nodes.get(parent);
      if (!node) break;
      hierarchy.unshift({
        id: pageIds.has(node.id)
          ? encodeMarkdownReferenceUri({
              kind: "page",
              projectId: input.projectId,
              pageId: node.id,
            })
          : `folder:${input.projectId}:${node.id}`,
        label: node.name,
        kind: pageIds.has(node.id) ? "page" : "folder",
      });
      parent = node.parentId;
    }
    const target = {
      kind: "page" as const,
      projectId: input.projectId,
      pageId: page.id,
    };
    entries.push({
      target,
      label: page.name,
      hierarchy,
      displayPath: [...hierarchy.map((node) => node.label), page.name].join(
        " / ",
      ),
    });
    const fields = enumerateSchemaFields(page.schema ?? "");
    for (const field of fields) {
      const ancestors = fields
        .filter(
          (other) =>
            other.key !== field.key &&
            (field.key.startsWith(`${other.key}.`) ||
              field.key.startsWith(`${other.key}[`)),
        )
        .sort((a, b) => a.key.length - b.key.length);
      const category = ancestors[0]?.category ?? field.category;
      const configHierarchy: NonNullable<ResourceDirectoryEntry["hierarchy"]> =
        [
          ...hierarchy,
          {
            id: encodeMarkdownReferenceUri(target),
            label: page.name,
            kind: "page",
          },
          ...(category
            ? [
                {
                  id: `group:config:${encodeMarkdownReferenceUri(target)}:${encodeURIComponent(category)}`,
                  label: category,
                  kind: "group" as const,
                },
              ]
            : []),
          ...ancestors.map((ancestor) => ({
            id: encodeMarkdownReferenceUri({
              kind: "config",
              projectId: input.projectId,
              pageId: page.id,
              fieldPath: ancestor.key,
            }),
            label: ancestor.title,
            kind: "config" as const,
          })),
        ];
      entries.push({
        target: {
          kind: "config",
          projectId: input.projectId,
          pageId: page.id,
          fieldPath: field.key,
        },
        label: field.title,
        hierarchy: configHierarchy,
        displayPath: [
          ...configHierarchy.map((node) => node.label),
          field.title,
        ].join(" / "),
        aliases: [field.key],
      });
    }
  }
  return entries;
}
