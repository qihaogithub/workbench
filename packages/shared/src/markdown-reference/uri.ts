import type { MarkdownReferenceTarget } from "./types";

export const MARKDOWN_REFERENCE_PROTOCOL = "wb";
export const MARKDOWN_REFERENCE_VERSION = 1;
/** Derived-index capability version; independent of the stable wire format. */
export const MARKDOWN_REFERENCE_INDEX_VERSION = "markdown-reference-v2";

const KINDS = new Set<MarkdownReferenceTarget["kind"]>(["project", "page", "document", "config"]);

function encodePart(value: string): string {
  if (!value) throw new Error("Workbench reference IDs must be non-empty");
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodePart(value: string): string | undefined {
  if (!value || value.includes("/")) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

export function encodeMarkdownReferenceUri(target: MarkdownReferenceTarget): string {
  switch (target.kind) {
    case "project": return `wb://project/${encodePart(target.projectId)}`;
    case "page": return `wb://page/${encodePart(target.projectId)}/${encodePart(target.pageId)}`;
    case "config": return `wb://config/${encodePart(target.projectId)}/${encodePart(target.pageId)}/${encodePart(target.fieldPath)}`;
    case "document": {
      if ((target.documentKind === "memory" && target.docId !== "memory") || (target.documentKind === "project-convention" && target.docId !== "convention")) throw new Error("Invalid fixed document ID");
      return `wb://document/${encodePart(target.projectId)}/${target.documentKind && target.documentKind !== "knowledge" ? `${encodePart(target.documentKind)}/` : ""}${encodePart(target.docId)}`;
    }
  }
}

export function decodeMarkdownReferenceUri(uri: string): MarkdownReferenceTarget | undefined {
  if (!uri.startsWith("wb://") || uri.includes("#") || uri.includes("?") || /[\s<>]/.test(uri)) return undefined;
  const parts = uri.slice(5).split("/");
  const kind = parts.shift();
  if (!kind || !KINDS.has(kind as MarkdownReferenceTarget["kind"])) return undefined;
  const values = parts.map(decodePart);
  if (values.some((value) => value === undefined)) return undefined;
  if (kind === "project" && values.length === 1) return { kind, projectId: values[0]! };
  if (kind === "page" && values.length === 2) return { kind, projectId: values[0]!, pageId: values[1]! };
  if (kind === "document" && values.length === 2) return { kind, projectId: values[0]!, docId: values[1]! };
  if (kind === "config" && values.length === 3) return { kind, projectId: values[0]!, pageId: values[1]!, fieldPath: values[2]! };
  if (kind === "document" && values.length === 3) {
    const documentKind = values[1];
    if (documentKind !== "memory" && documentKind !== "project-convention" && documentKind !== "page-convention" && documentKind !== "design-spec") return undefined;
    if ((documentKind === "memory" && values[2] !== "memory") || (documentKind === "project-convention" && values[2] !== "convention")) return undefined;
    return { kind, projectId: values[0]!, documentKind, docId: values[2]! };
  }
  return undefined;
}

export function serializeMarkdownReference(target: MarkdownReferenceTarget, label: string): string {
  const escapedLabel = label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `[${escapedLabel}](${encodeMarkdownReferenceUri(target)})`;
}

export const buildMarkdownReferenceUri = encodeMarkdownReferenceUri;
export const encodeWbUri = encodeMarkdownReferenceUri;
export const decodeWbUri = decodeMarkdownReferenceUri;
