import type {
  SystemKnowledgeDocument,
  SystemKnowledgeSnapshot,
} from "@opencode-workbench/shared/contracts";

interface KnowledgeSnapshotState {
  snapshot: SystemKnowledgeSnapshot;
  byFileName: Map<string, SystemKnowledgeDocument>;
}

const emptySnapshot: SystemKnowledgeSnapshot = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  documents: [],
};

let state: KnowledgeSnapshotState = {
  snapshot: emptySnapshot,
  byFileName: new Map(),
};

export function setSystemKnowledgeSnapshot(snapshot: SystemKnowledgeSnapshot): void {
  const enabledDocuments = snapshot.documents.filter((doc) => doc.enabled);
  state = {
    snapshot: {
      ...snapshot,
      documents: enabledDocuments,
    },
    byFileName: new Map(enabledDocuments.map((doc) => [doc.fileName, doc])),
  };
}

export function getSystemKnowledgeSnapshot(): SystemKnowledgeSnapshot {
  return state.snapshot;
}

export function getSystemKnowledgeByFileName(
  fileName: string,
): SystemKnowledgeDocument | null {
  return state.byFileName.get(fileName) || null;
}

export function validateSystemKnowledgeSnapshot(
  value: unknown,
): SystemKnowledgeSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as {
    version?: unknown;
    updatedAt?: unknown;
    documents?: unknown;
  };
  if (!Array.isArray(record.documents)) return null;

  const documents: SystemKnowledgeDocument[] = [];
  for (const item of record.documents) {
    if (typeof item !== "object" || item === null) return null;
    const doc = item as Partial<SystemKnowledgeDocument>;
    if (
      typeof doc.id !== "string" ||
      typeof doc.title !== "string" ||
      typeof doc.description !== "string" ||
      typeof doc.fileName !== "string" ||
      typeof doc.content !== "string"
    ) {
      return null;
    }
    documents.push({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      fileName: doc.fileName,
      content: doc.content,
      category: typeof doc.category === "string" ? doc.category : "通用",
      tags: Array.isArray(doc.tags) ? doc.tags.filter((tag): tag is string => typeof tag === "string") : [],
      enabled: doc.enabled !== false,
      sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
      version: typeof doc.version === "number" ? doc.version : 1,
      contentHash: typeof doc.contentHash === "string" ? doc.contentHash : "",
      aiSummary: typeof doc.aiSummary === "string" ? doc.aiSummary : "",
      aiKeywords: Array.isArray(doc.aiKeywords)
        ? doc.aiKeywords.filter((keyword): keyword is string => typeof keyword === "string")
        : [],
      summaryStatus:
        doc.summaryStatus === "ready" ||
        doc.summaryStatus === "stale" ||
        doc.summaryStatus === "failed"
          ? doc.summaryStatus
          : "stale",
      summaryError: typeof doc.summaryError === "string" ? doc.summaryError : undefined,
      createdAt: typeof doc.createdAt === "string" ? doc.createdAt : new Date(0).toISOString(),
      updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : new Date(0).toISOString(),
      updatedBy: typeof doc.updatedBy === "string" ? doc.updatedBy : undefined,
      sizeBytes: typeof doc.sizeBytes === "number" ? doc.sizeBytes : Buffer.byteLength(doc.content, "utf-8"),
    });
  }

  return {
    version: typeof record.version === "number" ? record.version : Date.now(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    documents,
  };
}
