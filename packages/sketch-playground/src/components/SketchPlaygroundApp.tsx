"use client";

import React from "react";
import {
  getSketchSceneHashSource,
  getSketchSelectionBounds,
  hitTestSketchScene,
  parseSketchSceneDocument,
  renderSketchSceneToSvgMarkup,
  translateSketchNodes,
  validateSketchSceneDocument,
  type SketchSceneDocument,
  type SketchSceneNode,
} from "@workbench/sketch-core";
import {
  SketchEditorCanvas,
  SketchEditorToolbar,
  SketchLayerPanel,
  SketchPropertyPanel,
  useSketchEditorState,
} from "@workbench/sketch-react";
import { sketchFixtures } from "../fixtures/sketch-fixtures";

type DevPanelTab = "scene" | "config" | "metrics" | "debug";

type PerformanceRow = {
  count: number;
  renderMs: number;
  selectionMs: number;
  propertyPanelMs: number;
  hitTestMs: number;
  dragMs: number;
  inputMs: number;
  translateMs: number;
  pathRenderMs: number;
  hashLength: number;
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function createPerformanceScene(count: number): SketchSceneDocument {
  return {
    version: 1,
    pageSize: { width: 960, height: 640 },
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `perf-${index}`,
      type: index % 5 === 0 ? "text" : "card",
      x: 32 + (index % 10) * 88,
      y: 48 + Math.floor(index / 10) * 70,
      width: index % 5 === 0 ? 120 : 76,
      height: index % 5 === 0 ? 32 : 48,
      text: `N${index + 1}`,
      style: {
        fill: index % 2 ? "#f8fafc" : "#ffffff",
        stroke: "#94a3b8",
        color: "#0f172a",
        radius: 8,
      },
    })),
    assets: [],
    bindings: {},
  };
}

function createPerformancePathScene(count: number): SketchSceneDocument {
  return {
    version: 1,
    pageSize: { width: 960, height: 640 },
    nodes: Array.from({ length: count }, (_, index) => {
      const x = 24 + (index % 20) * 44;
      const y = 32 + Math.floor(index / 20) * 24;
      return {
        id: `perf-path-${index}`,
        type: "path",
        x,
        y,
        width: 32,
        height: 12,
        path: `M ${x} ${y + 6} L ${x + 8} ${y} L ${x + 16} ${y + 12} L ${x + 24} ${y + 2} L ${x + 32} ${y + 6}`,
        points: [
          { x, y: y + 6 },
          { x: x + 8, y },
          { x: x + 16, y: y + 12 },
          { x: x + 24, y: y + 2 },
          { x: x + 32, y: y + 6 },
        ],
        style: {
          fill: "transparent",
          stroke: "#0f172a",
          strokeWidth: 2,
        },
      } satisfies SketchSceneNode;
    }),
    assets: [],
    bindings: {},
  };
}

function summarizeSceneChange(previous: SketchSceneDocument, next: SketchSceneDocument): string {
  const previousById = new Map(previous.nodes.map((node) => [node.id, node]));
  const nextById = new Map(next.nodes.map((node) => [node.id, node]));
  const added = next.nodes.filter((node) => !previousById.has(node.id)).map((node) => node.id);
  const deleted = previous.nodes.filter((node) => !nextById.has(node.id)).map((node) => node.id);
  const updated = next.nodes
    .filter((node) => {
      const previousNode = previousById.get(node.id);
      return previousNode ? JSON.stringify(previousNode) !== JSON.stringify(node) : false;
    })
    .map((node) => node.id);
  const parts = [
    added.length ? `added ${added.slice(0, 3).join(", ")}` : "",
    deleted.length ? `deleted ${deleted.slice(0, 3).join(", ")}` : "",
    updated.length ? `updated ${updated.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No structural change";
}

function measureMs(action: () => void): number {
  const start = performance.now();
  action();
  return Number((performance.now() - start).toFixed(2));
}

export function SketchPlaygroundApp() {
  const [fixtureId, setFixtureId] = React.useState(sketchFixtures[0].id);
  const activeFixture = sketchFixtures.find((fixture) => fixture.id === fixtureId) ?? sketchFixtures[0];
  const [scene, setScene] = React.useState<SketchSceneDocument>(activeFixture.scene);
  const [sceneJson, setSceneJson] = React.useState(formatJson(activeFixture.scene));
  const [configJson, setConfigJson] = React.useState(formatJson(activeFixture.configData ?? {}));
  const [configData, setConfigData] = React.useState<Record<string, unknown>>(activeFixture.configData ?? {});
  const [message, setMessage] = React.useState("Ready");
  const [devPanelOpen, setDevPanelOpen] = React.useState(false);
  const [devPanelTab, setDevPanelTab] = React.useState<DevPanelTab>("scene");
  const [perf, setPerf] = React.useState<PerformanceRow[]>([]);
  const [lastSceneSummary, setLastSceneSummary] = React.useState("Ready");
  const initialSelectionAppliedRef = React.useRef(false);

  const validation = React.useMemo(() => validateSketchSceneDocument(scene), [scene]);
  const previewSize = React.useMemo(
    () => ({ width: scene.pageSize.width, height: scene.pageSize.height }),
    [scene.pageSize.height, scene.pageSize.width],
  );

  const updateScene = React.useCallback((nextScene: SketchSceneDocument) => {
    setScene((previousScene) => {
      setLastSceneSummary(summarizeSceneChange(previousScene, nextScene));
      return nextScene;
    });
    setSceneJson(formatJson(nextScene));
  }, []);

  const controller = useSketchEditorState(scene, updateScene, undefined, configData);

  React.useEffect(() => {
    if (initialSelectionAppliedRef.current) return;
    initialSelectionAppliedRef.current = true;
    const firstNode = scene.nodes[0];
    if (firstNode) controller.setNodeIds([firstNode.id]);
  }, [controller, scene.nodes]);

  const loadFixture = React.useCallback((id: string) => {
    const fixture = sketchFixtures.find((item) => item.id === id) ?? sketchFixtures[0];
    setFixtureId(fixture.id);
    setScene(fixture.scene);
    setSceneJson(formatJson(fixture.scene));
    setConfigData(fixture.configData ?? {});
    setConfigJson(formatJson(fixture.configData ?? {}));
    setPerf([]);
    setMessage(`Loaded ${fixture.name}`);
    setLastSceneSummary(`Loaded ${fixture.name}`);
    const firstNode = fixture.scene.nodes[0];
    controller.setNodeIds(firstNode ? [firstNode.id] : []);
  }, [controller]);

  const applySceneJson = React.useCallback(() => {
    try {
      const parsed = parseSketchSceneDocument(sceneJson);
      if (!parsed) {
        setMessage("Scene JSON parse failed");
        return;
      }
      const nextValidation = validateSketchSceneDocument(parsed);
      if (!nextValidation.valid) {
        setMessage(nextValidation.issues.map((issue) => issue.message).join("; "));
        return;
      }
      controller.commitScene(parsed);
      setSceneJson(formatJson(parsed));
      setMessage("Scene JSON applied");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scene JSON parse failed");
    }
  }, [controller, sceneJson]);

  const applyConfigJson = React.useCallback(() => {
    try {
      const parsed = parseJsonRecord(configJson);
      setConfigData(parsed);
      setMessage("Config JSON applied");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Config JSON parse failed");
    }
  }, [configJson]);

  const runPerformance = React.useCallback(() => {
    const counts = [100, 500, 1000];
    const rows = counts.map((count) => {
      const perfScene = createPerformanceScene(count);
      const pathScene = createPerformancePathScene(count);
      return {
        count,
        renderMs: measureMs(() => {
          renderSketchSceneToSvgMarkup(perfScene, {});
        }),
        selectionMs: measureMs(() => {
          for (let index = 0; index < 120; index += 1) {
            const node = perfScene.nodes[index % perfScene.nodes.length];
            if (node) getSketchSelectionBounds([node]);
          }
        }),
        propertyPanelMs: measureMs(() => {
          for (let index = 0; index < 120; index += 1) {
            const node = perfScene.nodes[index % perfScene.nodes.length];
            if (!node) continue;
            JSON.stringify({
              id: node.id,
              type: node.type,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              style: node.style,
            });
          }
        }),
        hitTestMs: measureMs(() => {
          for (let index = 0; index < 120; index += 1) {
            hitTestSketchScene(perfScene, { x: 24 + (index % 20) * 44, y: 32 + Math.floor(index / 20) * 40 });
          }
        }),
        dragMs: measureMs(() => {
          for (let index = 0; index < 60; index += 1) {
            translateSketchNodes([perfScene.nodes[index % perfScene.nodes.length]].filter(Boolean), { x: 8, y: 4 });
          }
        }),
        inputMs: measureMs(() => {
          for (let index = 0; index < 120; index += 1) {
            const node = perfScene.nodes[index % perfScene.nodes.length];
            if (node) ({ ...node, text: `${node.text ?? ""}${index}` });
          }
        }),
        translateMs: measureMs(() => {
          translateSketchNodes(perfScene.nodes, { x: 8, y: 4 });
        }),
        pathRenderMs: measureMs(() => {
          renderSketchSceneToSvgMarkup(pathScene, {});
        }),
        hashLength: getSketchSceneHashSource(perfScene).length,
      };
    });
    setPerf(rows);
    setDevPanelOpen(true);
    setDevPanelTab("metrics");
    setMessage("Performance baseline refreshed");
  }, []);

  return (
    <main className="grid h-screen grid-cols-[292px_minmax(0,1fr)_320px] grid-rows-[52px_minmax(0,1fr)] overflow-hidden bg-[#1f1f1f] text-foreground">
      <header className="col-span-3 grid grid-cols-[292px_minmax(0,1fr)_320px] border-b border-border bg-[#2b2b2b]">
        <div className="flex min-w-0 items-center gap-2 border-r border-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f45b3d] text-xs font-semibold text-white">
            S
          </div>
          <select
            aria-label="fixture"
            value={fixtureId}
            onChange={(event) => loadFixture(event.target.value)}
            className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent text-sm font-semibold text-foreground outline-none"
          >
            {sketchFixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-1">
            <button type="button" className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={() => loadFixture(fixtureId)}>
              Reset
            </button>
            <button
              type="button"
              className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(sceneJson);
                setMessage("Scene JSON copied");
              }}
            >
              Copy JSON
            </button>
            <button type="button" className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={runPerformance}>
              Performance
            </button>
            <button
              type="button"
              className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                devPanelOpen ? "bg-[#7cc7ff] text-[#111111]" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              aria-pressed={devPanelOpen}
              onClick={() => setDevPanelOpen((current) => !current)}
            >
              Dev Data
            </button>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {message} · {validation.valid ? "Valid scene" : "Invalid scene"} · {scene.nodes.length} objects
          </span>
        </div>

        <div className="flex items-center justify-between border-l border-border px-4">
          <div className="flex h-8 rounded-md border border-border bg-[#3a3a3a] p-0.5 text-sm font-semibold">
            <span className="rounded px-3 py-1 text-foreground">Design</span>
            <span className="px-3 py-1 text-muted-foreground">Inspect</span>
          </div>
          <span className="text-xs text-muted-foreground">71%</span>
        </div>
      </header>

      <aside className="min-h-0 border-r border-border bg-card">
        <SketchLayerPanel scene={scene} controller={controller} className="h-full bg-transparent" />
      </aside>

      <section className="relative min-h-0 overflow-hidden border-r border-border bg-[#1f1f1f]">
        <SketchEditorCanvas
          scene={scene}
          controller={controller}
          configData={configData}
          previewSize={previewSize}
          className="h-full bg-[#1f1f1f] px-8 pb-28 pt-12"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <SketchEditorToolbar scene={scene} controller={controller} configData={configData} className="pointer-events-auto" />
        </div>

        {devPanelOpen ? (
          <div className="absolute bottom-24 left-8 right-8 z-20 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex h-11 items-center gap-2 border-b border-border px-3">
              {(["scene", "config", "metrics", "debug"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`h-7 rounded-sm px-3 text-xs transition-colors ${
                    devPanelTab === tab ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setDevPanelTab(tab)}
                >
                  {tab === "scene" ? "Scene JSON" : tab === "config" ? "Config Data" : tab === "metrics" ? "Metrics" : "Debug"}
                </button>
              ))}
              <button
                type="button"
                className="ml-auto h-7 rounded-sm px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setDevPanelOpen(false)}
              >
                Close
              </button>
            </div>

            {devPanelTab === "scene" ? (
              <div className="grid max-h-80 grid-rows-[minmax(0,1fr)_auto] gap-2 p-3">
                <textarea
                  aria-label="scene-json"
                  className="h-56 w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                  value={sceneJson}
                  onChange={(event) => setSceneJson(event.target.value)}
                />
                <button type="button" className="h-9 rounded-md border border-border bg-background text-sm transition-colors hover:bg-accent" onClick={applySceneJson}>
                  Apply Scene
                </button>
              </div>
            ) : null}

            {devPanelTab === "config" ? (
              <div className="grid max-h-80 grid-rows-[minmax(0,1fr)_auto] gap-2 p-3">
                <textarea
                  aria-label="config-json"
                  className="h-56 w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                  value={configJson}
                  onChange={(event) => setConfigJson(event.target.value)}
                />
                <button type="button" className="h-9 rounded-md border border-border bg-background text-sm transition-colors hover:bg-accent" onClick={applyConfigJson}>
                  Apply Config
                </button>
              </div>
            ) : null}

            {devPanelTab === "metrics" ? (
              <div className="grid gap-3 p-3 text-xs text-muted-foreground">
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="nodes" value={String(scene.nodes.length)} />
                  <Metric label="hash" value={String(getSketchSceneHashSource(scene, configData).length)} />
                  <Metric label="validation" value={validation.valid ? "valid" : "invalid"} />
                </div>
                {perf.length ? (
                  <table className="w-full border-collapse overflow-hidden rounded-md text-xs">
                    <thead>
                      <tr className="bg-background text-left text-muted-foreground">
                        <th className="border border-border p-2">nodes</th>
                        <th className="border border-border p-2">render ms</th>
                        <th className="border border-border p-2">selection ms</th>
                        <th className="border border-border p-2">property panel ms</th>
                        <th className="border border-border p-2">hit test ms</th>
                        <th className="border border-border p-2">drag ms</th>
                        <th className="border border-border p-2">input ms</th>
                        <th className="border border-border p-2">translate ms</th>
                        <th className="border border-border p-2">path render ms</th>
                        <th className="border border-border p-2">hash len</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perf.map((row) => (
                        <tr key={row.count}>
                          <td className="border border-border p-2 text-foreground">{row.count}</td>
                          <td className="border border-border p-2 text-foreground">{row.renderMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.selectionMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.propertyPanelMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.hitTestMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.dragMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.inputMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.translateMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.pathRenderMs}</td>
                          <td className="border border-border p-2 text-foreground">{row.hashLength}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="rounded-md border border-border bg-background p-3">Run Performance to refresh the baseline.</div>
                )}
              </div>
            ) : null}

            {devPanelTab === "debug" ? (
              <div className="grid max-h-80 grid-cols-[240px_minmax(0,1fr)] gap-3 overflow-hidden p-3 text-xs text-muted-foreground">
                <div className="grid content-start gap-3">
                  <Metric label="tool" value={controller.tool} />
                  <Metric label="selection" value={controller.selection.nodeIds.length ? controller.selection.nodeIds.join(", ") : "none"} />
                  <Metric label="draft state" value="idle" />
                  <Metric label="last change" value={lastSceneSummary} />
                  <Metric label="node count" value={String(scene.nodes.length)} />
                </div>
                <div className="min-h-0 overflow-auto rounded-md border border-border bg-background">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-card text-left text-muted-foreground">
                        <th className="border-b border-border p-2">id</th>
                        <th className="border-b border-border p-2">type</th>
                        <th className="border-b border-border p-2">name/text</th>
                        <th className="border-b border-border p-2">state</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scene.nodes.slice(0, 60).map((node) => (
                        <tr key={node.id}>
                          <td className="border-t border-border p-2 font-mono text-foreground">{node.id}</td>
                          <td className="border-t border-border p-2 text-foreground">{node.type}</td>
                          <td className="border-t border-border p-2 text-foreground">{node.name ?? node.text ?? node.alt ?? ""}</td>
                          <td className="border-t border-border p-2 text-foreground">
                            {[
                              node.locked ? "locked" : "",
                              node.visible === false ? "hidden" : "",
                              node.bindings ? "bound" : "",
                            ].filter(Boolean).join(", ") || "editable"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="min-h-0 bg-card">
        <SketchPropertyPanel scene={scene} controller={controller} configData={configData} className="h-full bg-transparent" />
      </aside>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}
