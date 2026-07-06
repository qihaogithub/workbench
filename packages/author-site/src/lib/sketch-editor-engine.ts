import type { SketchEditorEnginePreference } from "@workbench/shared";

export type SketchEditorEngine = "native" | "openpencil";

export type ResolveSketchEditorEngineInput = {
  openPencilEnabled: boolean;
  enginePreference?: SketchEditorEnginePreference;
  userEnginePreference?: SketchEditorEnginePreference;
  previewMode: "single" | "canvas";
  runtimeType?: string;
  sketchEditing: boolean;
  viewingDocument: boolean;
};

export function resolveSketchEditorEngine({
  openPencilEnabled,
  enginePreference,
  userEnginePreference,
  previewMode,
  runtimeType,
  sketchEditing,
  viewingDocument,
}: ResolveSketchEditorEngineInput): SketchEditorEngine | null {
  if (
    previewMode !== "single" ||
    runtimeType !== "sketch-scene" ||
    !sketchEditing ||
    viewingDocument
  ) {
    return null;
  }

  const preferredEngine = enginePreference ?? userEnginePreference;
  if (preferredEngine === "native") return "native";
  if (preferredEngine === "openpencil") {
    return openPencilEnabled ? "openpencil" : "native";
  }
  return openPencilEnabled ? "openpencil" : "native";
}
