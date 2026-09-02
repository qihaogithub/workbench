import fs from "fs";
import path from "path";
import type { KnowledgeIndexItem } from "@workbench/shared";
import {
  parseMarkdownReferences,
  type MarkdownReferenceTarget,
} from "@workbench/shared/markdown-reference";

export interface PublishedMarkdownReferenceTarget {
  target: MarkdownReferenceTarget;
  label: string;
  publishedPath: string;
  aliases?: string[];
}

export interface PublishedMarkdownReferenceEdge {
  source:
    | { kind: "knowledge-document"; docId: string }
    | { kind: "page-requirements"; pageId: string }
    | { kind: "design-spec-entry"; specId: string; entryId: string };
  /** Only targets that are public in this immutable snapshot expose identity. */
  target?: MarkdownReferenceTarget;
  labelSnapshot: string;
  targetState: "resolved" | "publish-unavailable";
  line: number;
  column: number;
}

export interface PublishedMarkdownReferenceSnapshot {
  version: 1;
  projectId: string;
  publishedVersion: string;
  canonicalSnapshot: {
    versionId: string;
    workspaceId?: string;
    workspaceRevision?: number;
    workspaceRootHash?: string;
  };
  targets: PublishedMarkdownReferenceTarget[];
  /** Stable document identity to published relative path lookup. */
  documentPaths: Record<string, string>;
  edges: PublishedMarkdownReferenceEdge[];
  unresolvedCount: number;
}

type PublishedPage = {
  id: string;
  name: string;
  order?: number;
  parentId?: string | null;
  routeKey?: string;
  requirements?: string;
};

function publishedTargetKey(target: MarkdownReferenceTarget): string {
  if (target.kind === "project") return `project:${target.projectId}`;
  if (target.kind === "page") return `page:${target.projectId}:${target.pageId}`;
  return `document:${target.projectId}:${target.docId}`;
}

/**
 * Build a public reference projection from the files copied into a temporary
 * publish directory. It never scans live workspace paths and excludes system
 * knowledge documents from the public target directory.
 */
export function buildPublishedMarkdownReferenceSnapshot(input: {
  projectId: string;
  projectName: string;
  publishedVersion: string;
  canonicalSnapshot: PublishedMarkdownReferenceSnapshot["canonicalSnapshot"];
  publishedProjectDir: string;
  pages: readonly PublishedPage[];
  knowledge?: readonly KnowledgeIndexItem[];
  designSpecs?: readonly { id: string }[];
}): PublishedMarkdownReferenceSnapshot {
  const targets: PublishedMarkdownReferenceTarget[] = [
    {
      target: { kind: "project", projectId: input.projectId },
      label: input.projectName,
      publishedPath: "project.json",
    },
    ...input.pages.map((page) => ({
      target: { kind: "page", projectId: input.projectId, pageId: page.id } as MarkdownReferenceTarget,
      label: page.name,
      publishedPath: `demos/${page.id}`,
      aliases: page.routeKey ? [page.routeKey] : undefined,
    })),
    ...(input.knowledge ?? [])
      .filter((item) => item.source !== "system")
      .filter((item) => fs.existsSync(path.join(input.publishedProjectDir, "knowledge", item.fileName)))
      .map((item) => ({
        target: { kind: "document", projectId: input.projectId, docId: item.id } as MarkdownReferenceTarget,
        label: item.title,
        publishedPath: `knowledge/${item.fileName}`,
        aliases: [item.fileName],
      })),
  ];
  const targetKeys = new Set(targets.map((entry) => publishedTargetKey(entry.target)));
  const documentPaths = Object.fromEntries(
    targets.flatMap((entry) => entry.target.kind === "document"
      ? [[entry.target.docId, entry.publishedPath] as const]
      : []),
  );
  const edges: PublishedMarkdownReferenceEdge[] = [];
  const appendEdges = (
    source: PublishedMarkdownReferenceEdge["source"],
    markdown: string,
  ) => {
    for (const reference of parseMarkdownReferences(markdown).references) {
      const resolved = targetKeys.has(publishedTargetKey(reference.target));
      edges.push({
        source,
        ...(resolved ? { target: reference.target } : {}),
        labelSnapshot: reference.labelSnapshot,
        targetState: resolved ? "resolved" : "publish-unavailable",
        line: reference.line,
        column: reference.column,
      });
    }
  };

  for (const page of input.pages) {
    if (typeof page.requirements === "string") {
      appendEdges({ kind: "page-requirements", pageId: page.id }, page.requirements);
    }
  }
  for (const item of input.knowledge ?? []) {
    if (item.source === "system") continue;
    const filePath = path.join(input.publishedProjectDir, "knowledge", item.fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      appendEdges({ kind: "knowledge-document", docId: item.id }, fs.readFileSync(filePath, "utf-8"));
    } catch {
      // A missing document does not invalidate the project publication.
    }
  }
  for (const spec of input.designSpecs ?? []) {
    const filePath = path.join(input.publishedProjectDir, "design-spec", `spec-${spec.id}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { entries?: unknown };
      if (!Array.isArray(parsed.entries)) continue;
      for (const value of parsed.entries) {
        if (!value || typeof value !== "object") continue;
        const entry = value as { id?: unknown; markdown?: unknown };
        if (typeof entry.id === "string" && typeof entry.markdown === "string") {
          appendEdges({ kind: "design-spec-entry", specId: spec.id, entryId: entry.id }, entry.markdown);
        }
      }
    } catch {
      // An invalid optional design-spec file should not invalidate publication.
    }
  }

  return {
    version: 1,
    projectId: input.projectId,
    publishedVersion: input.publishedVersion,
    canonicalSnapshot: input.canonicalSnapshot,
    targets,
    documentPaths,
    edges,
    unresolvedCount: edges.filter((edge) => edge.targetState !== "resolved").length,
  };
}

/** Sanitize Markdown embedded in published DesignSpec JSON files in-place. */
export function sanitizePublishedDesignSpecFiles(
  publishedProjectDir: string,
  snapshot: PublishedMarkdownReferenceSnapshot,
): void {
  const designSpecDir = path.join(publishedProjectDir, "design-spec");
  if (!fs.existsSync(designSpecDir)) return;
  for (const entry of fs.readdirSync(designSpecDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^spec-[A-Za-z0-9_-]{1,120}\.json$/.test(entry.name)) continue;
    const filePath = path.join(designSpecDir, entry.name);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { entries?: unknown };
      if (!Array.isArray(parsed.entries)) continue;
      let changed = false;
      const entries = parsed.entries.map((value) => {
        if (!value || typeof value !== "object") return value;
        const entryValue = value as { markdown?: unknown };
        if (typeof entryValue.markdown !== "string") return value;
        const sanitized = sanitizePublishedMarkdown(entryValue.markdown, snapshot);
        if (sanitized === entryValue.markdown) return value;
        changed = true;
        return { ...entryValue, markdown: sanitized };
      });
      if (changed) fs.writeFileSync(filePath, JSON.stringify({ ...parsed, entries }, null, 2), "utf-8");
    } catch {
      // Keep the existing publish behavior for malformed optional files.
    }
  }
}

/** Remove links whose targets are not part of this public snapshot. */
export function sanitizePublishedMarkdown(
  markdown: string,
  snapshot: PublishedMarkdownReferenceSnapshot,
): string {
  const publicTargets = new Set(snapshot.targets.map((entry) => publishedTargetKey(entry.target)));
  const references = parseMarkdownReferences(markdown).references
    .filter((reference) => !publicTargets.has(publishedTargetKey(reference.target)))
    .sort((a, b) => b.start - a.start);
  let output = markdown;
  for (const reference of references) {
    // A plain label keeps the published text readable without leaking an
    // unpublished project/page/document ID through HTML or source inspection.
    output = output.slice(0, reference.start) + reference.labelSnapshot + output.slice(reference.end);
  }
  return output;
}
