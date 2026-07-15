import type { CollabResourceKind } from "@workbench/shared/contracts";

/**
 * Hocuspocus documentName encoding.
 *
 * Encodes the full collab room descriptor as a JSON string so that
 * Hocuspocus extensions (onAuthenticate, onLoadDocument, onStoreDocument)
 * can recover projectId / workspaceId / resourcePath / kind from the
 * document name alone, without relying on query parameters.
 */
export interface CollabDocumentName {
  projectId: string;
  workspaceId: string;
  resourcePath: string;
  kind: CollabResourceKind;
}

export function encodeDocumentName(input: CollabDocumentName): string {
  return JSON.stringify(input);
}

export function decodeDocumentName(
  documentName: string,
): CollabDocumentName | null {
  try {
    const parsed = JSON.parse(documentName) as Partial<CollabDocumentName>;
    if (
      typeof parsed.projectId !== "string" ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.resourcePath !== "string" ||
      typeof parsed.kind !== "string"
    ) {
      return null;
    }
    return {
      projectId: parsed.projectId,
      workspaceId: parsed.workspaceId,
      resourcePath: parsed.resourcePath,
      kind: parsed.kind as CollabResourceKind,
    };
  } catch {
    return null;
  }
}
