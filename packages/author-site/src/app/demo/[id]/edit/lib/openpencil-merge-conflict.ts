import type {
  SketchSceneDocument,
  SketchSceneNode,
  SketchScenePatchOperation,
} from "@workbench/shared";
import { validateSketchSceneDocument } from "@workbench/shared";

export type OpenPencilMergeFieldConflictDetail = {
  field: string;
  baseValue: string;
  latestValue: string;
  draftValue?: string;
};

export type OpenPencilMergeFieldConflict = {
  nodeId: string;
  fields: string[];
  details: OpenPencilMergeFieldConflictDetail[];
};

export type OpenPencilMergeOperationConflictReason =
  | "missing-node"
  | "duplicate-node"
  | "same-field-change"
  | "empty-node-list";

export type OpenPencilMergeOperationConflict = {
  operationIndex: number;
  operationType: SketchScenePatchOperation["op"];
  affectedNodeIds: string[];
  reasons: OpenPencilMergeOperationConflictReason[];
  fields: string[];
};

export type OpenPencilMergeConflictSummary = {
  operationCount: number;
  affectedNodeIds: string[];
  missingNodeIds: string[];
  duplicateNodeIds: string[];
  fieldConflicts: OpenPencilMergeFieldConflict[];
  operationConflicts: OpenPencilMergeOperationConflict[];
  incompatibleOperationCount: number;
  latestNodeCount: number;
};

export type OpenPencilMergeConflictResolutionMode =
  | "strict"
  | "skip-conflicting-operations"
  | "skip-selected-operations"
  | "override-selected-field-conflicts";

export type OpenPencilFilteredMergeOperations = {
  operations: SketchScenePatchOperation[];
  skippedOperationIndices: number[];
  skippedAffectedNodeIds: string[];
};

export type OpenPencilMergeConflictError = Error & {
  openPencilMergeConflictSummary: OpenPencilMergeConflictSummary;
};

export function getOpenPencilMergeFieldConflictKey(
  nodeId: string,
  field: string,
): string {
  return `${nodeId}.${field}`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function duplicated(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return Array.from(duplicates);
}

function stableValueString(value: unknown): string {
  if (typeof value === "undefined") return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableValueString(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableValueString(record[key])}`)
    .join(",")}}`;
}

function previewFieldValue(value: unknown): string {
  if (typeof value === "undefined") return "未设置";
  const stableValue = stableValueString(value);
  if (stableValue.length <= 80) return stableValue;
  return `${stableValue.slice(0, 77)}...`;
}

function readNodeFieldValue(node: SketchSceneNode, fieldPath: string): unknown {
  let current: unknown = node;
  for (const segment of fieldPath.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getChangedNodeFields(
  baseNode: SketchSceneNode,
  latestNode: SketchSceneNode,
): string[] {
  const fields = new Set([
    ...Object.keys(baseNode as unknown as Record<string, unknown>),
    ...Object.keys(latestNode as unknown as Record<string, unknown>),
  ]);
  fields.delete("id");
  return uniqueSorted(
    Array.from(fields).filter(
      (field) =>
        stableValueString(readNodeFieldValue(baseNode, field)) !==
        stableValueString(readNodeFieldValue(latestNode, field)),
    ),
  );
}

export function getOpenPencilPatchOperationAffectedNodeIds(
  operation: SketchScenePatchOperation,
): string[] {
  if (operation.op === "add") return [operation.node.id];
  if (operation.op === "update" || operation.op === "delete") return [operation.nodeId];
  if (operation.op === "duplicate") return [operation.nodeId, operation.newNodeId];
  if (operation.op === "reorder" || operation.op === "set-locked" || operation.op === "set-visible") {
    return operation.nodeIds;
  }
  if (operation.op === "group") return [...operation.nodeIds, operation.groupId];
  if (operation.op === "ungroup") return [operation.groupId];
  return [operation.nodeId];
}

function createOperationConflict(
  operation: SketchScenePatchOperation,
  operationIndex: number,
  reasons: Set<OpenPencilMergeOperationConflictReason>,
  fields: Set<string>,
): OpenPencilMergeOperationConflict | null {
  if (reasons.size === 0) return null;
  return {
    operationIndex,
    operationType: operation.op,
    affectedNodeIds: uniqueSorted(getOpenPencilPatchOperationAffectedNodeIds(operation)),
    reasons: Array.from(reasons).sort((left, right) => left.localeCompare(right)),
    fields: uniqueSorted(Array.from(fields)),
  };
}

function appendFieldConflict(
  fieldConflictsByNodeId: Map<string, Set<string>>,
  fieldConflictDetailsByKey: Map<string, OpenPencilMergeFieldConflictDetail>,
  nodeId: string,
  details: OpenPencilMergeFieldConflictDetail[],
) {
  if (details.length === 0) return;
  const conflictFields = fieldConflictsByNodeId.get(nodeId) ?? new Set<string>();
  for (const detail of details) {
    conflictFields.add(detail.field);
    fieldConflictDetailsByKey.set(`${nodeId}\u0000${detail.field}`, detail);
  }
  fieldConflictsByNodeId.set(nodeId, conflictFields);
}

function buildFieldConflictDetails(
  baseNode: SketchSceneNode,
  latestNode: SketchSceneNode,
  fieldPaths: string[],
  draftValues: Map<string, unknown>,
): OpenPencilMergeFieldConflictDetail[] {
  return fieldPaths
    .filter((fieldPath) => {
      const latestValue = readNodeFieldValue(latestNode, fieldPath);
      const latestValueString = stableValueString(latestValue);
      if (
        stableValueString(readNodeFieldValue(baseNode, fieldPath)) ===
        latestValueString
      ) {
        return false;
      }
      return (
        !draftValues.has(fieldPath) ||
        stableValueString(draftValues.get(fieldPath)) !== latestValueString
      );
    })
    .map((fieldPath) => ({
      field: fieldPath,
      baseValue: previewFieldValue(readNodeFieldValue(baseNode, fieldPath)),
      latestValue: previewFieldValue(readNodeFieldValue(latestNode, fieldPath)),
      draftValue: draftValues.has(fieldPath)
        ? previewFieldValue(draftValues.get(fieldPath))
        : undefined,
    }));
}

export function parseOpenPencilPatchBaseSceneKey(
  patchBaseSceneKey?: string,
): SketchSceneDocument | null {
  if (!patchBaseSceneKey) return null;
  try {
    const parsed: unknown = JSON.parse(patchBaseSceneKey);
    if (parsed === null || typeof parsed !== "object") return null;
    const scene = parsed as SketchSceneDocument;
    return validateSketchSceneDocument(scene).valid ? scene : null;
  } catch {
    return null;
  }
}

export function buildOpenPencilPatchMergeConflictSummary(
  latestScene: SketchSceneDocument,
  operations: SketchScenePatchOperation[],
  options?: {
    baseScene?: SketchSceneDocument | null;
    ignoredFieldConflictKeys?: string[];
  },
): OpenPencilMergeConflictSummary {
  const currentIds = new Set(latestScene.nodes.map((node) => node.id));
  const latestNodesById = new Map(latestScene.nodes.map((node) => [node.id, node]));
  const baseNodesById = new Map(
    (options?.baseScene?.nodes ?? []).map((node) => [node.id, node]),
  );
  const affectedNodeIds: string[] = [];
  const missingNodeIds: string[] = [];
  const duplicateNodeIds: string[] = [];
  const fieldConflictsByNodeId = new Map<string, Set<string>>();
  const fieldConflictDetailsByKey =
    new Map<string, OpenPencilMergeFieldConflictDetail>();
  const ignoredFieldConflictKeys = new Set(options?.ignoredFieldConflictKeys ?? []);
  const operationConflicts: OpenPencilMergeOperationConflict[] = [];
  let incompatibleOperationCount = 0;

  const markExistingNodeIds = (nodeIds: string[]): boolean => {
    let hasConflict = false;
    for (const nodeId of nodeIds) {
      affectedNodeIds.push(nodeId);
      if (!currentIds.has(nodeId)) {
        missingNodeIds.push(nodeId);
        hasConflict = true;
      }
    }
    return hasConflict;
  };

  const markUniqueNodeIds = (nodeIds: string[]): boolean => {
    const duplicatedNodeIds = duplicated(nodeIds);
    duplicateNodeIds.push(...duplicatedNodeIds);
    return duplicatedNodeIds.length > 0;
  };

  const markChangedFields = (
    nodeIds: string[],
    draftValues: Map<string, unknown>,
  ): string[] => {
    const changedFieldPaths: string[] = [];
    if (!options?.baseScene) return changedFieldPaths;
    for (const nodeId of nodeIds) {
      const baseNode = baseNodesById.get(nodeId);
      const latestNode = latestNodesById.get(nodeId);
      if (!baseNode || !latestNode) continue;
      const details = buildFieldConflictDetails(
        baseNode,
        latestNode,
        Array.from(draftValues.keys()),
        draftValues,
      ).filter(
        (detail) =>
          !ignoredFieldConflictKeys.has(
            getOpenPencilMergeFieldConflictKey(nodeId, detail.field),
          ),
      );
      if (details.length > 0) {
        appendFieldConflict(
          fieldConflictsByNodeId,
          fieldConflictDetailsByKey,
          nodeId,
          details,
        );
        changedFieldPaths.push(
          ...details.map((detail) =>
            getOpenPencilMergeFieldConflictKey(nodeId, detail.field),
          ),
        );
      }
    }
    return changedFieldPaths;
  };

  for (const [operationIndex, operation] of operations.entries()) {
    let operationHasConflict = false;
    const operationReasons = new Set<OpenPencilMergeOperationConflictReason>();
    const operationFields = new Set<string>();
    if (operation.op === "add") {
      affectedNodeIds.push(operation.node.id);
      if (currentIds.has(operation.node.id)) {
        duplicateNodeIds.push(operation.node.id);
        operationHasConflict = true;
        operationReasons.add("duplicate-node");
      }
    } else if (operation.op === "update") {
      operationHasConflict = markExistingNodeIds([operation.nodeId]);
      if (operationHasConflict) operationReasons.add("missing-node");
      const draftValues = new Map(
        Object.entries(operation.patch).map(([field, value]) => [field, value]),
      );
      const changedSameFields = markChangedFields([operation.nodeId], draftValues);
      if (changedSameFields.length > 0) {
        operationReasons.add("same-field-change");
        for (const field of changedSameFields) operationFields.add(field);
      }
      operationHasConflict = operationHasConflict || changedSameFields.length > 0;
    } else if (operation.op === "delete") {
      operationHasConflict = markExistingNodeIds([operation.nodeId]);
      if (operationHasConflict) operationReasons.add("missing-node");
      const baseNode = baseNodesById.get(operation.nodeId);
      const latestNode = latestNodesById.get(operation.nodeId);
      if (options?.baseScene && baseNode && latestNode) {
        const changedFields = getChangedNodeFields(baseNode, latestNode);
        const details = buildFieldConflictDetails(
          baseNode,
          latestNode,
          changedFields,
          new Map(changedFields.map((field) => [field, "删除节点"])),
        );
        appendFieldConflict(
          fieldConflictsByNodeId,
          fieldConflictDetailsByKey,
          operation.nodeId,
          details,
        );
        if (details.length > 0) {
          operationReasons.add("same-field-change");
          for (const detail of details) operationFields.add(`${operation.nodeId}.${detail.field}`);
        }
        operationHasConflict = operationHasConflict || details.length > 0;
      }
    } else if (operation.op === "duplicate") {
      operationHasConflict = markExistingNodeIds([operation.nodeId]);
      if (operationHasConflict) operationReasons.add("missing-node");
      if (currentIds.has(operation.newNodeId)) {
        duplicateNodeIds.push(operation.newNodeId);
        operationHasConflict = true;
        operationReasons.add("duplicate-node");
      }
      affectedNodeIds.push(operation.newNodeId);
    } else if (operation.op === "reorder") {
      const hasDuplicateNodes = markUniqueNodeIds(operation.nodeIds);
      const hasMissingNodes = markExistingNodeIds(operation.nodeIds);
      if (operation.nodeIds.length === 0) operationReasons.add("empty-node-list");
      if (hasDuplicateNodes) operationReasons.add("duplicate-node");
      if (hasMissingNodes) operationReasons.add("missing-node");
      operationHasConflict =
        operation.nodeIds.length === 0 ||
        hasDuplicateNodes ||
        hasMissingNodes;
    } else if (operation.op === "group") {
      const hasDuplicateNodes = markUniqueNodeIds(operation.nodeIds);
      const hasMissingNodes = markExistingNodeIds(operation.nodeIds);
      if (operation.nodeIds.length === 0) operationReasons.add("empty-node-list");
      if (hasDuplicateNodes) operationReasons.add("duplicate-node");
      if (hasMissingNodes) operationReasons.add("missing-node");
      operationHasConflict =
        operation.nodeIds.length === 0 ||
        hasDuplicateNodes ||
        hasMissingNodes;
      if (currentIds.has(operation.groupId)) {
        duplicateNodeIds.push(operation.groupId);
        operationHasConflict = true;
        operationReasons.add("duplicate-node");
      }
      affectedNodeIds.push(operation.groupId);
    } else if (operation.op === "ungroup") {
      operationHasConflict = markExistingNodeIds([operation.groupId]);
      if (operationHasConflict) operationReasons.add("missing-node");
    } else if (operation.op === "set-locked") {
      const hasDuplicateNodes = markUniqueNodeIds(operation.nodeIds);
      const hasMissingNodes = markExistingNodeIds(operation.nodeIds);
      const changedFields = markChangedFields(
        operation.nodeIds,
        new Map([["locked", operation.locked]]),
      );
      if (operation.nodeIds.length === 0) operationReasons.add("empty-node-list");
      if (hasDuplicateNodes) operationReasons.add("duplicate-node");
      if (hasMissingNodes) operationReasons.add("missing-node");
      if (changedFields.length > 0) {
        operationReasons.add("same-field-change");
        for (const field of changedFields) operationFields.add(field);
      }
      operationHasConflict =
        operation.nodeIds.length === 0 ||
        hasDuplicateNodes ||
        hasMissingNodes ||
        changedFields.length > 0;
    } else if (operation.op === "set-visible") {
      const hasDuplicateNodes = markUniqueNodeIds(operation.nodeIds);
      const hasMissingNodes = markExistingNodeIds(operation.nodeIds);
      const changedFields = markChangedFields(
        operation.nodeIds,
        new Map([["visible", operation.visible]]),
      );
      if (operation.nodeIds.length === 0) operationReasons.add("empty-node-list");
      if (hasDuplicateNodes) operationReasons.add("duplicate-node");
      if (hasMissingNodes) operationReasons.add("missing-node");
      if (changedFields.length > 0) {
        operationReasons.add("same-field-change");
        for (const field of changedFields) operationFields.add(field);
      }
      operationHasConflict =
        operation.nodeIds.length === 0 ||
        hasDuplicateNodes ||
        hasMissingNodes ||
        changedFields.length > 0;
    } else if (operation.op === "bind" || operation.op === "unbind") {
      const hasMissingNode = markExistingNodeIds([operation.nodeId]);
      operationHasConflict = hasMissingNode;
      if (hasMissingNode) operationReasons.add("missing-node");
      const changedFields = markChangedFields(
        [operation.nodeId],
        new Map([
          [
            `bindings.${operation.property}`,
            operation.op === "bind" ? operation.field : undefined,
          ],
        ]),
      );
      operationHasConflict = operationHasConflict || changedFields.length > 0;
      if (changedFields.length > 0) {
        operationReasons.add("same-field-change");
        for (const field of changedFields) operationFields.add(field);
      }
    }

    const operationConflict = createOperationConflict(
      operation,
      operationIndex,
      operationReasons,
      operationFields,
    );
    if (operationConflict) operationConflicts.push(operationConflict);
    if (operationHasConflict) incompatibleOperationCount += 1;
  }

  return {
    operationCount: operations.length,
    affectedNodeIds: uniqueSorted(affectedNodeIds),
    missingNodeIds: uniqueSorted(missingNodeIds),
    duplicateNodeIds: uniqueSorted(duplicateNodeIds),
    fieldConflicts: Array.from(fieldConflictsByNodeId.entries())
      .map(([nodeId, fields]) => ({
        nodeId,
        fields: uniqueSorted(Array.from(fields)),
        details: uniqueSorted(Array.from(fields))
          .map((field) => fieldConflictDetailsByKey.get(`${nodeId}\u0000${field}`))
          .filter((detail): detail is OpenPencilMergeFieldConflictDetail => Boolean(detail)),
      }))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    operationConflicts,
    incompatibleOperationCount,
    latestNodeCount: latestScene.nodes.length,
  };
}

export function hasOpenPencilPatchMergeConflicts(
  summary: OpenPencilMergeConflictSummary,
): boolean {
  return (
    summary.incompatibleOperationCount > 0 ||
    summary.missingNodeIds.length > 0 ||
    summary.duplicateNodeIds.length > 0 ||
    summary.fieldConflicts.length > 0
  );
}

export function filterOpenPencilPatchOperationsForMergeResolution(
  operations: SketchScenePatchOperation[],
  summary: OpenPencilMergeConflictSummary,
  mode: OpenPencilMergeConflictResolutionMode,
  options?: {
    skipOperationIndices?: number[];
  },
): OpenPencilFilteredMergeOperations {
  if (
    mode === "strict" ||
    mode === "override-selected-field-conflicts" ||
    summary.operationConflicts.length === 0
  ) {
    return {
      operations,
      skippedOperationIndices: [],
      skippedAffectedNodeIds: [],
    };
  }

  const summaryConflictIndices = new Set(
    summary.operationConflicts.map((conflict) => conflict.operationIndex),
  );
  const directSkippedOperationIndices = mode === "skip-selected-operations"
    ? new Set(
        (options?.skipOperationIndices ?? []).filter((operationIndex) =>
          summaryConflictIndices.has(operationIndex),
        ),
      )
    : summaryConflictIndices;
  const skippedNodeIds = new Set(
    summary.operationConflicts
      .filter((conflict) => directSkippedOperationIndices.has(conflict.operationIndex))
      .flatMap((conflict) => conflict.affectedNodeIds),
  );
  const skippedOperationIndices: number[] = [];
  const skippedAffectedNodeIds = new Set<string>();
  const filteredOperations: SketchScenePatchOperation[] = [];

  operations.forEach((operation, operationIndex) => {
    const affectedNodeIds = getOpenPencilPatchOperationAffectedNodeIds(operation);
    const touchesSkippedNode = affectedNodeIds.some((nodeId) =>
      skippedNodeIds.has(nodeId),
    );
    if (directSkippedOperationIndices.has(operationIndex) || touchesSkippedNode) {
      skippedOperationIndices.push(operationIndex);
      affectedNodeIds.forEach((nodeId) => skippedAffectedNodeIds.add(nodeId));
      return;
    }
    filteredOperations.push(operation);
  });

  return {
    operations: filteredOperations,
    skippedOperationIndices,
    skippedAffectedNodeIds: uniqueSorted(Array.from(skippedAffectedNodeIds)),
  };
}

export function createOpenPencilMergeConflictError(
  message: string,
  summary: OpenPencilMergeConflictSummary,
): OpenPencilMergeConflictError {
  return Object.assign(new Error(message), {
    openPencilMergeConflictSummary: summary,
  });
}

export function getOpenPencilMergeConflictSummary(
  value: unknown,
): OpenPencilMergeConflictSummary | null {
  if (!(value instanceof Error)) return null;
  const summary = (value as Partial<OpenPencilMergeConflictError>)
    .openPencilMergeConflictSummary;
  if (!summary) return null;
  return summary;
}
