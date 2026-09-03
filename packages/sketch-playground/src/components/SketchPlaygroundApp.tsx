"use client";

import React from "react";
import type { SketchSceneDocument } from "@workbench/sketch-core";
import { SketchEditorSurface } from "@workbench/sketch-react";

const EMPTY_WHITEBOARD: SketchSceneDocument = {
  version: 1,
  pageSize: { width: 1440, height: 900 },
  nodes: [],
  assets: [],
  bindings: {},
};

export function SketchPlaygroundApp() {
  const [scene, setScene] = React.useState<SketchSceneDocument>(EMPTY_WHITEBOARD);

  return (
    <main className="relative h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute left-5 top-5 z-10 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur">
        Whiteboard
      </div>
      <SketchEditorSurface
        scene={scene}
        profile="whiteboard"
        fillContainer
        className="h-full"
        onSceneChange={setScene}
      />
    </main>
  );
}
