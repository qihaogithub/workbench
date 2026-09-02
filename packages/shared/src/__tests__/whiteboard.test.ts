import { describe, expect, it } from "vitest";
import {
  asWhiteboardDocumentV2,
  asWhiteboardDocumentV3,
  isWhiteboardBinding,
  isWhiteboardDocument,
  isWhiteboardDocumentV3,
  type WhiteboardDocumentV3,
} from "../whiteboard";

function createV3Document(): WhiteboardDocumentV3 {
  return {
    id: "wb_full",
    version: 3,
    sceneFormat: "sketch-scene-v1",
    documentRevision: 4,
    scene: {
      version: 1,
      pageSize: { width: 400, height: 300 },
      nodes: [
        {
          id: "diamond",
          type: "diamond",
          x: 20,
          y: 30,
          width: 100,
          height: 80,
          name: "完整节点",
          path: "M 0 0 L 10 10",
          style: { italic: true, textDecoration: "underline", lineDash: [2, 2] },
          metadata: { source: "test" },
        },
      ],
      assets: [{ id: "source", type: "image", src: "assets/source.png" }],
      bindings: { title: { text: "标题" } },
      metadata: { source: "whiteboard" },
    },
    nodeSemantics: {},
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt: 1,
  };
}

describe("shared whiteboard document contract", () => {
  it("accepts full V3 scenes and does not use the bridge node allowlist", () => {
    const document = createV3Document();
    expect(isWhiteboardDocument(document)).toBe(true);
    expect(isWhiteboardDocumentV3(document)).toBe(true);
    expect(document.scene.assets).toHaveLength(1);
    expect(document.scene.metadata).toEqual({ source: "whiteboard" });
  });

  it("keeps complete scene fields when upgrading or projecting a document", () => {
    const document = createV3Document();
    const v2 = asWhiteboardDocumentV2(document);
    expect(v2.version).toBe(2);
    expect(v2.documentRevision).toBe(4);
    expect(v2.scene).toEqual(document.scene);

    const upgraded = asWhiteboardDocumentV3(v2);
    expect(upgraded).toEqual(document);
  });

  it("validates the V3 document version on bindings without breaking legacy bindings", () => {
    const binding = {
      id: "binding_1",
      target: { scope: "project" as const, fieldPath: ["image"] as const },
      whiteboardId: "wb_full",
      documentRevisionAtOutput: 4,
      documentVersion: 3 as const,
      outputAssetHash: "a".repeat(64),
      updatedAt: 1,
    };
    expect(isWhiteboardBinding(binding)).toBe(true);
    expect(isWhiteboardBinding({ ...binding, documentVersion: 99 })).toBe(false);
    expect(isWhiteboardBinding({ ...binding, documentVersion: undefined })).toBe(true);
  });
});
