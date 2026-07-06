"use client";

import {
  SketchEditorCanvas,
  SketchEditorToolbar,
  SketchLayerPanel,
  SketchPropertyPanel,
  useSketchEditorState,
  type SketchEditorController,
} from "@workbench/sketch-react";
import type { SketchSceneDocument } from "@workbench/shared";
import type { PreviewSize } from "@workbench/demo-ui";

import type { SketchEditorEngine } from "@/lib/sketch-editor-engine";

export type SketchEditorEngineHost = {
  engine: SketchEditorEngine | null;
  nativeController: SketchEditorController;
};

export function useSketchEditorEngineHost(input: {
  engine: SketchEditorEngine | null;
  scene: SketchSceneDocument;
  onSceneChange: (scene: SketchSceneDocument) => void;
}): SketchEditorEngineHost {
  const nativeController = useSketchEditorState(
    input.scene,
    input.onSceneChange,
  );

  return {
    engine: input.engine,
    nativeController,
  };
}

export function SketchEditorEngineStage({
  host,
  scene,
  configData,
  previewSize,
}: {
  host: SketchEditorEngineHost;
  scene: SketchSceneDocument;
  configData: Record<string, unknown>;
  previewSize?: PreviewSize;
}) {
  return (
    <SketchEditorCanvas
      scene={scene}
      controller={host.nativeController}
      configData={configData}
      previewSize={previewSize}
      fillContainer
    />
  );
}

export function SketchEditorEngineToolbar({
  host,
  scene,
}: {
  host: SketchEditorEngineHost;
  scene: SketchSceneDocument;
}) {
  if (host.engine !== "native") return null;
  return (
    <SketchEditorToolbar
      scene={scene}
      controller={host.nativeController}
    />
  );
}

export function SketchEditorEngineLayerPanel({
  host,
  scene,
}: {
  host: SketchEditorEngineHost;
  scene: SketchSceneDocument;
}) {
  return (
    <SketchLayerPanel
      scene={scene}
      controller={host.nativeController}
      className="h-full rounded-none border-0 bg-transparent"
    />
  );
}

export function SketchEditorEngineInspectorPanel({
  host,
  scene,
}: {
  host: SketchEditorEngineHost;
  scene: SketchSceneDocument;
}) {
  return (
    <SketchPropertyPanel
      scene={scene}
      controller={host.nativeController}
    />
  );
}
