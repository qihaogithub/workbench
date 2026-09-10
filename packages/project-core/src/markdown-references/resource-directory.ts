import { encodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";
import type {
  MarkdownReferenceCandidate,
  MarkdownReferenceTarget,
  ReferencePolicy,
  ResourceDirectoryEntry,
  ResourceDirectorySnapshot,
} from "./types.js";

export class ResourceDirectory {
  private readonly entries = new Map<string, ResourceDirectoryEntry>();

  constructor(private readonly snapshot: ResourceDirectorySnapshot) {
    this.add({ target: { kind: "project", projectId: snapshot.project.id }, label: snapshot.project.name, displayPath: snapshot.project.name });
    for (const page of snapshot.pages ?? []) {
      this.add({
        target: { kind: "page", projectId: snapshot.project.id, pageId: page.id },
        label: page.name,
        displayPath: `${snapshot.project.name} / ${page.name}`,
        materializedPath: `demos/${page.id}`,
        aliases: page.routeKey ? [page.routeKey] : [],
      });
    }
    for (const document of snapshot.documents ?? []) {
      this.add({
        target: { kind: "document", projectId: snapshot.project.id, docId: document.id },
        label: document.title,
        displayPath: `${snapshot.project.name} / ${document.title}`,
        materializedPath: `knowledge/${document.fileName}`,
        aliases: [document.fileName, ...(document.tags ?? [])],
        documentGroup: "知识文档",
        hierarchy: [{ id: `group:documents:${snapshot.project.id}:knowledge`, label: "知识文档", kind: "group" }],
        // `readonly` describes editing capability, not read permission. Access
        // filtering belongs to EntityResolver and the caller's policy.
        state: "active",
      });
    }
    for (const entry of snapshot.entries ?? []) this.add(entry);
  }

  get(target: MarkdownReferenceTarget): ResourceDirectoryEntry | null {
    return this.entries.get(key(target)) ?? null;
  }

  resolve(target: MarkdownReferenceTarget): ResourceDirectoryEntry {
    return this.get(target) ?? { target, label: "", displayPath: "", state: "missing" };
  }

  list(policy: ReferencePolicy = {}, query = ""): MarkdownReferenceCandidate[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...this.entries.values()]
      .filter((entry) => !entry.state || entry.state === "active")
      .filter((entry) => !policy.allowedTargetKinds || policy.allowedTargetKinds.includes(entry.target.kind))
      .filter((entry) => !normalizedQuery || [entry.label, entry.displayPath, ...(entry.aliases ?? [])].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
      .map((entry) => ({ target: entry.target, label: entry.label, displayPath: entry.displayPath, hierarchy: entry.hierarchy, documentGroup: entry.documentGroup, aliases: entry.aliases ?? [], score: score(entry, normalizedQuery) }))
      .sort((a, b) => b.score - a.score || a.displayPath.localeCompare(b.displayPath));
  }

  values(): ResourceDirectoryEntry[] { return [...this.entries.values()]; }

  add(entry: ResourceDirectoryEntry): void {
    if (entry.target.projectId === this.snapshot.project.id) this.entries.set(key(entry.target), entry);
  }
}

function key(target: MarkdownReferenceTarget): string {
  return encodeMarkdownReferenceUri(target);
}

function score(entry: ResourceDirectoryEntry, query: string): number {
  if (!query) return entry.target.kind === "project" ? 30 : 20;
  const label = entry.label.toLocaleLowerCase();
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  return 30;
}

export function createResourceDirectory(snapshot: ResourceDirectorySnapshot): ResourceDirectory {
  return new ResourceDirectory(snapshot);
}
