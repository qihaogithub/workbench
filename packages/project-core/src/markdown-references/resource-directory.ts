import type {
  MarkdownReferenceCandidate,
  MarkdownReferenceTarget,
  ReferencePolicy,
  ResourceDirectoryEntry,
  ResourceDirectorySnapshot,
} from "./types.js";

export class ResourceDirectory {
  private readonly entries = new Map<string, ResourceDirectoryEntry>();

  constructor(snapshot: ResourceDirectorySnapshot) {
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
        // `readonly` describes editing capability, not read permission. Access
        // filtering belongs to EntityResolver and the caller's policy.
        state: "active",
      });
    }
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
      .filter((entry) => entry.state !== "forbidden")
      .filter((entry) => !policy.allowedTargetKinds || policy.allowedTargetKinds.includes(entry.target.kind))
      .filter((entry) => !normalizedQuery || [entry.label, entry.displayPath, ...(entry.aliases ?? [])].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
      .map((entry) => ({ ...entry, aliases: entry.aliases ?? [], score: score(entry, normalizedQuery) }))
      .sort((a, b) => b.score - a.score || a.displayPath.localeCompare(b.displayPath));
  }

  values(): ResourceDirectoryEntry[] { return [...this.entries.values()]; }

  private add(entry: ResourceDirectoryEntry): void { this.entries.set(key(entry.target), entry); }
}

function key(target: MarkdownReferenceTarget): string {
  return target.kind === "project" ? `project:${target.projectId}` : target.kind === "page" ? `page:${target.projectId}:${target.pageId}` : `document:${target.projectId}:${target.docId}`;
}

function score(entry: ResourceDirectoryEntry, query: string): number {
  if (!query) return entry.target.kind === "project" ? 30 : 20;
  const label = entry.label.toLocaleLowerCase();
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  return 30;
}

export function createResourceDirectory(snapshot: ResourceDirectorySnapshot): ResourceDirectory { return new ResourceDirectory(snapshot); }
