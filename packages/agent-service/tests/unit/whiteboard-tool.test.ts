import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWhiteboardCode } from "@workbench/whiteboard-core";
import type { AgentConfig } from "../../src/core/types";
import {
  createApplyWhiteboardActionsTool,
  createPlanWhiteboardCompositionTool,
  createReadWhiteboardContextTool,
  createUndoWhiteboardEditTool,
} from "../../src/backends/pi-tools/whiteboard-tool";

const html = `<main data-sketch-canvas="v1" data-width="120" data-height="80"><div data-sketch-id="box" data-sketch-kind="rect" data-sketch-role="subject"></div></main>`;
const css = `[data-sketch-id="box"] { left:0px; top:0px; width:20px; height:20px; }`;

describe("whiteboard agent tools", () => {
  let workspaceDir: string;
  let config: AgentConfig;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "whiteboard-tool-"));
    await fs.mkdir(path.join(workspaceDir, "whiteboards"), { recursive: true });
    const document = parseWhiteboardCode(html, css, { id: "wb_1" }).value!;
    await fs.writeFile(path.join(workspaceDir, "whiteboards", "wb_1.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
    config = { sessionId: "session-1", workingDir: workspaceDir };
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("returns selection and safe-area constraints without writing", async () => {
    const document = JSON.parse(await fs.readFile(path.join(workspaceDir, "whiteboards", "wb_1.json"), "utf8"));
    document.safeArea = { x: 0, y: 0, width: 100, height: 60 };
    await fs.writeFile(path.join(workspaceDir, "whiteboards", "wb_1.json"), JSON.stringify(document), "utf8");
    const context = await createReadWhiteboardContextTool(config).execute("read-1", { whiteboardId: "wb_1", nodeIds: ["box"] });
    expect(context.isError).toBeFalsy();
    expect(context.details.context.selection).toEqual({ nodeIds: ["box"], bounds: { x: 0, y: 0, width: 20, height: 20 } });
    const plan = await createPlanWhiteboardCompositionTool(config).execute("plan-1", { whiteboardId: "wb_1", intent: "move subject", nodeIds: ["box"] });
    expect(plan.details.plan).toMatchObject({ requiresConfirmation: true, constraints: { safeAreaEnforced: true, coordinateSpace: "page-px" } });
  });

  it("returns an unpersisted host-commit draft and keeps durable revision unchanged", async () => {
    const permission = async () => true;
    const apply = createApplyWhiteboardActionsTool(config, permission);
    const applied = await apply.execute("apply-1", { whiteboardId: "wb_1", baseDocumentRevision: 0, actions: [{ type: "updateNode", nodeId: "box", patch: { x: 10 } }] });
    expect(applied.isError).toBeFalsy();
    expect(applied.details.requiresHostCommit).toBe(true);
    expect(applied.details.draft.documentRevision).toBe(1);
    expect(applied.details.draft.scene.nodes[0].x).toBe(10);
    const saved = JSON.parse(await fs.readFile(path.join(workspaceDir, "whiteboards", "wb_1.json"), "utf8"));
    expect(saved.documentRevision).toBe(0);
    expect(saved.scene.nodes[0].x).toBe(0);
    const undo = createUndoWhiteboardEditTool(config, permission);
    const undone = await undo.execute("undo-1", { whiteboardId: "wb_1", baseDocumentRevision: 1 });
    expect(undone.isError).toBe(true);
    expect(undone.details.error).toBe("host_draft_required");
  });

  it("does not write an action when confirmation is unavailable", async () => {
    const result = await createApplyWhiteboardActionsTool(config).execute("apply-2", { whiteboardId: "wb_1", baseDocumentRevision: 0, actions: [{ type: "updateNode", nodeId: "box", patch: { x: 10 } }] });
    expect(result.isError).toBeFalsy();
    expect(result.details.requiresHostCommit).toBe(true);
    const saved = JSON.parse(await fs.readFile(path.join(workspaceDir, "whiteboards", "wb_1.json"), "utf8"));
    expect(saved.documentRevision).toBe(0);
    expect(saved.scene.nodes[0].x).toBe(0);
  });

  it("applies actions to a UI-created native V3 document and preserves its metadata", async () => {
    const documentPath = path.join(workspaceDir, "whiteboards", "wb_1.json");
    const document = JSON.parse(await fs.readFile(documentPath, "utf8"));
    document.version = 3;
    document.sceneFormat = "sketch-scene-v1";
    document.scene.metadata = { createdBy: "system" };
    document.scene.bindings = { title: { field: "title" } };
    document.scene.assets = [{ id: "source", type: "image", src: "assets/source.png" }];
    await fs.writeFile(documentPath, JSON.stringify(document), "utf8");

    const result = await createApplyWhiteboardActionsTool(config).execute("apply-native-v3", {
      whiteboardId: "wb_1",
      baseDocumentRevision: 0,
      actions: [{ type: "updateNode", nodeId: "box", patch: { x: 10 } }],
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.draft).toMatchObject({
      version: 3,
      sceneFormat: "sketch-scene-v1",
      scene: {
        metadata: document.scene.metadata,
        bindings: document.scene.bindings,
        assets: document.scene.assets,
      },
    });
    const saved = JSON.parse(await fs.readFile(documentPath, "utf8"));
    expect(saved.documentRevision).toBe(0);
  });

  it("rejects placing an asset that was not generated or already attached", async () => {
    const documentPath = path.join(workspaceDir, "whiteboards", "wb_1.json");
    const document = JSON.parse(await fs.readFile(documentPath, "utf8"));
    document.scene.nodes.push({ id: "hero", type: "image", x: 0, y: 20, width: 20, height: 20, src: "/api/images/existing" });
    await fs.writeFile(documentPath, JSON.stringify(document), "utf8");
    const permission = async () => true;
    const result = await createApplyWhiteboardActionsTool(config, permission).execute("apply-3", {
      whiteboardId: "wb_1",
      baseDocumentRevision: 0,
      actions: [{ type: "placeAsset", nodeId: "hero", assetId: "img_unknown", src: "/api/images/img_unknown" }],
    });
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("asset_candidate_required");
  });

  it("keeps translated image crop coordinates in the host-commit draft", async () => {
    const documentPath = path.join(workspaceDir, "whiteboards", "wb_1.json");
    const document = JSON.parse(await fs.readFile(documentPath, "utf8"));
    document.scene.nodes.push({
      id: "hero",
      type: "image",
      x: 20,
      y: 20,
      width: 60,
      height: 40,
      src: "assets/hero.png",
    });
    await fs.writeFile(documentPath, JSON.stringify(document), "utf8");

    const result = await createApplyWhiteboardActionsTool(config).execute("apply-crop", {
      whiteboardId: "wb_1",
      baseDocumentRevision: 0,
      actions: [{
        type: "setImageCrop",
        nodeId: "hero",
        crop: {
          shape: "rect",
          sourceRect: { x: -0.2, y: -0.1, width: 0.6, height: 0.5 },
          originalFrame: { x: 20, y: 20, width: 60, height: 40 },
          originalImageFit: "contain",
        },
      }],
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.draft.scene.nodes.find((node: { id: string }) => node.id === "hero")).toMatchObject({
      imageCrop: { sourceRect: { x: -0.2, y: -0.1, width: 0.6, height: 0.5 } },
    });
  });
});
