"use client";

import { createContext, useContext, type ReactNode } from "react";
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

const SketchEditorEngineContext = createContext<SketchEditorEngineHost | null>(
  null,
);

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

export function SketchEditorEngineProvider({
  engine,
  scene,
  onSceneChange,
  children,
}: {
  engine: SketchEditorEngine;
  scene: SketchSceneDocument;
  onSceneChange: (scene: SketchSceneDocument) => void;
  children: ReactNode;
}) {
  const host = useSketchEditorEngineHost({ engine, scene, onSceneChange });
  return (
    <SketchEditorEngineContext.Provider value={host}>
      {children}
    </SketchEditorEngineContext.Provider>
  );
}

function useSketchEditorEngineContext(): SketchEditorEngineHost {
  const host = useContext(SketchEditorEngineContext);
  if (!host) {
    throw new Error("Sketch editor controls must be rendered inside its provider");
  }
  return host;
}

export function SketchEditorEngineStage({
  scene,
  configData,
  previewSize,
}: {
  scene: SketchSceneDocument;
  configData: Record<string, unknown>;
  previewSize?: PreviewSize;
}) {
  const host = useSketchEditorEngineContext();
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
  scene,
}: {
  scene: SketchSceneDocument;
}) {
  const host = useSketchEditorEngineContext();
  if (host.engine !== "native") return null;
  return (
    <SketchEditorToolbar
      scene={scene}
      controller={host.nativeController}
    />
  );
}

export function SketchEditorEngineLayerPanel({
  scene,
}: {
  scene: SketchSceneDocument;
}) {
  const host = useSketchEditorEngineContext();
  return (
    <SketchLayerPanel
      scene={scene}
      controller={host.nativeController}
      className="h-full rounded-none border-0 bg-transparent"
    />
  );
}

export function SketchEditorEngineInspectorPanel({
  scene,
}: {
  scene: SketchSceneDocument;
}) {
  const host = useSketchEditorEngineContext();
  return (
    <SketchPropertyPanel
      scene={scene}
      controller={host.nativeController}
    />
  );
}
