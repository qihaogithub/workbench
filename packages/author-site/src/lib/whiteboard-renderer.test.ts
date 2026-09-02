import sharp from "sharp";
import {
  renderSketchSceneToSvgMarkup,
  type SketchSceneDocument,
} from "@workbench/sketch-core";
import type { WhiteboardDocumentV3 } from "@workbench/shared";
import { getImage } from "./image-store";
import {
  renderWhiteboardDocumentToPng,
  WhiteboardRenderError,
} from "./whiteboard-renderer";

jest.mock("./image-store", () => ({
  getImage: jest.fn(),
}));

const mockedGetImage = jest.mocked(getImage);

async function sourcePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 220, g: 38, b: 127, alpha: 1 },
    },
  }).png().toBuffer();
}

function fullDocument(scene: SketchSceneDocument): WhiteboardDocumentV3 {
  return {
    id: "wb_renderer",
    version: 3,
    sceneFormat: "sketch-scene-v1",
    documentRevision: 0,
    scene,
    nodeSemantics: { image: { assetRef: "img_renderer" } },
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt: 1,
  };
}

describe("whiteboard server renderer", () => {
  beforeEach(async () => {
    mockedGetImage.mockReturnValue({
      buffer: await sourcePng(),
      mimeType: "image/png",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the complete V3 scene and reports every visible image asset", async () => {
    const scene: SketchSceneDocument = {
      version: 1,
      pageSize: { width: 240, height: 160 },
      nodes: [
        {
          id: "image",
          type: "image",
          x: 24,
          y: 20,
          width: 80,
          height: 80,
          src: "/api/images/img_renderer",
          rotation: 12,
          style: { imageFit: "contain", opacity: 0.8, stroke: "#111827", strokeWidth: 2 },
          imageCrop: {
            shape: "circle",
            sourceRect: { x: -0.1, y: 0.05, width: 0.8, height: 0.8 },
            originalFrame: { x: 24, y: 20, width: 80, height: 80 },
            originalImageFit: "contain",
          },
          name: "完整图片",
        },
        {
          id: "diamond",
          type: "diamond",
          x: 130,
          y: 20,
          width: 70,
          height: 60,
          text: "保留文本",
          path: "M 0 0 L 10 10",
          style: { fill: "#bfdbfe", italic: true, textDecoration: "underline" },
          metadata: { source: "manual-edit" },
        },
        {
          id: "path",
          type: "path",
          x: 20,
          y: 120,
          width: 100,
          height: 20,
          path: "M 20 130 L 120 130",
          points: [{ x: 20, y: 130 }, { x: 120, y: 130 }],
        },
      ],
      assets: [{ id: "library-image", type: "image", src: "assets/library.png" }],
      bindings: { image: { src: "heroImage" } },
      metadata: { source: "whiteboard" },
    };

    const result = await renderWhiteboardDocumentToPng(fullDocument(scene));
    const metadata = await sharp(result.png).metadata();
    const pixels = await sharp(result.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const centerOffset = (60 * 240 + 64) * 4;

    expect(metadata).toMatchObject({ format: "png", width: 240, height: 160 });
    expect(pixels.data[centerOffset]).toBeGreaterThan(150);
    expect(pixels.data[centerOffset + 1]).toBeLessThan(180);
    expect(pixels.data[centerOffset + 2]).toBeGreaterThan(80);
    expect(result.manifest).toEqual([
      { nodeId: "image", assetRef: "img_renderer", sourceBytes: expect.any(Number) },
    ]);
    expect(result.rendererVersion).toBe("sketch-scene-svg-v1");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mockedGetImage).toHaveBeenCalledWith("img_renderer");
  });

  it("fails closed for a missing visible asset instead of rendering a blank fallback", async () => {
    mockedGetImage.mockReturnValue({ error: "Image blob file missing" });
    const document = fullDocument({
      version: 1,
      pageSize: { width: 100, height: 100 },
      nodes: [{ id: "image", type: "image", x: 0, y: 0, width: 100, height: 100, src: "/api/images/img_renderer" }],
    });

    await expect(renderWhiteboardDocumentToPng(document)).rejects.toMatchObject<Partial<WhiteboardRenderError>>({
      code: "IMAGE_ASSET_MISSING",
      nodeId: "image",
    });
  });

  it("throws on invalid scenes rather than replacing them with the default scene", () => {
    expect(() => renderSketchSceneToSvgMarkup({
      version: 1,
      pageSize: { width: 100, height: 100 },
      nodes: [{ id: "invalid", type: "path", x: 0, y: 0, width: 10, height: 10, path: "" }],
    })).toThrow("Sketch scene cannot be rendered");
  });
});
