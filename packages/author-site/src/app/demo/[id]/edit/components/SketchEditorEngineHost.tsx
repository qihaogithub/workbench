"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SketchEditorCanvas,
  SketchEditorToolbar,
  SketchLayerPanel,
  SketchPropertyPanel,
  useSketchEditorState,
  type SketchEditorController,
} from "@workbench/sketch-react";
import type {
  SketchSceneDocument,
  SketchScenePatchOperation,
} from "@workbench/shared";
import type { PreviewSize } from "@workbench/demo-ui";

import type { SketchEditorEngine } from "@/lib/sketch-editor-engine";
import {
  OpenPencilInspectorPanel,
  OpenPencilLayerDrawer,
  OpenPencilSpikeFrame,
  type OpenPencilHostCommand,
  type OpenPencilImageProxyDiagnosticContext,
  type OpenPencilSelectCommand,
  type OpenPencilUiState,
} from "./OpenPencilSpikeFrame";

export type SketchEditorEngineHostCommitDraft = {
  patchBaseSceneKey?: string;
  patchOperations?: SketchScenePatchOperation[];
};

export type SketchEditorEngineHost = {
  engine: SketchEditorEngine | null;
  nativeController: SketchEditorController;
  openPencilUiState: OpenPencilUiState | null;
  openPencilSelectCommand: OpenPencilSelectCommand | null;
  openPencilHostCommand: OpenPencilHostCommand | null;
  setOpenPencilUiState: (state: OpenPencilUiState | null) => void;
  selectOpenPencilLayer: (nodeId: string) => void;
  updateOpenPencilNode: (
    nodeId: string,
    changes: Extract<
      OpenPencilHostCommand,
      { type: "update-node" | "update-node-style" }
    >["changes"],
  ) => void;
  runOpenPencilCommand: (
    type: Extract<
      OpenPencilHostCommand,
      {
        type:
          | "duplicate-selection"
          | "delete-selection"
          | "undo"
          | "redo"
          | "group-selection"
          | "ungroup-selection"
          | "zoom-to-selection";
      }
    >["type"],
  ) => void;
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
  const [openPencilUiState, setOpenPencilUiState] =
    useState<OpenPencilUiState | null>(null);
  const [openPencilSelectCommand, setOpenPencilSelectCommand] =
    useState<OpenPencilSelectCommand | null>(null);
  const [openPencilHostCommand, setOpenPencilHostCommand] =
    useState<OpenPencilHostCommand | null>(null);

  useEffect(() => {
    if (input.engine === "openpencil") return;
    setOpenPencilUiState(null);
    setOpenPencilSelectCommand(null);
    setOpenPencilHostCommand(null);
  }, [input.engine]);

  const selectOpenPencilLayer = useCallback((nodeId: string) => {
    setOpenPencilSelectCommand({
      nodeId,
      requestId: Date.now(),
    });
  }, []);

  const updateOpenPencilNode = useCallback(
    (
      nodeId: string,
      changes: Extract<
        OpenPencilHostCommand,
        { type: "update-node" | "update-node-style" }
      >["changes"],
    ) => {
      setOpenPencilHostCommand({
        type: "update-node",
        nodeId,
        changes,
        requestId: Date.now(),
      });
    },
    [],
  );

  const runOpenPencilCommand = useCallback(
    (
      type: Extract<
        OpenPencilHostCommand,
        {
          type:
            | "duplicate-selection"
            | "delete-selection"
            | "undo"
            | "redo"
            | "group-selection"
            | "ungroup-selection"
            | "zoom-to-selection";
        }
      >["type"],
    ) => {
      setOpenPencilHostCommand({
        type,
        requestId: Date.now(),
      });
    },
    [],
  );

  return {
    engine: input.engine,
    nativeController,
    openPencilUiState,
    openPencilSelectCommand,
    openPencilHostCommand,
    setOpenPencilUiState,
    selectOpenPencilLayer,
    updateOpenPencilNode,
    runOpenPencilCommand,
  };
}

export function SketchEditorEngineStage({
  host,
  editorUrl,
  pageId,
  pageName,
  scene,
  configData,
  previewSize,
  onOpenPencilSceneCommit,
  onOpenPencilMergeLatestSceneWithDraft,
  imageProxyDiagnosticContext,
  onOpenPencilReloadLatestScene,
}: {
  host: SketchEditorEngineHost;
  editorUrl: string;
  pageId: string;
  pageName?: string;
  scene: SketchSceneDocument;
  configData: Record<string, unknown>;
  previewSize?: PreviewSize;
  onOpenPencilSceneCommit?: (
    scene: SketchSceneDocument,
    draft?: SketchEditorEngineHostCommitDraft,
  ) => Promise<void> | void;
  onOpenPencilMergeLatestSceneWithDraft?: (
    draft: SketchEditorEngineHostCommitDraft,
  ) => Promise<SketchSceneDocument | void> | SketchSceneDocument | void;
  imageProxyDiagnosticContext?: OpenPencilImageProxyDiagnosticContext;
  onOpenPencilReloadLatestScene?: () => Promise<void> | void;
}) {
  if (host.engine === "openpencil") {
    return (
      <OpenPencilSpikeFrame
        editorUrl={editorUrl}
        pageId={pageId}
        pageName={pageName}
        scene={scene}
        configData={configData}
        previewSize={previewSize}
        onSceneCommit={onOpenPencilSceneCommit}
        onUiStateChange={host.setOpenPencilUiState}
        selectCommand={host.openPencilSelectCommand}
        command={host.openPencilHostCommand}
        imageProxyDiagnosticContext={imageProxyDiagnosticContext}
        onReloadLatestScene={onOpenPencilReloadLatestScene}
        onMergeLatestSceneWithDraft={onOpenPencilMergeLatestSceneWithDraft}
      />
    );
  }

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
  if (host.engine === "openpencil") {
    return (
      <OpenPencilLayerDrawer
        state={host.openPencilUiState}
        onSelectLayer={host.selectOpenPencilLayer}
      />
    );
  }

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
  if (host.engine === "openpencil") {
    return (
      <OpenPencilInspectorPanel
        state={host.openPencilUiState}
        onUpdateNode={host.updateOpenPencilNode}
        onCommand={host.runOpenPencilCommand}
      />
    );
  }

  return (
    <SketchPropertyPanel
      scene={scene}
      controller={host.nativeController}
    />
  );
}
