"use client";

import React from "react";
import type { SketchSceneDocument } from "@workbench/sketch-core";
import { SketchEditorSurface } from "@workbench/sketch-react";
import type { SketchImageGenerationAdapter } from "@workbench/sketch-react";

const EMPTY_WHITEBOARD: SketchSceneDocument = {
  version: 1,
  pageSize: { width: 1440, height: 900 },
  nodes: [],
  assets: [],
  bindings: {},
};

export function SketchPlaygroundApp() {
  const [scene, setScene] = React.useState<SketchSceneDocument>(EMPTY_WHITEBOARD);
  const imageGeneration = React.useMemo<SketchImageGenerationAdapter>(
    () => ({
      getCapabilities: () => ({
        enabled: true,
        modelId: "studio-mock",
        qualities: [
          { id: "auto", label: "自动" },
          { id: "low", label: "低" },
          { id: "medium", label: "中" },
          { id: "high", label: "高" },
        ],
        sizes: [
          { id: "1024x1024", label: "1:1", width: 1024, height: 1024 },
          { id: "1536x1024", label: "3:2", width: 1536, height: 1024 },
          { id: "1024x1536", label: "2:3", width: 1024, height: 1536 },
        ],
        maxImages: 4,
        maxReferences: 4,
        supportsReferences: true,
        allowCustomSize: false,
        maxPromptLength: 4_000,
      }),
      generate: (request, signal) =>
        new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => {
            if (signal.aborted) return;
            const ratio = request.sizeId === "1024x1536" ? 2 / 3 : request.sizeId === "1024x1024" ? 1 : 3 / 2;
            resolve(
              Array.from({ length: request.count }, (_, index) => ({
                id: `mock-${Date.now()}-${index}`,
                width: 640,
                height: Math.round(640 / ratio),
                src: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${Math.round(640 / ratio)}"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect width="640" height="${Math.round(640 / ratio)}" fill="url(#g)"/><circle cx="${180 + index * 90}" cy="${Math.round(210 / ratio)}" r="90" fill="white" opacity=".28"/><text x="32" y="${Math.round(560 / ratio)}" font-family="sans-serif" font-size="30" fill="white">${request.prompt.slice(0, 24)}</text></svg>`)}`,
                alt: "Mock AI 图片",
              })),
            );
          }, 700);
          signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timer);
              reject(new DOMException("已取消", "AbortError"));
            },
            { once: true },
          );
        }),
    }),
    [],
  );

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
        imageGeneration={imageGeneration}
      />
    </main>
  );
}
