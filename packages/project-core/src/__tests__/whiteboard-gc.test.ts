import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { planWhiteboardGarbageCollection } from "../whiteboard-gc";

const workspaces: string[] = [];
const now = 1_800_000_000_000;
const old = now - 8 * 24 * 60 * 60 * 1000;

function document(id: string, updatedAt = old) {
  return {
    id,
    version: 1,
    scene: { version: 1, pageSize: { width: 800, height: 600 }, nodes: [] },
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt,
  };
}

function documentWithAttachedWhiteboardPng(id: string, hash: string, updatedAt = old) {
  return {
    id,
    version: 2,
    documentRevision: 1,
    scene: {
      version: 1,
      pageSize: { width: 800, height: 600 },
      nodes: [{ id: "image", type: "image", x: 0, y: 0, width: 100, height: 100, src: `assets/whiteboards/${hash}.png` }],
      assets: [],
      bindings: {},
      metadata: {},
    },
    nodeSemantics: { image: { assetRef: "managed_image" } },
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt,
  };
}

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-gc-"));
  workspaces.push(root);
  fs.mkdirSync(path.join(root, "whiteboards"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets", "whiteboards"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of workspaces.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("planWhiteboardGarbageCollection", () => {
  it("only cleans aged, unbound documents and PNGs with no config reference", () => {
    const root = workspace();
    const orphanHash = "a".repeat(64);
    const referencedHash = "b".repeat(64);
    const boundHash = "c".repeat(64);
    fs.writeFileSync(path.join(root, "whiteboards", "wb_orphan.json"), JSON.stringify(document("wb_orphan")));
    fs.writeFileSync(path.join(root, "whiteboards", "wb_fresh.json"), JSON.stringify(document("wb_fresh", now - 1)));
    fs.writeFileSync(path.join(root, "whiteboards", "wb_bound.json"), JSON.stringify(document("wb_bound")));
    fs.writeFileSync(path.join(root, "whiteboards", "bindings.json"), JSON.stringify({ bindings: [{
      id: "binding", target: { scope: "project", fieldPath: ["logo"] }, whiteboardId: "wb_bound", sceneRevision: 1, outputAssetHash: boundHash, updatedAt: now,
    }] }));
    for (const hash of [orphanHash, referencedHash, boundHash]) {
      const asset = path.join(root, "assets", "whiteboards", `${hash}.png`);
      fs.writeFileSync(asset, "png");
      fs.utimesSync(asset, old / 1000, old / 1000);
    }
    fs.writeFileSync(path.join(root, "project.config.values.json"), JSON.stringify({ logo: `assets/whiteboards/${referencedHash}.png` }));

    expect(planWhiteboardGarbageCollection(root, now)).toEqual({
      documentPaths: ["whiteboards/wb_orphan.json"],
      assetPaths: [`assets/whiteboards/${orphanHash}.png`],
    });
  });

  it("fails closed when the binding index is present but malformed", () => {
    const root = workspace();
    fs.writeFileSync(path.join(root, "whiteboards", "wb_orphan.json"), JSON.stringify(document("wb_orphan")));
    fs.writeFileSync(path.join(root, "whiteboards", "bindings.json"), JSON.stringify({ bindings: [{ id: "broken" }] }));
    expect(planWhiteboardGarbageCollection(root, now)).toEqual({ documentPaths: [], assetPaths: [] });
  });

  it("protects an attached whiteboard PNG referenced by any valid document", () => {
    const root = workspace();
    const attachedHash = "d".repeat(64);
    const orphanHash = "e".repeat(64);
    fs.writeFileSync(path.join(root, "whiteboards", "wb_attached.json"), JSON.stringify(documentWithAttachedWhiteboardPng("wb_attached", attachedHash, now - 1)));
    fs.writeFileSync(path.join(root, "whiteboards", "bindings.json"), JSON.stringify({ bindings: [] }));
    for (const hash of [attachedHash, orphanHash]) {
      const asset = path.join(root, "assets", "whiteboards", `${hash}.png`);
      fs.writeFileSync(asset, "png");
      fs.utimesSync(asset, old / 1000, old / 1000);
    }

    expect(planWhiteboardGarbageCollection(root, now)).toEqual({
      documentPaths: [],
      assetPaths: [`assets/whiteboards/${orphanHash}.png`],
    });
  });

  it("collects an aged orphan PNG even when no document has aged out", () => {
    const root = workspace();
    const orphanHash = "f".repeat(64);
    fs.writeFileSync(path.join(root, "whiteboards", "bindings.json"), JSON.stringify({ bindings: [] }));
    const asset = path.join(root, "assets", "whiteboards", `${orphanHash}.png`);
    fs.writeFileSync(asset, "png");
    fs.utimesSync(asset, old / 1000, old / 1000);

    expect(planWhiteboardGarbageCollection(root, now)).toEqual({
      documentPaths: [],
      assetPaths: [`assets/whiteboards/${orphanHash}.png`],
    });
  });

  it("fails closed when a document cannot be verified before PNG cleanup", () => {
    const root = workspace();
    const orphanHash = "0".repeat(64);
    fs.writeFileSync(path.join(root, "whiteboards", "unknown.json"), "not json");
    fs.writeFileSync(path.join(root, "whiteboards", "bindings.json"), JSON.stringify({ bindings: [] }));
    const asset = path.join(root, "assets", "whiteboards", `${orphanHash}.png`);
    fs.writeFileSync(asset, "png");
    fs.utimesSync(asset, old / 1000, old / 1000);

    expect(planWhiteboardGarbageCollection(root, now)).toEqual({ documentPaths: [], assetPaths: [] });
  });
});
