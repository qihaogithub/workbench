import type { SketchPatchVersionSummary } from "@workbench/project-core";
import type {
  SketchSceneDocument,
  SketchScenePatchOperation,
} from "@workbench/shared";

export interface OpenPencilPatchDraft {
  patchBaseSceneKey?: string;
  patchOperations?: SketchScenePatchOperation[];
}

export interface OpenPencilPatchSummaryRecord {
  sceneKey: string;
  summary: SketchPatchVersionSummary;
}

export function createOpenPencilPatchSummaryRecord(
  scene: SketchSceneDocument,
  draft?: OpenPencilPatchDraft,
): OpenPencilPatchSummaryRecord | undefined {
  if (!draft?.patchOperations?.length) return undefined;

  return {
    sceneKey: stableSketchSceneKey(scene),
    summary: {
      operationCount: draft.patchOperations.length,
      hasBaseSceneKey: Boolean(draft.patchBaseSceneKey),
      currentNodeCount: countNodesFromSceneKey(draft.patchBaseSceneKey),
      targetNodeCount: scene.nodes.length,
    },
  };
}

export function readOpenPencilPatchSummaryForScene(
  record: OpenPencilPatchSummaryRecord | undefined,
  scene: SketchSceneDocument | null | undefined,
): SketchPatchVersionSummary | undefined {
  if (!record || !scene) return undefined;
  return stableSketchSceneKey(scene) === record.sceneKey
    ? record.summary
    : undefined;
}

function stableSketchSceneKey(scene: SketchSceneDocument): string {
  return JSON.stringify(sortJsonValue(scene));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = sortJsonValue((value as Record<string, unknown>)[key]);
      return output;
    }, {});
}

function countNodesFromSceneKey(sceneKey: string | undefined): number | undefined {
  if (!sceneKey) return undefined;

  try {
    const parsed = JSON.parse(sceneKey) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const nodes = (parsed as { nodes?: unknown }).nodes;
    return Array.isArray(nodes) ? nodes.length : undefined;
  } catch {
    return undefined;
  }
}
