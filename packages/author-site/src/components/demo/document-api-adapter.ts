import type { KnowledgeItem } from "./KnowledgeDocDialog";

/**
 * Convert the project document contract into the legacy UI item shape.
 *
 * The API deliberately calls the stable key `documentId` and does not expose
 * materialization fields such as `fileName`. The existing document widgets
 * still use `id` internally, so this adapter is the only place where that
 * naming difference is bridged.
 */
export function toKnowledgeItem(payload: unknown): KnowledgeItem {
  if (!payload || typeof payload !== "object") {
    throw new Error("文档响应格式无效");
  }

  const value = payload as Record<string, unknown>;
  const id = typeof value.id === "string"
    ? value.id
    : typeof value.documentId === "string"
      ? value.documentId
      : "";
  if (!id) throw new Error("文档响应缺少 documentId");

  const title = typeof value.title === "string" && value.title.trim()
    ? value.title
    : "未命名文档";
  const updatedAt = typeof value.updatedAt === "string"
    ? value.updatedAt
    : new Date(0).toISOString();
  const description = typeof value.description === "string"
    ? value.description
    : title;
  const source = value.source === "system" ? "system" : "user";
  const sizeBytes = typeof value.sizeBytes === "number" ? value.sizeBytes : 0;

  return {
    id,
    title,
    source,
    description,
    addedAt: typeof value.addedAt === "string" ? value.addedAt : updatedAt,
    updatedAt,
    sizeBytes,
    ...(typeof value.fileName === "string" ? { fileName: value.fileName } : {}),
    ...(typeof value.category === "string" ? { category: value.category } : {}),
    ...(Array.isArray(value.tags) ? { tags: value.tags.filter((tag): tag is string => typeof tag === "string") } : {}),
    ...(typeof value.readonly === "boolean" ? { readonly: value.readonly } : {}),
  };
}

export function toKnowledgeItems(payload: unknown): KnowledgeItem[] {
  if (!Array.isArray(payload)) throw new Error("文档列表响应格式无效");
  return payload.map(toKnowledgeItem);
}
